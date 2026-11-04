import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {reviewFields} from './helpers/fiscal-review-fixture.mjs';
const require=createRequire(import.meta.url);
const {Miniflare,Response:MFResponse,convertV4MiniflareOptions}=require(process.env.MINIFLARE_MODULE_PATH||'miniflare');
const emails=[],keys=[];let failEmail=false;
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'worker/adriatic-trade-worker-v4.5.0.js',compatibilityDate:'2026-10-02',d1Databases:['DB'],r2Buckets:['RECEIPTS'],
  bindings:{FIRST_SALE_MODE:'manual-minimax',ADMIN_TOKEN:'synthetic-admin-token-for-tests-only',RESEND_API_KEY:'synthetic'},outboundService:async request=>{
    assert.equal(request.url,'https://api.resend.com/emails','No Minimax issuance, courier or real service calls');emails.push(await request.json());keys.push(request.headers.get('Idempotency-Key'));
    return new MFResponse(JSON.stringify({id:'synthetic'}),{status:failEmail?503:200,headers:{'Content-Type':'application/json'}});
  }}));
const headers={Origin:'https://adriatictrade.rs',Authorization:'Bearer synthetic-admin-token-for-tests-only'};
const call=async(id,action='',body)=>{
  const request=new Request('https://test/admin/orders/'+id+(action?'/'+action:''),{headers:body instanceof FormData?headers:{...headers,'Content-Type':'application/json'},method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
  return mf.dispatchFetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),...(body===undefined?{}:{body:new Uint8Array(await request.arrayBuffer())})});
};
const get=async id=>(await(await call(id)).json()).order;
const form=async(id,number)=>{const o=await get(id),f=new FormData();for(const[k,v]of Object.entries({operationId:crypto.randomUUID(),revision:String(o.operationsRevision),kind:'sale',pfrNumber:number,issuedAt:new Date(Date.now()-60000).toISOString(),amount:'1018',deliveryMode:'panel',recipient:o.customer.email,reason:'Synthetic original PDF check',confirmed:'yes',...reviewFields()}))f.set(k,v);f.set('receipt',new Blob(['%PDF-1.4\nSYNTHETIC '+number],{type:'application/pdf'}),'synthetic.pdf');return f;};
const ship=id=>{const f=new FormData();f.set('courier','Synthetic courier');f.set('trackingNumber','TEST-1');return call(id,'ship',f);};
try{
  const db=await mf.getD1Database('DB');for(const statement of fs.readFileSync('cloudflare-d1-schema-v1.sql','utf8').split(';').filter(s=>s.trim()))await db.prepare(statement).run();
  const seed=async id=>db.prepare(`INSERT INTO orders(id,submission_id,created_at,updated_at,customer_first_name,customer_last_name,customer_email,customer_phone,delivery_method,address,postal_code,city,payment,items_json,goods_total,shipping,total)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,id,'2026-11-03T10:00:00Z','2026-11-03T10:00:00Z','Synthetic','Buyer','test@example.invalid','060000000','Dostava na adresu','Test 1','21000','Novi Sad','Pouzećem',JSON.stringify([{sku:'10306',qty:2,unitPrice:299,lineTotal:598,name:'Synthetic salt'}]),598,420,1018).run();
  const id='AT-20261103-FIRST';await seed(id);assert.equal((await call(id,'confirm',{})).status,200);assert.equal(emails.length,1);assert.equal((await ship(id)).status,409);
  const f=await form(id,'7AF4D923-E3B30A31-901');for(const key of ['verificationUrl','verifiedTaxId','documentType','portalChecked','itemsChecked','paymentChecked'])f.delete(key);failEmail=true;assert.equal((await call(id,'fiscal',f)).status,200);assert.equal((await ship(id)).status,409);
  assert.equal((await get(id)).status,'confirmed');assert.equal((await get(id)).fiscalControl.sale.portalReview,null);assert.equal((await db.prepare('SELECT count(*) n FROM fiscal_reviews').first()).n,0);const key=keys.at(-1),pdfKey=(await get(id)).receiptKey;
  failEmail=false;await call(id,'email-retry',{});assert.equal(keys.at(-1),key);assert.equal((await get(id)).fiscalControl.ready,true);
  await call(id,'fiscal',f);assert.equal((await db.prepare('SELECT count(*) n FROM fiscal_documents').first()).n,1);assert.equal((await get(id)).receiptKey,pdfKey);
  assert.equal((await ship(id)).status,200);assert.equal((await get(id)).status,'shipped');assert.equal(emails.at(-1).attachments,undefined);assert.equal((await call(id,'receipt')).status,200);
  const second='AT-20261103-ROLLBACK';await seed(second);await call(second,'confirm',{});const failed=await form(second,'7AF4D923-E3B30A31-902');
  await db.prepare("CREATE TRIGGER fail_fiscal_mail BEFORE INSERT ON notification_outbox WHEN NEW.operation_key LIKE 'fiscal-mail/%' BEGIN SELECT RAISE(ABORT,'synthetic');END").run();
  assert.equal((await call(second,'fiscal',failed)).status,409);assert.equal((await db.prepare('SELECT count(*) n FROM fiscal_documents WHERE order_id=?').bind(second).first()).n,0);assert.equal((await get(second)).receiptKey,'');
  console.log('PASS first-sale real workerd/D1/R2: confirmation -> fiscal PDF -> email outage -> same-key retry -> shipment, one PFR claim, original PDF download, transaction rollback and no Minimax/courier side effects');
}finally{await mf.dispose();}
