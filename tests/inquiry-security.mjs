import assert from 'node:assert/strict';
import test from 'node:test';
import {harness} from './helpers/local-delivery-harness.mjs';
import vm from 'node:vm';

function setup(){
 const h=harness();Object.assign(h.ctx.env,{TURNSTILE_SITE_KEY:'synthetic',TURNSTILE_SECRET_KEY:'synthetic',SECURITY_PEPPER:'synthetic'});
 h.state.turnstile={success:true,action:'inquiry_contact',hostname:'adriatictrade.rs'};
 return h;
}
async function body(h,type='contact'){
 const time=Date.now()-1000,nonce=crypto.randomUUID(),value=`${time}.${nonce}`;
 const ticket=value+'.'+await h.ctx.inquirySignature('inquiry-ticket/'+value,'synthetic');
 return {type,submissionId:crypto.randomUUID(),fields:{Ime:'Test Osoba',email:'test@example.com',Telefon:'',Poruka:'Poslovni upit\nDrugi red',Saglasnost:'Da',...(type==='b2b'?{Kompanija:'Test doo','Tip saradnje':'HoReCa'}:{})},security:{website:'',turnstileToken:'synthetic-token',ticket}};
}
const request=(b,headers={})=>new Request('https://test/inquiry',{method:'POST',headers:{Origin:'https://adriatictrade.rs','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers},body:JSON.stringify(b)});
const call=(h,b,headers)=>h.ctx.run(request(b,headers));
const rows=h=>h.sql.prepare('SELECT * FROM inquiry_outbox').all();

test('B2B/contact fields and explicit consent reach one fixed recipient, as plain text only',async()=>{
 for(const type of ['contact','b2b']){
  const h=setup(),b=await body(h,type);h.state.turnstile.action='inquiry_'+type;
  b.fields.Poruka='<script>alert(1)</script>\nPoslovni upit';
  const r=await call(h,b);assert.equal(r.status,202);assert.equal((await r.json()).accepted,true);
  assert.equal(h.state.emails.length,0); // Only queued before the background sender runs.
  await h.ctx.flushInquiryOutbox(h.ctx.env);
  const email=h.state.emails[0];assert.deepEqual(email.to,['info@adriatictrade.rs']);assert.equal(email.reply_to,b.fields.email);
  assert.match(email.text,/Saglasnost: Da/);assert.match(email.text,/<script>/);assert.equal(email.html,undefined);
  assert.equal(rows(h)[0].status,'sent');assert.equal(rows(h)[0].payload_json,'{}');
  assert.ok(!JSON.stringify(rows(h)).includes('192.0.2.1'));assert.ok(!JSON.stringify(rows(h)).includes('test@example.com'));
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
 }
});

test('missing, whitespace, overlong, malformed, injected or unexpected required data fail before sending',async()=>{
 const cases=[
  b=>delete b.fields.Saglasnost,b=>b.fields.Saglasnost=false,b=>b.fields.Saglasnost='on',
  b=>delete b.fields.Ime,b=>b.fields.Ime='   ',b=>b.fields.Poruka='\n  ',b=>b.fields.email='bad',
  b=>b.fields.email='test@example.com\r\nBcc: victim@example.com',b=>b.fields.Ime='x'.repeat(121),
  b=>b.fields.Poruka='x'.repeat(5001),b=>b.fields.Telefon={},b=>b.fields._cc='victim@example.com',
  b=>b.fields.email=['test@example.com'],b=>b.fields.Poruka='a\u0000b',b=>b.type='order',b=>b.submissionId='bad',b=>b.submissionId=[crypto.randomUUID()],b=>b.fields.email='a,b@example.com',
  b=>b.security.website='https://spam.example',b=>delete b.security.website,b=>b.security.ticket='forged'
 ];
 for(const change of cases){const h=setup(),b=await body(h);change(b);assert.equal((await call(h,b)).status,400);assert.equal(rows(h).length,0);assert.equal(h.state.emails.length,0);}
 for(const change of [b=>delete b.fields.Kompanija,b=>b.fields.Kompanija=' ',b=>b.fields['Tip saradnje']='unknown']){
  const h=setup(),b=await body(h,'b2b');change(b);assert.equal((await call(h,b)).status,400);
 }
});

test('strict origins, methods, content type, JSON and streamed body size; no missing limiter/config fail-open',async()=>{
 const h=setup(),b=await body(h);
 assert.equal((await call(h,b,{Origin:'https://evil.example'})).status,403);
 assert.equal((await call(h,b,{'Content-Type':'text/plain'})).status,415);
 assert.equal((await call(h,b,{'CF-Connecting-IP':''})).status,503);
 assert.equal((await h.ctx.run(new Request('https://test/inquiry'))).status,405);
 assert.equal((await h.ctx.run(new Request('https://test/inquiry',{method:'OPTIONS',headers:{Origin:'https://evil.example'}}))).status,403);
 const headers=request(b).headers;
 for(const [text,status] of [['{',400],[JSON.stringify(null),400],['x'.repeat(20001),413]])assert.equal((await h.ctx.run(new Request('https://test/inquiry',{method:'POST',headers,body:text}))).status,status);
 for(const key of ['DB','RESEND_API_KEY','TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','SECURITY_PEPPER']){
  const old=h.ctx.env[key];delete h.ctx.env[key];assert.equal((await call(h,b)).status,503);h.ctx.env[key]=old;
 }
 h.ctx.env.DB={prepare(){throw new Error('synthetic D1 outage');}};assert.equal((await call(h,b)).status,503);
 assert.equal(h.state.emails.length,0);
});

test('fresh signed ticket, wrong signature, future/expired tickets, token/action/hostname/replay checks',async()=>{
 const h=setup(),b=await body(h),cfg=await h.ctx.run(new Request('https://test/inquiry/config',{headers:{Origin:'https://adriatictrade.rs'}}));
 const data=await cfg.json();assert.equal(cfg.headers.get('Cache-Control'),'no-store');assert.equal(data.ok,true);
 assert.equal(await h.ctx.validInquiryTicket(h.ctx.env,data.ticket),false);
 assert.equal(await h.ctx.validInquiryTicket(h.ctx.env,b.security.ticket),true);
 for(const time of [Date.now()+10000,Date.now()-86400001]){const value=`${time}.${crypto.randomUUID()}`;const ticket=value+'.'+await h.ctx.inquirySignature('inquiry-ticket/'+value,'synthetic');assert.equal(await h.ctx.validInquiryTicket(h.ctx.env,ticket),false);}
 for(const value of ['',null,10,'x'.repeat(2049)]){b.security.turnstileToken=value;assert.equal((await call(h,b)).status,403);}
 b.security.turnstileToken='synthetic';
 for(const result of [{success:false,'error-codes':['timeout-or-duplicate']},{success:'true',action:'inquiry_contact',hostname:'adriatictrade.rs'},{success:true,action:'checkout_order',hostname:'adriatictrade.rs'},{success:true,action:'inquiry_b2b',hostname:'adriatictrade.rs'},{success:true,action:'inquiry_contact',hostname:'evil.example'}]){h.state.turnstile=result;assert.equal((await call(h,b)).status,403);}
 assert.equal(rows(h).length,0);
});

test('invalid attempts are limited before Siteverify; 20/10min shared limit returns Retry-After and resets',async()=>{
 const h=setup(),b=await body(h);b.security.website='spam';
 for(let i=0;i<20;i++)assert.equal((await call(h,b)).status,400);
 const r=await call(h,b);assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'600');
 h.sql.prepare('UPDATE inquiry_attempts SET window_start=?').run(Date.now()-600001);
 assert.equal((await call(h,b)).status,400);assert.equal(h.sql.prepare('SELECT count FROM inquiry_attempts').get().count,1);
});

test('concurrent unique upserts cannot exceed five/hour; both form types share quota; retries deduplicate',async()=>{
 const h=setup();const b=await body(h);
 const copies=Array.from({length:10},(_,i)=>({...b,submissionId:crypto.randomUUID(),fields:{...b.fields,Poruka:'Upit '+i}}));
 const result=await Promise.all(copies.map(b=>call(h,b)));assert.equal(result.filter(r=>r.status===202).length,5);assert.equal(result.filter(r=>r.status===429).length,5);assert.equal(rows(h).length,5);
 const retry=await call(h,copies[0]);assert.equal(retry.status,202);assert.equal(rows(h).length,5);
 const duplicate={...copies[0],submissionId:crypto.randomUUID()};assert.equal((await call(h,duplicate)).status,202);assert.equal(rows(h).length,5);
 const changed={...copies[0],fields:{...copies[0].fields,Poruka:'Promenjen tekst'}};assert.equal((await call(h,changed)).status,409);
 h.state.turnstile.action='inquiry_b2b';assert.equal((await call(h,await body(h,'b2b'))).status,429);
 h.sql.prepare('UPDATE inquiry_outbox SET created_at=?').run(Date.now()-3600001);
 assert.equal((await call(h,await body(h,'b2b'))).status,202);
});

test('concurrent identical bodies and IDs queue one email; concurrent senders share lease',async()=>{
 const h=setup(),b=await body(h);
 const result=await Promise.all(Array.from({length:10},()=>call(h,b)));assert.ok(result.every(r=>r.status===202));assert.equal(rows(h).length,1);
 await Promise.all([h.ctx.flushInquiryOutbox(h.ctx.env),h.ctx.flushInquiryOutbox(h.ctx.env)]);
 assert.equal(h.state.emails.length,1);assert.equal(rows(h)[0].status,'sent');
});

test('email outage retains durable data; cron retries identical payload/key; ambiguous acknowledgment recovers',async()=>{
 const h=setup(),b=await body(h);await call(h,b);h.state.email='fail';
 await h.ctx.flushInquiryOutbox(h.ctx.env);const first=rows(h)[0];assert.equal(first.status,'pending');assert.match(first.payload_json,/test@example.com/);
 await h.ctx.flushInquiryOutbox(h.ctx.env);assert.equal(h.state.emails.length,1); // Backoff respected.
 h.sql.prepare('UPDATE inquiry_outbox SET next_attempt_at=0').run();h.state.email='ok';await h.ctx.flushInquiryOutbox(h.ctx.env);
 assert.equal(rows(h)[0].status,'sent');assert.equal(h.state.emailKeys[0],h.state.emailKeys[1]);assert.deepEqual(h.state.emails[0],h.state.emails[1]);
 assert.equal((await call(h,b)).status,200);await h.ctx.flushInquiryOutbox(h.ctx.env);assert.equal(h.state.emails.length,2);
});

test('expired leases recover, 23h ambiguity stops retry, 24h payload/IP scrub, seven day cleanup',async()=>{
 const h=setup(),b=await body(h);await call(h,b);
 h.sql.prepare("UPDATE inquiry_outbox SET status='sending',lease_until=?,first_attempt_at=?").run(Date.now()-1,Date.now()-60000);
 await h.ctx.flushInquiryOutbox(h.ctx.env);assert.equal(rows(h)[0].status,'sent');
 h.sql.prepare("UPDATE inquiry_outbox SET status='pending',first_attempt_at=?,next_attempt_at=0").run(Date.now()-23*3600000-1);
 await h.ctx.flushInquiryOutbox(h.ctx.env);assert.equal(rows(h)[0].status,'attention');assert.equal(h.state.emails.length,1);
 h.sql.prepare('UPDATE inquiry_outbox SET created_at=?').run(Date.now()-86400001);
 await h.ctx.pruneInquiries(h.db);assert.equal(rows(h)[0].payload_json,'{}');assert.equal(rows(h)[0].content_hash,null);assert.equal(rows(h)[0].ip_hash,null);
 h.sql.prepare('UPDATE inquiry_outbox SET created_at=?').run(Date.now()-7*86400000-1);await h.ctx.pruneInquiries(h.db);assert.equal(rows(h).length,0);
});

test('only authenticated administration can inspect delivery statuses; no PII in API',async()=>{
 const h=setup();await call(h,await body(h));
 const url='https://test/admin/inquiries',headers={Origin:'https://adriatictrade.rs'};
 assert.equal((await h.ctx.run(new Request(url,{headers}))).status,401);
 headers.Authorization='Bearer synthetic-admin-token-for-tests-only';const response=await h.ctx.run(new Request(url,{headers}));
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.inquiries.length,1);
 assert.deepEqual(Object.keys(data.inquiries[0]).sort(),['attempts','created_at','id','status']);
});

test('failed queue insert never acknowledges receipt or sends an email',async()=>{
 const h=setup();await h.ctx.ensureInquirySchema(h.db);
 h.sql.exec("CREATE TRIGGER fail_inquiry BEFORE INSERT ON inquiry_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
 const response=await call(h,await body(h));assert.equal(response.status,503);assert.equal((await response.json()).ok,false);
 assert.equal(rows(h).length,0);assert.equal(h.state.emails.length,0);
});

test('lost provider acknowledgment and lost sent-state write reuse the original immutable key/payload',async()=>{
 for(const failure of ['provider','database']){
  const h=setup();await call(h,await body(h));
  if(failure==='provider')h.state.onEmail=()=>{throw new Error('synthetic lost response after acceptance');};
  else h.ctx.env.DB={...h.db,prepare(query){if(query.includes('SET status=?,payload_json'))throw new Error('synthetic failed sent-state write');return h.db.prepare(query);}};
  await h.ctx.flushInquiryOutbox(h.ctx.env).catch(()=>{});
  assert.equal(h.state.emails.length,1);assert.notEqual(rows(h)[0].status,'sent');
  h.state.onEmail=null;h.ctx.env.DB=h.db;h.sql.prepare('UPDATE inquiry_outbox SET lease_until=0,next_attempt_at=0').run();
  await h.ctx.flushInquiryOutbox(h.ctx.env);assert.equal(rows(h)[0].status,'sent');
  assert.equal(h.state.emailKeys[0],h.state.emailKeys[1]);assert.deepEqual(h.state.emails[0],h.state.emails[1]);
 }
});

test('simultaneous different content with the same submission ID yields one acceptance and one conflict',async()=>{
 const h=setup(),b=await body(h);
 const results=await Promise.all([call(h,b),call(h,{...b,fields:{...b.fields,Poruka:'Drugi tekst'}})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[202,409]);assert.equal(rows(h).length,1);
});

test('Siteverify HTTP/network/JSON failures and total timeout never enqueue or acknowledge an inquiry',async()=>{
 for(const failure of ['http','network','json','timeout']){
  const h=setup();h.state.qr='timeout';
  h.ctx.fetch=async(url,options)=>{
   assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
   if(failure==='network')throw new Error('synthetic private provider details');
   if(failure==='timeout')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('synthetic timeout')),{once:true}));
   return new Response(failure==='json'?'invalid':'{}',{status:failure==='http'?503:200});
  };
  const response=await call(h,await body(h));assert.equal(response.status,503);assert.equal(rows(h).length,0);assert.equal(h.state.emails.length,0);
  assert.ok(h.state.timeoutMs.includes(8000));
 }
});
