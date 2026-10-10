import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

// Isolated D1-compatible SQLite transactions and synthetic external services only.
const source = fs.readFileSync('worker/adriatic-trade-worker-v4.5.0.js', 'utf8').replace('export default', 'const worker =');
const png = Uint8Array.from([137,80,78,71,13,10,26,10,0]);
const ips = 'Lična dostava — IPS na račun';
const bank = 'Lična dostava — uplata na račun';
const cash = 'Lična dostava — gotovina';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
const schedule = {date:'2099-01-01',timeWindow:'17–19h',location:'Test 1'};
const proof = {paymentConfirmed:'yes',remittanceDate:today,paymentReference:'IZVOD-42 / uplata 3'};

function harness() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync('cloudflare-d1-schema-v1.sql', 'utf8'));
  const db = { prepare(query) {
    const stmt = sql.prepare(query); let args = [];
    return { bind(...values) { args=values; return this; }, async run() { return {meta:{changes:Number(stmt.run(...args).changes)}}; },
      async first() {return stmt.get(...args)||null;}, async all() {return {results:stmt.all(...args)};} };
  }, async batch(stmts) {sql.exec('BEGIN');try {const r=[];for(const s of stmts)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}} };
  const state={qr:'ok',email:'ok',emails:[],qrRequests:[],timeoutMs:[],onEmail:null};
  const fetch=async (url, options) => {
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
      state.emails.push(JSON.parse(options.body));
      if(state.onEmail) state.onEmail();
      return new Response(JSON.stringify({id:'synthetic'}),{status:state.email==='ok'?200:503,headers:{'Content-Type':'application/json'}});
    }
    throw new Error('Unexpected external request: '+url);
  };
  const ctx=vm.createContext({Request,Response,Headers,URL,FormData,console:{error(){}},Intl,Date,crypto,TextEncoder,AbortController,btoa,fetch,
    setTimeout(fn,ms){state.timeoutMs.push(ms);return setTimeout(fn,state.qr==='timeout'?5:ms);},clearTimeout});
  vm.runInContext(source,ctx);ctx.env={DB:db,ADMIN_TOKEN:'synthetic-admin-token-for-tests-only',RESEND_API_KEY:'synthetic'};
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
  return {sql,db,ctx,state,call,get,add,delivered,operations};
}

function regression(name,fn){test(name,fn);}
regression('approval uses IPS, free shipping, identical transfer/QR fields and unpaid state',async()=>{
  const h=harness(),id=await h.add(),o=await h.get(id);
  assert.equal(o.payment,ips);assert.equal(o.shipping,0);assert.equal(o.total,598);assert.equal(o.operations.paymentStatus,'unpaid');
  const b=o.bankTransfer;assert.equal(b.account,'265201031001135831');assert.equal(b.model,'00');assert.equal(b.amount,598);assert.equal(b.reference,'20261010');
  assert.equal((await h.call(id,'confirm',{})).status,200);
  const fields=h.state.qrRequests[0];assert.equal(fields.RO,b.model+b.reference);assert.equal(fields.S,b.purpose);assert.equal(fields.SF,b.paymentCode);assert.equal(fields.I,'RSD598,00');
  assert.equal((await h.get(id)).operations.paymentStatus,'unpaid');
});
regression('cash and unrecognized methods are rejected with no payment/history changes',async()=>{
  const h=harness(),id=await h.add(),before=await h.get(id);
  for(const method of ['cash','Cash','card','',null,{}]) assert.equal((await h.call(id,'local-payment',{method})).status,400);
  assert.deepEqual(await h.get(id),before);assert.equal(h.state.emails.length,0);
});
regression('explicit bank transfer requires no NBS service; confirmation includes complete instructions',async()=>{
  const h=harness(),id=await h.add();h.state.qr='throw';
  assert.equal((await h.call(id,'local-payment',{method:'bank_transfer'})).status,200);
  assert.equal((await h.call(id,'confirm',{})).status,200);
  assert.equal(h.state.qrRequests.length,0);const email=h.state.emails[0];
  assert.equal(email.attachments.length,2);assert.match(email.html,/265201031001135831/);assert.match(email.html,/Poziv na broj/);assert.match(email.html,/Šifra plaćanja/);assert.doesNotMatch(email.html,/PNG slika|gotovinom|Plaćanje ostaje/);
  assert.equal((await h.get(id)).payment,bank);
});
for(const mode of ['error','throw','timeout','wrong-type','bad-png']) regression(`QR ${mode}: confirms with transfer fallback, no false attachment or paid status`,async()=>{
  const h=harness(),id=await h.add();h.state.qr=mode;
  assert.equal((await h.call(id,'confirm',{})).status,200);
  const email=h.state.emails[0];assert.equal(email.attachments.length,2);assert.match(email.html,/IPS QR trenutno nije dostupan/);assert.match(email.html,/265201031001135831/);assert.doesNotMatch(email.html,/U prilogu je PNG/);
  const o=await h.get(id);assert.equal(o.status,'confirmed');assert.equal(o.operations.paymentStatus,'unpaid');assert.equal(o.payment,ips);assert.match(o.events.at(-1).note,/bez QR priloga/);
  assert.ok(h.state.timeoutMs.includes(5000));
});
regression('working IPS attaches QR and also supplies ordinary bank transfer instructions',async()=>{
  const h=harness(),id=await h.add();assert.equal((await h.call(id,'confirm',{})).status,200);
  const email=h.state.emails[0];assert.equal(email.attachments.length,3);assert.ok(email.attachments[2].filename.endsWith('.png'));assert.equal(email.attachments[2].content,Buffer.from(png).toString('base64'));assert.match(email.html,/U prilogu je PNG/);assert.match(email.html,/265201031001135831/);
  assert.equal((await h.call(id,'confirm',{})).status,200);assert.equal(h.state.emails.length,1);
});
regression('email failure keeps order unconfirmed even with QR fallback',async()=>{
  const h=harness(),id=await h.add(),before=await h.get(id);h.state.qr='error';h.state.email='error';
  assert.equal((await h.call(id,'confirm',{})).status,502);assert.deepEqual(await h.get(id),before);
});
regression('QR download outage exposes fallback message; instructions remain accessible',async()=>{
  const h=harness(),id=await h.add();h.state.qr='error';const r=await h.call(id,'ips-qr');assert.equal(r.status,502);assert.match((await r.json()).error,/uplatu na račun/);assert.ok((await h.get(id)).bankTransfer.account);
  h.state.qr='ok';const ok=await h.call(id,'ips-qr');assert.equal(ok.status,200);assert.equal(ok.headers.get('Content-Type'),'image/png');
});
regression('legacy cash blocks confirmation, schedule, delivery and new paid operations',async()=>{
  const h=harness(),id=await h.add(undefined,{payment:cash});
  assert.equal((await h.call(id,'confirm',{})).status,409);assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,409);
  h.sql.prepare("UPDATE orders SET status='confirmed' WHERE id=?").run(id);
  const before=await h.get(id);assert.equal((await h.call(id,'local-schedule',schedule)).status,409);
  assert.equal((await h.delivered(id,proof)).status,409);assert.deepEqual(await h.get(id),before);assert.equal(h.state.emails.length,0);
});
regression('unpaid confirmed legacy cash converts explicitly, notifies buyer and preserves prior events',async()=>{
  const h=harness(),id=await h.add(undefined,{payment:cash,status:'confirmed'}),before=await h.get(id);
  assert.equal((await h.call(id,'local-payment',{method:'bank_transfer'})).status,200);
  const after=await h.get(id);assert.equal(after.payment,bank);assert.deepEqual(after.events.slice(0,before.events.length),before.events);assert.match(after.events.at(-1).note,/gotovina →/);
  assert.equal(after.operations.paymentStatus,'unpaid');assert.match(h.state.emails[0].html,/265201031001135831/);assert.match(h.state.emails[0].subject,/Uputstvo/);
});
regression('failed amendment email leaves legacy cash and history untouched',async()=>{
  const h=harness(),id=await h.add(undefined,{payment:cash,status:'confirmed'}),before=await h.get(id);h.state.email='error';
  assert.equal((await h.call(id,'local-payment',{method:'ips'})).status,502);assert.deepEqual(await h.get(id),before);
});
regression('completed legacy cash history is preserved and delivery retry does not create payment',async()=>{
  const h=harness(),id=await h.add(undefined,{payment:cash,status:'shipped',operations:{fulfillment:'delivered',paymentStatus:'paid',paymentReference:'istorijska gotovina'}}),before=await h.get(id);
  assert.equal((await h.call(id,'local-payment',{method:'ips'})).status,409);
  assert.equal((await h.delivered(id)).status,200);assert.deepEqual(await h.get(id),before);assert.equal(h.state.emails.length,0);
});
regression('local delivery needs checked bank verification, valid date and statement reference',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed'});assert.equal((await h.call(id,'local-schedule',schedule)).status,200);
  const before=await h.get(id);h.state.emails=[];
  for(const body of [{},{paymentConfirmed:'yes'},{...proof,paymentConfirmed:'no'},{...proof,remittanceDate:'2099-01-01'},{...proof,remittanceDate:'2026-02-30'},{...proof,paymentReference:'  '}])assert.equal((await h.delivered(id,body)).status,409);
  assert.deepEqual(await h.get(id),before);assert.equal(h.state.emails.length,0);
  assert.equal((await h.delivered(id,proof)).status,200);
  const after=await h.get(id);assert.equal(after.status,'shipped');assert.equal(after.courier,'Lična dostava');assert.equal(after.operations.fulfillment,'delivered');assert.equal(after.operations.paymentStatus,'paid');assert.equal(after.operations.paymentMethod,'bank_transfer');assert.ok(after.operations.paymentVerifiedAt);assert.equal(after.operations.paymentReference,proof.paymentReference);assert.equal(after.total,598);assert.deepEqual(after.items,before.items);assert.match(after.events.at(-1).note,/IZVOD-42/);
  const eventCount=after.events.length;assert.equal((await h.delivered(id,proof)).status,200);assert.equal((await h.get(id)).events.length,eventCount);
});
regression('operations cannot mark local paid without bank evidence or before confirmation',async()=>{
  const h=harness(),id=await h.add();assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,409);
  h.sql.prepare("UPDATE orders SET status='confirmed' WHERE id=?").run(id);
  assert.equal((await h.operations(id,{paymentStatus:'paid'})).status,409);
  assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,200);
  const o=await h.get(id);assert.equal(o.operations.paymentMethod,'bank_transfer');assert.ok(o.operations.paymentVerifiedAt);const event=JSON.parse(o.events.at(-1).note);assert.ok(event.changes.some(x=>x.key==='paymentVerifiedAt'));
  assert.equal((await h.call(id,'local-payment',{method:'bank_transfer'})).status,409);
});
regression('previously verified bank payment can finish delivery without duplicate verification',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed'});
  assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,200);
  assert.equal((await h.call(id,'local-schedule',schedule)).status,200);
  assert.equal((await h.delivered(id)).status,200);assert.equal((await h.get(id)).operations.paymentStatus,'paid');
});
regression('old IPS paid flag alone is not accepted as verified bank transfer',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed',operations:{paymentStatus:'paid',localDelivery:schedule}});
  assert.equal((await h.delivered(id)).status,409);assert.equal((await h.delivered(id,proof)).status,200);
});
regression('refund blocks delivery; unpaid correction requires fresh verification',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed'});
  assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,200);
  assert.equal((await h.call(id,'local-schedule',schedule)).status,200);
  assert.equal((await h.operations(id,{paymentStatus:'refunded'})).status,200);assert.equal((await h.delivered(id,proof)).status,409);
  assert.equal((await h.operations(id,{paymentStatus:'unpaid'})).status,200);
  assert.equal((await h.operations(id,{paymentStatus:'paid'})).status,409);
  assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,200);
});
regression('local delivery cannot use courier shipment or export to bypass bank verification',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed'});
  assert.equal((await h.call(id,'ship',new FormData())).status,409);
  assert.equal((await h.operations(id,{fulfillment:'ready'})).status,200);
  const headers={Origin:'https://adriatictrade.rs',Authorization:'Bearer synthetic-admin-token-for-tests-only'};
  const count=await(await h.ctx.run(new Request('https://test/admin/attention',{headers}))).json();assert.equal(count.counts.exportReady,0);
  const list=await(await h.ctx.run(new Request('https://test/admin/orders?attention=export',{headers}))).json();assert.equal(list.orders.length,0);
  const exported=await(await h.ctx.run(new Request('https://test/admin/courier-exports',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({requestId:'11111111-1111-4111-8111-111111111111'})}))).json();assert.equal(exported.batch.order_count,0);
});
regression('courier COD stays 420 RSD with ordinary confirmation and no NBS calls',async()=>{
  const h=harness(),id=await h.add(undefined,{local:false});assert.equal((await h.call(id,'confirm',{})).status,200);
  const o=await h.get(id);assert.equal(o.payment,'Pouzećem');assert.equal(o.shipping,420);assert.equal(o.total,1018);assert.equal(h.state.qrRequests.length,0);assert.match(h.state.emails[0].html,/Plaćanje ostaje/);
  assert.equal((await h.call(id,'local-payment',{method:'ips'})).status,409);
});
regression('payment conversion detects concurrent paid operation and does not overwrite it',async()=>{
  const h=harness(),id=await h.add(undefined,{payment:cash,status:'confirmed'});
  h.state.onEmail=()=>h.sql.prepare('UPDATE order_operations SET revision=revision+1,data_json=? WHERE order_id=?').run(JSON.stringify({paymentStatus:'paid'}),id);
  assert.equal((await h.call(id,'local-payment',{method:'bank_transfer'})).status,409);const o=await h.get(id);assert.equal(o.payment,cash);assert.equal(o.operations.paymentStatus,'paid');assert.equal(o.events.filter(x=>x.event_type==='local_payment_changed').length,0);
});
regression('delivery detects concurrent cancellation and never records bank payment over it',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed',operations:{localDelivery:schedule}});
  h.state.onEmail=()=>h.sql.prepare("UPDATE orders SET status='cancelled' WHERE id=?").run(id);
  assert.equal((await h.delivered(id,proof)).status,409);const o=await h.get(id);assert.equal(o.status,'cancelled');assert.equal(o.operations.paymentStatus,'unpaid');assert.equal(o.events.filter(x=>x.event_type==='local_delivery_delivered').length,0);
});

regression('admin renders bank choices, fallback details, verification inputs and old cash history',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed',operations:{localDelivery:{...schedule,notifiedAt:'2026-10-10'}}}),o=await h.get(id);
  const ui=fs.readFileSync('assets/js/admin.js','utf8');
  const detail={innerHTML:'',querySelector(){return null;},querySelectorAll(){return [];}};
  const ctx=vm.createContext({detail,Intl,Date,esc:v=>String(v??'').replaceAll('<','&lt;'),money:v=>`${v} RSD`,dt:v=>v,chip:()=>'',opsLabels:{}});
  vm.runInContext(ui.slice(ui.indexOf('  function renderDetail('),ui.indexOf('  function lastDecisionNote('))+ui.slice(ui.indexOf('  function hasVerifiedBankPayment('),ui.indexOf('  function printLabel(')),ctx);
  ctx.renderDetail(o);assert.match(detail.innerHTML,/data-local-payment="ips"/);assert.match(detail.innerHTML,/data-local-payment="bank_transfer"/);assert.doesNotMatch(detail.innerHTML,/data-local-payment="cash"|Gotovina/);assert.match(detail.innerHTML,/265201031001135831/);assert.match(detail.innerHTML,/name="paymentReference"/);assert.match(detail.innerHTML,/name="remittanceDate"/);assert.doesNotMatch(detail.innerHTML,/paymentConfirmed[^>]*disabled/);
  assert.equal(ctx.cashOnDeliveryAmount(o),0);assert.equal(ctx.cashOnDeliveryAmount({...o,payment:'Pouzećem'}),598);
  ctx.renderDetail({...o,payment:cash});assert.match(detail.innerHTML,/Lična dostava — gotovina/);assert.doesNotMatch(detail.innerHTML,/data-local-delivered-form/);
});

regression('changing verified bank evidence requires a fresh check and cannot erase it',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed'});
  assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,200);
  const before=await h.get(id);
  assert.equal((await h.operations(id,{paymentReference:''})).status,409);
  assert.equal((await h.operations(id,{remittanceDate:''})).status,409);
  assert.deepEqual(await h.get(id),before);
  assert.equal((await h.operations(id,{...proof,paymentReference:'IZVOD-43 / ispravka'})).status,200);
  assert.equal((await h.get(id)).operations.paymentReference,'IZVOD-43 / ispravka');
});
