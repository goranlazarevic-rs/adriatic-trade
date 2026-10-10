import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Isolated D1-compatible SQLite transactions and synthetic external services only.
const source = fs.readFileSync('worker/adriatic-trade-worker-v4.5.0.js', 'utf8').replace('export default', 'const worker =');
const png = Uint8Array.from([137,80,78,71,13,10,26,10,0]);
export const ips = 'Lična dostava — IPS na račun';
export const bank = 'Lična dostava — uplata na račun';
export const cash = 'Lična dostava — gotovina';
export const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
export const schedule = {date:'2099-01-01',timeWindow:'17–19h',location:'Test 1'};
export const proof = {paymentConfirmed:'yes',remittanceDate:today,paymentReference:'IZVOD-42 / uplata 3'};

export function harness() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync('cloudflare-d1-schema-v1.sql', 'utf8'));
  const db = { prepare(query) {
    const stmt = sql.prepare(query); let args = [];
    return { bind(...values) { args=values; return this; }, async run() { return {meta:{changes:Number(stmt.run(...args).changes)}}; },
      async first() {return stmt.get(...args)||null;}, async all() {return {results:stmt.all(...args)};} };
  }, async batch(stmts) {if(state.onCommit){const hook=state.onCommit;state.onCommit=null;hook();}sql.exec('BEGIN');try {const r=[];for(const s of stmts)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}} };
  const state={qr:'ok',email:'ok',emails:[],emailKeys:[],qrRequests:[],timeoutMs:[],onEmail:null,onCommit:null,turnstile:{success:true,action:'checkout_order',hostname:'adriatictrade.rs'}};
  const fetch=async (url, options) => {
    if(url==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return new Response(JSON.stringify(state.turnstile),{headers:{'Content-Type':'application/json'}});
    if (url.startsWith('https://nbs.rs/')) {
      state.qrRequests.push(JSON.parse(options.body));
      if (state.qr==='error') return new Response('unavailable', {status:503});
      if (state.qr==='throw') throw new Error('synthetic network failure');
      if (state.qr==='timeout') return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('synthetic abort')), {once:true}));
      if (state.qr==='wrong-type') return new Response('{}',{headers:{'Content-Type':'application/json'}});
      if (state.qr==='bad-png') return new Response('invalid',{headers:{'Content-Type':'image/png'}});
      return new Response(png,{headers:{'Content-Type':'image/png'}});
    }
    if(url==='https://api.resend.com/emails') {
      state.emails.push(JSON.parse(options.body));state.emailKeys.push(options.headers["Idempotency-Key"]);
      if(state.onEmail) state.onEmail();
      return new Response(JSON.stringify({id:'synthetic'}),{status:state.email==='ok'?200:503,headers:{'Content-Type':'application/json'}});
    }
    throw new Error('Unexpected external request: '+url);
  };
  const receiptFiles=new Map();
  const receipts={async put(key,buffer,metadata){receiptFiles.set(key,{buffer,metadata});},async delete(key){receiptFiles.delete(key);},async get(key){const file=receiptFiles.get(key);return file?{async arrayBuffer(){return file.buffer;},body:file.buffer,httpMetadata:file.metadata?.httpMetadata}:null;}};
  const ctx=vm.createContext({Request,Response,Headers,URL,FormData,console:{error(){},warn(){},log(){}},Intl,Date,crypto,TextEncoder,AbortController,btoa,fetch,
    setTimeout(fn,ms){state.timeoutMs.push(ms);return setTimeout(fn,state.qr==='timeout'?5:ms);},clearTimeout});
  vm.runInContext(source,ctx);ctx.env={DB:db,RECEIPTS:receipts,ADMIN_TOKEN:'synthetic-admin-token-for-tests-only',RESEND_API_KEY:'synthetic'};
  vm.runInContext('globalThis.run=request=>worker.fetch(request,env);globalThis.insert=order=>insertOrder(env.DB,order);',ctx);
  const call=(id,action='',body,method=body===undefined?'GET':'POST')=>{
    const headers={Origin:'https://adriatictrade.rs',Authorization:'Bearer synthetic-admin-token-for-tests-only'};
    const init={method,headers};
    if(body instanceof FormData) init.body=body;
    else if(body!==undefined){headers['Content-Type']='application/json';init.body=JSON.stringify(body);}
    return ctx.run(new Request(`https://test/admin/orders/${id}${action?'/'+action:''}`,init));
  };
  const get=async id=>(await (await call(id)).json()).order;
  const add=async(id='AT-20261010-ABCD',options={})=>{
    await ctx.insert({id,submissionId:id,createdAt:'2026-10-10T10:00:00Z',customer:{firstName:'Test',lastName:'Kupac',email:'test@example.com',phone:'060000000'},
      delivery:{method:'Dostava na adresu',address:'Test 1',postalCode:'21000',city:'Novi Sad'},payment:'Pouzećem',items:[{sku:'10306',name:'So',qty:2,unitPrice:299,lineTotal:598}],goodsTotal:598,shipping:420,total:1018});
    await get(id); // Initialize operations schema and row.
    if(options.local!==false) assert.equal((await call(id,'local-delivery',{},'POST')).status,200);
    if(options.payment) sql.prepare('UPDATE orders SET payment=? WHERE id=?').run(options.payment,id);
    if(options.status) sql.prepare('UPDATE orders SET status=? WHERE id=?').run(options.status,id);
    if(options.operations) sql.prepare('UPDATE order_operations SET data_json=? WHERE order_id=?').run(JSON.stringify(options.operations),id);
    return id;
  };
  const delivered=(id,body={})=>{const fd=new FormData();for(const[k,v]of Object.entries(body))fd.set(k,v);return call(id,'local-delivered',fd);};
  const operations=async(id,body)=>call(id,'operations',{revision:(await get(id)).operationsRevision,reason:'Regresiona provera',...body});
  return {sql,db,ctx,state,call,get,add,delivered,operations,receiptFiles,receipts};
}

