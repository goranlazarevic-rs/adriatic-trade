import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Miniflare,Response,convertV4MiniflareOptions}=require(process.env.MINIFLARE_MODULE_PATH||'miniflare');
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'worker/adriatic-trade-worker-v4.5.0.js',compatibilityDate:'2026-10-02',d1Databases:['DB'],
 bindings:{ADMIN_TOKEN:'synthetic-admin-token-for-tests-only',RESEND_API_KEY:'synthetic',TURNSTILE_SECRET_KEY:'synthetic',SECURITY_PEPPER:'synthetic'},
 outboundService:async request=>{
  if(request.url==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return new Response(JSON.stringify({success:true,action:'checkout_order',hostname:'adriatictrade.rs'}));
  if(request.url==='https://api.resend.com/emails')return new Response(JSON.stringify({id:'synthetic'}));
  throw Error('Unexpected external request');
 }}));
const headers={Origin:'https://adriatictrade.rs',Authorization:'Bearer synthetic-admin-token-for-tests-only','Content-Type':'application/json'};
const call=body=>mf.dispatchFetch('https://test/admin/availability',{headers,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})});
const snapshot=async()=>(await call()).json();
const change=async values=>({operationId:crypto.randomUUID(),revision:(await snapshot()).revision,action:'quantity',sku:'10306',quantity:8,reason:'Synthetic runtime change',confirmed:true,...values});
try {
 const db=await mf.getD1Database('DB');
 for(const file of ['cloudflare-d1-schema-v1.sql','cloudflare-d1-checkout-availability-v1.sql','cloudflare-d1-admin-availability-v1.sql']){
  // Keep trigger bodies together, including their inner semicolon.
  for(const sql of fs.readFileSync(file,'utf8').split(/;[ \t]*(?:\n|$)/).filter(s=>s.trim()))await db.prepare(sql).run();
 }
 for(const sku of ['10086','10012','10306','10307','10240'])await db.prepare("INSERT INTO checkout_stock VALUES (?,'available',10,'2099-01-01','Synthetic only')").bind(sku).run();
 const s=await snapshot();assert.equal(s.products.length,5);assert.equal(s.revision,5);assert.equal(s.mode,'paused');
 const b=await change({});const duplicates=await Promise.all(Array.from({length:8},()=>call(b)));
 assert.ok(duplicates.every(r=>r.status===200));assert.equal((await db.prepare('SELECT COUNT(*) n FROM checkout_control_events').first()).n,1);
 assert.equal((await snapshot()).products.find(p=>p.sku==='10306').remaining,8);
 assert.equal((await call({...b,quantity:7})).status,409);
 console.log('PASS workerd: concurrent operation retries apply one quota correction and one audit record');
 const stale=await change({quantity:7});await db.prepare("UPDATE checkout_stock SET remaining=6 WHERE sku='10306'").run();assert.equal((await call(stale)).status,409);
 const opening=await change({action:'open',sku:undefined,quantity:undefined,confirmation:'OTVORI PRODAJU',readinessConfirmed:true});assert.equal((await call(opening)).status,200);
 const before=await snapshot(),correction=await change({quantity:0});
 const order={submissionId:crypto.randomUUID(),customer:{firstName:'Test',lastName:'Kupac',email:'test@example.com',phone:'060000000'},delivery:{method:'Dostava na adresu',address:'Test 1',postalCode:'21000',city:'Novi Sad'},items:[{sku:'PKT-PROBA',qty:1}],security:{website:'',turnstileToken:'synthetic'}};
 const [adminResponse,orderResponse]=await Promise.all([call(correction),mf.dispatchFetch('https://test/order',{method:'POST',headers:{Origin:headers.Origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.5'},body:JSON.stringify(order)})]);
 const after=await snapshot(),remaining=after.products.find(p=>p.sku==='10306').remaining;
 assert.ok(adminResponse.status===200&&orderResponse.status===409&&remaining===0||adminResponse.status===409&&orderResponse.status===201&&remaining===5,`admin ${adminResponse.status}, order ${orderResponse.status}, remaining ${remaining}`);
 assert.equal(after.products.find(p=>p.sku==='10086').remaining,orderResponse.status===201?9:10);
 assert.ok(after.revision>before.revision);
 console.log('PASS workerd: concurrent bundle admission and admin correction serialize without restoring consumed quotas');
 const rev=after.revision,events=(await db.prepare('SELECT COUNT(*) n FROM checkout_control_events').first()).n;
 await db.prepare("CREATE TRIGGER synthetic_control_failure BEFORE UPDATE ON checkout_stock BEGIN SELECT RAISE(ABORT,'synthetic'); END").run();
 const failing=await change({quantity:1,increaseConfirmed:true,confirmation:'10306 1'});assert.equal((await call(failing)).status,503);
 assert.equal((await snapshot()).revision,rev);assert.equal((await db.prepare('SELECT COUNT(*) n FROM checkout_control_events').first()).n,events);
 console.log('PASS workerd: failed stock update rolls back audit and revision');
} finally {await mf.dispose();}
