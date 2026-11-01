import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Miniflare,Response,convertV4MiniflareOptions}=require(process.env.MINIFLARE_MODULE_PATH||'miniflare');
const keys=[],delivered=new Map();let failEmail=false;
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'worker/adriatic-trade-worker-v4.5.0.js',compatibilityDate:'2026-10-02',d1Databases:['DB'],bindings:{RESEND_API_KEY:'synthetic',TURNSTILE_SECRET_KEY:'synthetic',TURNSTILE_SITE_KEY:'synthetic',SECURITY_PEPPER:'synthetic'},outboundService:async request=>{
 if(request.url==='https://challenges.cloudflare.com/turnstile/v0/siteverify'){
  const b=await request.json();return new Response(JSON.stringify({success:true,action:b.response==='contact'?'inquiry_contact':b.response==='b2b'?'inquiry_b2b':'checkout_order',hostname:'adriatictrade.rs'}),{headers:{'Content-Type':'application/json'}});
 }
 if(request.url==='https://api.resend.com/emails'){
  const key=request.headers.get('Idempotency-Key'),payload=await request.json();keys.push(key);if(!failEmail)delivered.set(key,payload);
  return new Response(JSON.stringify({id:'synthetic'}),{status:failEmail?503:200,headers:{'Content-Type':'application/json'}});
 }
 throw Error('Unexpected external request: '+request.url);
}}));
const headers={Origin:'https://adriatictrade.rs','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'};
const body=(submissionId,items=[{sku:'10306',qty:1}])=>({submissionId,customer:{firstName:'Test',lastName:'Kupac',email:'test@example.com',phone:'060000000'},delivery:{method:'Dostava na adresu',address:'Test 1',postalCode:'21000',city:'Novi Sad'},items,security:{turnstileToken:'synthetic',website:''}});
let ip=2;
const call=b=>mf.dispatchFetch('https://test/order',{method:'POST',headers:{...headers,'CF-Connecting-IP':`192.0.2.${ip++}`},body:JSON.stringify(b)});
const load=async(db,file)=>{for(const sql of fs.readFileSync(file,'utf8').split(';').filter(x=>x.trim()))await db.prepare(sql).run();};
async function inquiriesWork(label){
 const cfg=await(await mf.dispatchFetch('https://test/inquiry/config',{headers})).json();assert.equal(cfg.ok,true);
 await new Promise(resolve=>setTimeout(resolve,850));
 for(const type of ['contact','b2b']){
  const fields={Ime:'Test',email:'test@example.com',Telefon:'',Poruka:'Synthetic '+label+' '+type,Saglasnost:'Da',...(type==='b2b'?{Kompanija:'Test doo','Tip saradnje':'HoReCa'}:{})};
  const b={type,submissionId:crypto.randomUUID(),fields,security:{website:'',ticket:cfg.ticket,turnstileToken:type}};
  assert.equal((await mf.dispatchFetch('https://test/inquiry',{method:'POST',headers,body:JSON.stringify(b)})).status,202);
 }
}
try{
 const db=await mf.getD1Database('DB');await load(db,'cloudflare-d1-schema-v1.sql');
 assert.equal((await call(body('runtime-missing-schema'))).status,503);assert.equal(keys.length,0);await inquiriesWork('missing-checkout-schema');
 await load(db,'cloudflare-d1-checkout-availability-v1.sql');assert.equal((await call(body('runtime-paused-test'))).status,503);await inquiriesWork('paused');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM orders').first()).n,0);
 console.log('PASS workerd: missing schema and default pause reject orders; contact and B2B continue');
 await db.prepare("UPDATE checkout_intake SET mode='open' WHERE id=1").run();
 const unknown=await call(body('runtime-unknown-test'));assert.equal(unknown.status,503);assert.equal((await unknown.json()).code,'STOCK_UNKNOWN');
 for(const sku of ['10086','10012','10306','10307','10240'])await db.prepare("INSERT INTO checkout_stock VALUES (?,'available',3,'2099-01-01','SYNTHETIC TEST ONLY')").bind(sku).run();
 await db.prepare("UPDATE checkout_stock SET remaining=1 WHERE sku='10086'").run();
 const mixed=await Promise.all(Array.from({length:8},(_,i)=>call(body('runtime-last-unit-'+i,[{sku:i%2?'PKT-PROBA':'10086',qty:1}]))));
 assert.equal(mixed.filter(r=>r.status===201).length,1);assert.equal(mixed.filter(r=>r.status===409).length,7);
 assert.equal((await db.prepare("SELECT remaining FROM checkout_stock WHERE sku='10086'").first()).remaining,0);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM orders').first()).n,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM checkout_admissions').first()).n,1);
 console.log('PASS workerd: 8 concurrent individual/bundle requests compete for last shared unit; exactly 1 accepted, 7 rejected');
 await db.prepare("UPDATE checkout_stock SET remaining=2 WHERE sku='10306'").run();
 const same=body('runtime-identical-request');const before=delivered.size;
 const retries=await Promise.all(Array.from({length:8},()=>call(same)));
 assert.equal(retries.filter(r=>r.status===201).length,1);assert.equal(retries.filter(r=>r.status===200).length,7);
 const ids=await Promise.all(retries.map(async r=>(await r.json()).orderId));assert.equal(new Set(ids).size,1);
 assert.equal((await db.prepare("SELECT remaining FROM checkout_stock WHERE sku='10306'").first()).remaining,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM orders').first()).n,2);assert.equal(delivered.size-before,2);
 await db.prepare("UPDATE checkout_intake SET mode='paused'").run();const paused=await call(same);assert.equal(paused.status,200);assert.equal((await paused.json()).orderId,ids[0]);
 assert.equal((await call({...same,items:[{sku:'10306',qty:2}]})).status,409);
 console.log('PASS workerd: concurrent identical requests produce 1 order/debit, same provider idempotency keys, retries survive pause, changed content conflicts');
 await db.prepare("UPDATE checkout_intake SET mode='open'").run();
 for(const table of ['orders','order_events']){
  await db.prepare(`CREATE TRIGGER synthetic_admission_failure BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`).run();
  const sent=keys.length;assert.equal((await call(body('runtime-rollback-'+table))).status,503);assert.equal(keys.length,sent);
  assert.equal((await db.prepare("SELECT remaining FROM checkout_stock WHERE sku='10306'").first()).remaining,1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM checkout_admissions').first()).n,2);
  await db.prepare('DROP TRIGGER synthetic_admission_failure').run();
 }
 console.log('PASS workerd: later order/audit errors roll back quota and admission, no email');
 failEmail=true;const outage=body('runtime-email-outage');assert.equal((await call(outage)).status,502);
 assert.equal((await db.prepare("SELECT remaining FROM checkout_stock WHERE sku='10306'").first()).remaining,0);
 failEmail=false;assert.equal((await call(outage)).status,200);assert.equal((await db.prepare('SELECT COUNT(*) n FROM orders').first()).n,3);
 console.log('PASS workerd: email outage and retry retain original order and do not consume another unit');
}finally{await mf.dispose();}
