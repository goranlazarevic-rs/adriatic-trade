import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fixtures} from '../tools/minimax-staging/fixtures.mjs';
import {ITEMS} from '../tools/minimax-draft/model.mjs';
const require=createRequire(import.meta.url);
const {Miniflare,Response:MFResponse,convertV4MiniflareOptions}=require(process.env.MINIFLARE_MODULE_PATH||'miniflare');
const host='https://adriatic-trade-minimax-staging.lakifinance.workers.dev';
let posts=0,payload;const invoiceId=34567890;
const mf=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:'worker/minimax-staging.js'},{type:'ESModule',path:'worker/adriatic-trade-worker-v4.5.0.js'}],compatibilityDate:'2026-10-02',d1Databases:['DB'],
  serviceBindings:{ASSETS:async()=>new MFResponse('synthetic static asset')},
  bindings:{ADMIN_TOKEN:'synthetic-admin-token-for-tests-only',MINIMAX_MODE:'draft',MINIMAX_ENV:'staging',MINIMAX_CLIENT_ID:'synthetic',MINIMAX_CLIENT_SECRET:'synthetic',MINIMAX_USERNAME:'adriatic-webshop',MINIMAX_PASSWORD:'synthetic'},
  outboundService:async request=>{
    const url=request.url;let body;
    assert.equal(new URL(url).hostname,'moj.minimax.rs','No email, courier or other external service');
    if(url.includes('/oauth20/token'))body={access_token:'synthetic-token',token_type:'bearer',expires_in:3600};
    else if(url.includes('/currentuser/orgs'))body={Rows:[{Organisation:{ID:81179},APIAccess:'D'}]};
    else if(url.includes('/items/pricelists'))body={ValidationMessages:[],Rows:Object.entries(ITEMS).map(([Code,v])=>({Code,Item:{ID:v.id},Customer:{ID:9775669},Warehouse:null,UnitOfMeasurement:'kom',PriceWithVAT:v.gross,PriceWithoutVAT:v.gross/1.2}))};
    else if(request.method==='POST'&&url.endsWith('/issuedinvoices')){posts++;payload=await request.json();return new MFResponse('',{status:201,headers:{Location:`https://moj.minimax.rs/RS/API/api/orgs/81179/issuedinvoices/${invoiceId}?id=${invoiceId}`}});}
    else if(request.method==='GET'&&url.endsWith('/issuedinvoices/'+invoiceId))body={...payload,IssuedInvoiceId:invoiceId,InvoiceNumber:0,InvoiceValue:0};
    else throw new Error('Unexpected Minimax method');
    return new MFResponse(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
  }}));
const headers={Origin:host,Authorization:'Bearer synthetic-admin-token-for-tests-only','Content-Type':'application/json'};
const id=fixtures()[1].id,path='/admin/orders/'+id+'/minimax-draft';
const call=(p=path,body)=>mf.dispatchFetch(host+p,{headers,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})});
try{
  const db=await mf.getD1Database('DB');
  assert.equal((await call()).status,503,'Missing marker cannot mutate database');
  for(const sql of fs.readFileSync('cloudflare-d1-schema-v1.sql','utf8').split(';').filter(s=>s.trim()))await db.prepare(sql).run();
  await db.prepare('CREATE TABLE minimax_environment(id INTEGER PRIMARY KEY,name TEXT)').run();
  await db.prepare("INSERT INTO minimax_environment VALUES(1,'minimax-staging')").run();
  const f=fixtures()[1];
  await db.prepare(`INSERT INTO orders(id,submission_id,created_at,updated_at,status,customer_first_name,customer_last_name,customer_email,customer_phone,delivery_method,postal_code,city,payment,items_json,goods_total,shipping,total)
    VALUES(?,?,?,?,'confirmed','API','Proba','minimax-test@example.invalid','0600000000','Dostava na adresu','21208','Sremska Kamenica','TEST_BANK_TRANSFER',?,?,?,?)`).bind(f.id,f.id,f.createdAt,f.createdAt,JSON.stringify(f.items),f.goodsTotal,f.shipping,f.total).run();
  const preview=await (await call()).json();assert.equal(preview.status,'preview');assert.equal(posts,0);
  const results=await Promise.all(Array.from({length:8},()=>call(path,{action:'create',confirm:true,previewHash:preview.previewHash})));
  assert.ok(results.every(r=>r.status===200),JSON.stringify(await Promise.all(results.map(async r=>({status:r.status,body:await r.text()})))));assert.equal(posts,1,'8 concurrent clicks must create exactly one draft');
  assert.equal((await (await call()).json()).status,'verified');
  assert.equal((await db.prepare('SELECT count(*) n FROM minimax_drafts').first()).n,1);
  assert.equal((await db.prepare("SELECT count(*) n FROM order_events WHERE event_type='minimax_draft_attempt'").first()).n,1);
  assert.equal((await db.prepare('SELECT count(*) n FROM notification_outbox').first()).n,0);
  for(const p of ['/order','/inquiry','/admin/orders/'+id+'/confirm','/admin/courier-exports'])assert.ok([403,404].includes((await call(p,{})).status));
  assert.equal((await mf.dispatchFetch(host+path,{headers:{...headers,Origin:'https://evil.example'}})).status,403);
  assert.equal((await mf.dispatchFetch(host+path,{headers:{Origin:host}})).status,401);
  assert.equal((await mf.dispatchFetch('https://production.example'+path,{headers})).status,404);
  await db.prepare("UPDATE minimax_environment SET name='production'").run();assert.equal((await call()).status,503);
  console.log('PASS workerd/D1: isolated wrapper; 8 concurrent creates -> 1 POST and durable verified draft; exact package/promo total; no email/courier/checkout; origin/auth/DB marker guards');
}finally{await mf.dispose();}
