import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {Miniflare,Response,convertV4MiniflareOptions}=require(process.env.MINIFLARE_MODULE_PATH||'miniflare');
// Actual workerd runtime with disposable local D1/R2. Every outbound HTTP request
// is intercepted. This does not create orders or send email in production.
const emails=[],keys=[];let failEmail=true;
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'worker/adriatic-trade-worker-v4.5.0.js',compatibilityDate:'2026-10-02',d1Databases:['DB'],r2Buckets:['RECEIPTS'],bindings:{ADMIN_TOKEN:'synthetic-admin-token-for-tests-only',RESEND_API_KEY:'synthetic',TURNSTILE_SECRET_KEY:'synthetic',SECURITY_PEPPER:'synthetic',TURNSTILE_SITE_KEY:'synthetic'},outboundService:async request=>{
 if(request.url==='https://api.resend.com/emails'){emails.push(await request.json());keys.push(request.headers.get('Idempotency-Key'));return new Response(JSON.stringify({id:'synthetic'}),{status:failEmail?503:200,headers:{'Content-Type':'application/json'}});}
 if(request.url.startsWith('https://nbs.rs/'))return new Response('synthetic QR outage',{status:503});
 if(request.url==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return new Response(JSON.stringify({success:true,action:'checkout_order',hostname:'adriatictrade.rs'}),{headers:{'Content-Type':'application/json'}});
 throw new Error('Unexpected network request: '+request.url);
}}));
const headers={Origin:'https://adriatictrade.rs',Authorization:'Bearer synthetic-admin-token-for-tests-only'};
const call=async(id,action='',body)=>{
 const request=new Request('https://test/admin/orders/'+id+(action?'/'+action:''),{method:body===undefined?'GET':'POST',headers:body instanceof FormData?headers:{...headers,'Content-Type':'application/json'},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
 return mf.dispatchFetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),...(body===undefined?{}:{body:new Uint8Array(await request.arrayBuffer())})});
};
const get=async id=>(await(await call(id)).json()).order;
try{
 const db=await mf.getD1Database('DB');
 for(const statement of fs.readFileSync('cloudflare-d1-schema-v1.sql','utf8').split(';').filter(x=>x.trim()))await db.prepare(statement).run();
 const seed=async id=>db.prepare(`INSERT INTO orders(id,submission_id,created_at,updated_at,customer_first_name,customer_last_name,customer_email,customer_phone,delivery_method,address,postal_code,city,items_json,goods_total,shipping,total) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,id,'2026-10-10T10:00:00Z','2026-10-10T10:00:00Z','Test','Kupac','test@example.com','060000000','Dostava na adresu','Test 1','21000','Novi Sad',JSON.stringify([{sku:'10306',qty:2,unitPrice:299,lineTotal:598,name:'So'}]),598,420,1018).run();
 const id='AT-20261010-RUNTIME';await seed(id);assert.equal((await call(id,'local-delivery',{})).status,200);assert.equal((await call(id,'local-payment',{method:'bank_transfer'})).status,200);
 const confirmation=await(await call(id,'confirm',{})).json();assert.equal(confirmation.order.status,'confirmed');assert.equal(confirmation.emailPending,true);assert.equal(confirmation.order.total,598);
 failEmail=false;assert.equal((await(await call(id,'email-retry',{})).json()).emailPending,false);assert.equal(keys[0],keys[1]);assert.equal(emails[1].attachments.length,2);
 const schedule={date:'2099-01-01',timeWindow:'17–19h',location:'Test 1'};assert.equal((await call(id,'local-schedule',schedule)).status,200);assert.ok((await get(id)).operations.localDelivery.notifiedAt);
 const fd=new FormData(),pdf=fs.readFileSync('dokumenti/adriatic-trade-obavestenje-prodaja-na-daljinu.pdf');fd.set('paymentConfirmed','yes');fd.set('remittanceDate',new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Belgrade',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));fd.set('paymentReference','SYNTHETIC-TEST');fd.set('receipt',new File([pdf],'runtime.pdf',{type:'application/pdf'}));
 assert.equal((await call(id,'local-delivered',fd)).status,200);const order=await get(id);assert.equal(order.status,'shipped');assert.equal(order.operations.paymentStatus,'paid');
 assert.deepEqual(Buffer.from(await(await call(id,'receipt')).arrayBuffer()),pdf);assert.deepEqual(Buffer.from(emails.at(-1).attachments[0].content,'base64'),pdf);
 console.log('PASS workerd: actual D1 batch, JSON merges, R2 PDF upload/download, email outage/idempotent retry, local payment/delivery');
 const second='AT-20261010-ROLLBACK';await seed(second);await get(second);await db.prepare("CREATE TRIGGER fail_queue BEFORE INSERT ON notification_outbox BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END").run();const sent=emails.length;assert.equal((await call(second,'confirm',{})).status,500);assert.equal((await get(second)).status,'new');assert.equal(emails.length,sent);await db.prepare('DROP TRIGGER fail_queue').run();
 console.log('PASS workerd: failed outbox insert rolls back the status and audit event, no email');
 const customer={firstName:'Test',lastName:'Kupac',email:'test@example.com',phone:'060000000'};
 const responses=await Promise.all(Array.from({length:8},(_,i)=>mf.dispatchFetch('https://test/order',{method:'POST',headers:{Origin:'https://adriatictrade.rs','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.99'},body:JSON.stringify({submissionId:'runtime-checkout-'+i,customer,delivery:{method:'Dostava na adresu',address:'Test 1',postalCode:'21000',city:'Novi Sad'},items:[{sku:'10306',qty:1}],security:{turnstileToken:'synthetic',website:''}})})));
 console.log('Runtime checkout statuses:',responses.map(r=>r.status));assert.equal(responses.filter(r=>r.status===201).length,5);assert.equal(responses.filter(r=>r.status===429).length,3);assert.equal((await db.prepare('SELECT COUNT(*) n FROM security_order_attempts').first()).n,5);
 console.log('PASS workerd: 8 concurrent requests produce exactly 5 accepted and 3 rate limited');
}finally{await mf.dispose();}
