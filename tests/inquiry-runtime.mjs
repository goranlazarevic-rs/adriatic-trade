import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Miniflare,Response,convertV4MiniflareOptions}=require(process.env.MINIFLARE_MODULE_PATH||'miniflare');
const emails=[],keys=[];let emailFail=true,challengeFail=false,challengeNetwork=false;
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'worker/adriatic-trade-worker-v4.5.0.js',compatibilityDate:'2026-10-02',d1Databases:['DB'],bindings:{ADMIN_TOKEN:'synthetic-admin-token-for-tests-only',RESEND_API_KEY:'synthetic',TURNSTILE_SECRET_KEY:'synthetic',SECURITY_PEPPER:'synthetic',TURNSTILE_SITE_KEY:'synthetic'},outboundService:async request=>{
 if(request.url==='https://api.resend.com/emails'){
  emails.push(await request.json());keys.push(request.headers.get('Idempotency-Key'));
  return new Response(JSON.stringify({id:'synthetic'}),{status:emailFail?503:200,headers:{'Content-Type':'application/json'}});
 }
 if(request.url==='https://challenges.cloudflare.com/turnstile/v0/siteverify'){
  const body=await request.json();assert.equal(body.secret,'synthetic');assert.equal(body.remoteip,'192.0.2.99');
  if(challengeNetwork)return new Response('Synthetic Siteverify outage',{status:503});
  return new Response(JSON.stringify({success:!challengeFail,action:body.response==='b2b-token'?'inquiry_b2b':'inquiry_contact',hostname:'adriatictrade.rs'}),{headers:{'Content-Type':'application/json'}});
 }
 throw new Error('Unexpected external request: '+request.url);
}}));
const headers={Origin:'https://adriatictrade.rs','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.99'};
const call=body=>mf.dispatchFetch('https://test/inquiry',{method:'POST',headers,body:JSON.stringify(body)});
const config=()=>mf.dispatchFetch('https://test/inquiry/config',{headers});
try{
 const db=await mf.getD1Database('DB');
 const cfg=await(await config()).json();assert.equal(cfg.ok,true);await new Promise(resolve=>setTimeout(resolve,850));
 const base={type:'contact',submissionId:crypto.randomUUID(),fields:{Ime:'Test',email:'test@example.com',Telefon:'',Poruka:'Runtime synthetic inquiry',Saglasnost:'Da'},security:{website:'',ticket:cfg.ticket,turnstileToken:'contact-token'}};
 challengeNetwork=true;assert.equal((await call(base)).status,503);challengeNetwork=false;
 challengeFail=true;assert.equal((await call(base)).status,403);challengeFail=false;assert.equal(emails.length,0);
 const responses=await Promise.all(Array.from({length:8},(_,i)=>call({...base,submissionId:crypto.randomUUID(),fields:{...base.fields,Poruka:'Concurrent runtime '+i}})));
 assert.equal(responses.filter(r=>r.status===202).length,5);assert.equal(responses.filter(r=>r.status===429).length,3);
 // waitUntil automatically runs the initial background sender in actual workerd.

 assert.equal((await db.prepare('SELECT COUNT(*) n FROM inquiry_outbox').first()).n,5);
 // Drain background requests before forcing the cron retry due.
 for(let i=0;i<40;i++){
  const {n}=await db.prepare("SELECT COUNT(*) n FROM inquiry_outbox WHERE status='sending'").first();
  if(!n)break;await new Promise(resolve=>setTimeout(resolve,25));
 }
 const before=emails.length;assert.equal(before,5);
 await db.prepare('UPDATE inquiry_outbox SET next_attempt_at=0').run();emailFail=false;
 await (await mf.getWorker()).scheduled();
 for(let i=0;i<80;i++){
  const {n}=await db.prepare("SELECT COUNT(*) n FROM inquiry_outbox WHERE status!='sent'").first();
  if(!n)break;await new Promise(resolve=>setTimeout(resolve,25));
 }
 const rows=await db.prepare('SELECT * FROM inquiry_outbox').all();assert.ok(rows.results.every(r=>r.status==='sent'&&r.payload_json==='{}'));
 assert.equal(emails.length,10);for(const key of new Set(keys))assert.equal(keys.filter(x=>x===key).length,2);
 assert.ok(emails.every(x=>x.to.length===1&&x.to[0]==='info@adriatictrade.rs'&&x.text.includes('Saglasnost: Da')));
 console.log('PASS workerd inquiries: Siteverify outage/rejection, real concurrent D1 admission (5 accepted/3 limited), durable email outage and cron retry, same Resend keys, payload scrub');
 await db.prepare('UPDATE inquiry_outbox SET created_at=?').bind(Date.now()-86400001).run();
 await config();await (await mf.getWorker()).scheduled();
 const cleaned=await db.prepare('SELECT ip_hash,content_hash FROM inquiry_outbox').all();assert.ok(cleaned.results.every(r=>r.ip_hash===null&&r.content_hash===null));
 console.log('PASS workerd inquiries: scheduled retention cleanup');
}finally{await mf.dispose();}
