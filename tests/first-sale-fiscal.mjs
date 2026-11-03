import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,proof,schedule} from './helpers/local-delivery-harness.mjs';
import {stockHarness} from './helpers/minimax-stock-harness.mjs';
const pdf=new Blob(['%PDF-1.4\nSYNTHETIC FORMAT FIXTURE - NOT A FISCAL INVOICE'],{type:'application/pdf'});
export async function firstSaleHarness(local=false){
  const h=harness();h.ctx.env.FIRST_SALE_MODE='manual-minimax';
  const id=await h.add(undefined,{local,status:'confirmed',operations:local?{localDelivery:schedule}:undefined});
  return {...h,id};
}
export async function fiscalForm(h,overrides={}){
  const order=await h.get(h.id),form=new FormData(),issuedAt=new Date(Date.now()-60000).toISOString();
  const fields={operationId:crypto.randomUUID(),revision:String(order.operationsRevision),kind:'sale',pfrNumber:'7AF4D923-E3B30A31-234',
    issuedAt,amount:order.total.toFixed(2),deliveryMode:'panel',recipient:order.customer.email,reason:'Synthetic original document check',confirmed:'yes',...overrides};
  for(const[k,v]of Object.entries(fields))if(v!==undefined)form.set(k,v);
  if(!('receipt' in overrides))form.set('receipt',pdf,'synthetic-fiscal.pdf');
  else if(overrides.receipt instanceof Blob)form.set('receipt',overrides.receipt,'synthetic-fiscal.pdf');
  else form.delete('receipt');
  return form;
}
const record=(h,form)=>h.call(h.id,'fiscal',form);
const ship=h=>{const form=new FormData();form.set('courier','Synthetic courier');form.set('trackingNumber','SYNTHETIC-1');return h.call(h.id,'ship',form);};
test('confirmed order cannot ship or deliver without fiscal evidence; no email, file or state side effects',async()=>{
  for(const local of [false,true]){const h=await firstSaleHarness(local),before=await h.get(h.id);
    const r=local?await h.delivered(h.id,proof):await ship(h);assert.equal(r.status,409);assert.equal((await r.json()).code,'FISCAL_REQUIRED');
    assert.deepEqual(await h.get(h.id),before);assert.equal(h.state.emails.length,0);assert.equal(h.receiptFiles.size,0);}
});
test('PDF -> durable one email -> accepted -> shipment; repeats keep same PFR/file/job and avoid reattaching fiscal PDF',async()=>{
  const h=await firstSaleHarness(),form=await fiscalForm(h);const initial=await record(h,form);assert.equal(initial.status,200);
  let order=(await initial.json()).order;assert.equal(order.fiscalControl.sale.evidence,'operator_attestation');assert.equal(order.fiscalControl.sale.deliveryStatus,'accepted');assert.equal(order.fiscalControl.ready,true);
  assert.equal(order.status,'confirmed');assert.equal(h.state.emails.length,1);assert.equal(h.state.emails[0].to[0],order.customer.email);assert.equal(h.state.emails[0].attachments.length,1);
  const key=h.state.emailKeys[0],files=[...h.receiptFiles.keys()];
  for(let i=0;i<4;i++)assert.equal((await record(h,form)).status,200);
  assert.equal(h.state.emails.length,1);assert.deepEqual([...h.receiptFiles.keys()],files);assert.equal(h.sql.prepare('SELECT count(*) n FROM fiscal_documents').get().n,1);
  assert.equal((await ship(h)).status,200);order=await h.get(h.id);assert.equal(order.status,'shipped');assert.equal(order.total,1018);
  assert.equal(h.state.emails.length,2);assert.equal(h.state.emails[1].attachments,undefined);assert.notEqual(h.state.emailKeys[1],key);
  assert.equal((await h.call(h.id,'receipt')).status,200);
});
test('failure retains PDF and fiscal number; shipping waits; retry uses same provider idempotency key',async()=>{
  const h=await firstSaleHarness(),form=await fiscalForm(h);h.state.email='error';const r=await record(h,form);
  assert.equal(r.status,200);assert.equal((await r.json()).emailPending,true);assert.equal((await ship(h)).status,409);assert.equal(h.receiptFiles.size,1);
  const key=h.state.emailKeys[0];h.state.email='ok';await h.call(h.id,'email-retry',{});
  assert.equal(h.state.emailKeys[1],key);assert.equal((await h.get(h.id)).fiscalControl.ready,true);assert.equal((await ship(h)).status,200);
});
test('direct Minimax delivery is explicitly manual evidence and needs correct recipient and actual sending time',async()=>{
  const h=await firstSaleHarness(),issuedAt=new Date(Date.now()-120000).toISOString(),deliveredAt=new Date(Date.now()-60000).toISOString();
  const form=await fiscalForm(h,{deliveryMode:'minimax',issuedAt,deliveredAt,receipt:null});
  assert.equal((await record(h,form)).status,200);const order=await h.get(h.id);assert.equal(order.fiscalControl.sale.deliveryStatus,'manually_recorded');assert.equal(order.fiscalControl.ready,true);assert.equal(h.state.emails.length,0);
  assert.equal((await ship(h)).status,200);assert.equal(h.state.emails.length,1);assert.equal(h.state.emails[0].attachments,undefined);
});
test('global PFR uniqueness survives case differences and cancellation; never reuse a sale as refund',async()=>{
  const h=await firstSaleHarness();assert.equal((await record(h,await fiscalForm(h))).status,200);
  const second=await h.add('AT-20261103-SECOND',{local:false,status:'confirmed'}),other={...h,id:second};
  const r=await record(other,await fiscalForm(other,{pfrNumber:'7af4d923-e3b30a31-234'}));assert.equal(r.status,409);assert.equal((await r.json()).code,'DUPLICATE_FISCAL_NUMBER');
  const reused=await record(h,await fiscalForm(h,{kind:'refund',originalPfr:'7AF4D923-E3B30A31-234'}));assert.equal(reused.status,400);
});
test('concurrent identical records claim one number/file/job; a different order loses globally',async()=>{
  const h=await firstSaleHarness(),form=await fiscalForm(h);const results=await Promise.all(Array.from({length:5},()=>record(h,form)));
  assert.ok(results.every(r=>r.status===200));assert.equal(h.sql.prepare('SELECT count(*) n FROM fiscal_documents').get().n,1);
  assert.equal(h.sql.prepare('SELECT count(*) n FROM notification_outbox').get().n,1);assert.equal(h.receiptFiles.size,1);
});
test('a reused operation ID with changed fields is a conflict',async()=>{
  const h=await firstSaleHarness(),form=await fiscalForm(h);await record(h,form);form.set('reason','Different submitted evidence');
  const r=await record(h,form);assert.equal(r.status,409);assert.equal((await r.json()).code,'FISCAL_OPERATION_CONFLICT');assert.equal(h.receiptFiles.size,1);
});
for(const [field,value] of [['amount','1'],['pfrNumber','invoice 15'],['recipient','shared-customer@example.invalid'],['confirmed','no'],['issuedAt','2099-01-01T00:00:00.000Z'],['reason',''],['deliveryMode','paper'],['originalPfr','7AF4D923-E3B30A31-123']])test('rejects incomplete/mismatched manual evidence: '+field,async()=>{
  const h=await firstSaleHarness(),before=await h.get(h.id),form=await fiscalForm(h,{[field]:value});const r=await record(h,form);
  assert.equal(r.status,400);assert.deepEqual(await h.get(h.id),before);assert.equal(h.state.emails.length,0);assert.equal(h.receiptFiles.size,0);
});
test('external sending without date or before issue is rejected',async()=>{
  const h=await firstSaleHarness();for(const deliveredAt of [undefined,'2020-01-01T00:00:00.000Z'])assert.equal((await record(h,await fiscalForm(h,{deliveryMode:'minimax',deliveredAt,receipt:null}))).status,400);
});
test('PDF mandatory for panel; malformed PDF and duplicate fields are rejected',async()=>{
  const h=await firstSaleHarness();for(const receipt of [null,new Blob(['not PDF'],{type:'application/pdf'})])assert.equal((await record(h,await fiscalForm(h,{receipt}))).status,400);
  const form=await fiscalForm(h);form.append('amount','1018');assert.equal((await record(h,form)).status,400);
});
for(const mutation of ['revision','status','items','recipient','total'])test('transaction-time conflict rolls back fiscal claim, audit, outbox and new R2 file: '+mutation,async()=>{
  const h=await firstSaleHarness(),form=await fiscalForm(h);h.state.onCommit=()=>{
    const queries={revision:"UPDATE order_operations SET revision=revision+1",status:"UPDATE orders SET status='cancelled'",items:"UPDATE orders SET items_json='[]'",recipient:"UPDATE orders SET customer_email='other@example.invalid'",total:'UPDATE orders SET total=1'};h.sql.exec(queries[mutation]);};
  const r=await record(h,form);assert.equal(r.status,409);assert.equal(h.sql.prepare('SELECT count(*) n FROM fiscal_documents').get().n,0);assert.equal(h.receiptFiles.size,0);assert.equal(h.state.emails.length,0);
});
test('outbox failure rolls back the entire fiscal operation and deletes only its uploaded file',async()=>{
  const h=await firstSaleHarness();h.sql.exec("CREATE TRIGGER fail_queue BEFORE INSERT ON notification_outbox BEGIN SELECT RAISE(ABORT,'synthetic');END;");
  assert.equal((await record(h,await fiscalForm(h))).status,409);assert.equal(h.sql.prepare('SELECT count(*) n FROM fiscal_documents').get().n,0);assert.equal(h.receiptFiles.size,0);
});
test('full Minimax refund must reference sale; blocks shipping and permits explicit cancellation',async()=>{
  const h=await firstSaleHarness();await record(h,await fiscalForm(h));assert.equal((await h.call(h.id,'cancel',{reasonCode:'customer_request'})).status,409);
  const issuedAt=new Date(Date.now()-30000).toISOString(),deliveredAt=new Date().toISOString();
  const refund=await fiscalForm(h,{kind:'refund',pfrNumber:'7AF4D923-E3B30A31-235',originalPfr:'7AF4D923-E3B30A31-234',issuedAt,deliveredAt,deliveryMode:'minimax',receipt:null});
  assert.equal((await record(h,refund)).status,200);assert.equal((await ship(h)).status,409);assert.equal((await h.call(h.id,'cancel',{reasonCode:'customer_request'})).status,200);
  assert.equal(h.sql.prepare('SELECT count(*) n FROM fiscal_documents').get().n,2);
});
test('local paid delivery uses the same fiscal gate and keeps payment checks',async()=>{
  const h=await firstSaleHarness(true);await record(h,await fiscalForm(h));assert.equal((await h.delivered(h.id,{})).status,409);assert.equal((await h.delivered(h.id,proof)).status,200);
  assert.equal((await h.get(h.id)).operations.paymentStatus,'paid');
});
test('subsequent changed source or refund cannot bypass the guard using direct shipment requests',async()=>{
  const h=await firstSaleHarness();await record(h,await fiscalForm(h));h.sql.exec('UPDATE orders SET total=1000');assert.equal((await ship(h)).status,409);
});
test('unauthenticated, foreign-origin and staging calls cannot record fiscal documents',async()=>{
  const h=await firstSaleHarness();const form=await fiscalForm(h);
  for(const headers of [{Origin:'https://adriatictrade.rs'},{Origin:'https://evil.example',Authorization:'Bearer synthetic-admin-token-for-tests-only'}]){
    const r=await h.ctx.run(new Request('https://test/admin/orders/'+h.id+'/fiscal',{method:'POST',headers,body:form}));assert.ok([401,403].includes(r.status));}
  assert.equal(h.receiptFiles.size,0);assert.equal(h.state.emails.length,0);
  const stage=stockHarness();stage.env.FIRST_SALE_MODE='manual-minimax';
  const blocked=await stage.ctx.stage.fetch(new Request('https://adriatic-trade-minimax-staging.lakifinance.workers.dev/admin/orders/AT-MMTEST-FLOW-STANDARD/fiscal',
    {method:'POST',headers:{Origin:'https://adriatic-trade-minimax-staging.lakifinance.workers.dev',Authorization:'Bearer synthetic-admin-token-for-tests-only'},body:form}),stage.env,{});
  assert.equal(blocked.status,403);assert.equal(stage.mm.requests.length,0);
});
test('fiscal evidence never changes quota, admission history, stock or saved price',async()=>{
  const h=await firstSaleHarness();const fs=await import('node:fs');
  for(const file of ['cloudflare-d1-checkout-availability-v1.sql','cloudflare-d1-admin-availability-v1.sql'])h.sql.exec(fs.readFileSync(file,'utf8'));
  h.sql.exec("INSERT INTO checkout_stock VALUES('10306','available',8,'2026-11-03','Synthetic reserved stock')");
  const before=JSON.stringify(h.sql.prepare('SELECT * FROM checkout_stock').all()),revision=h.sql.prepare('SELECT revision FROM checkout_control').get().revision;
  await record(h,await fiscalForm(h));assert.equal(JSON.stringify(h.sql.prepare('SELECT * FROM checkout_stock').all()),before);assert.equal(h.sql.prepare('SELECT revision FROM checkout_control').get().revision,revision);
  assert.equal((await h.get(h.id)).total,1018);assert.equal(h.sql.prepare('SELECT count(*) n FROM checkout_admissions').get().n,0);
});
test('refund recorded during shipment preparation wins transaction guard; no false shipment/email',async()=>{
  const h=await firstSaleHarness();await record(h,await fiscalForm(h));const beforeEmails=h.state.emails.length;
  h.state.onCommit=()=>{const row=h.sql.prepare('SELECT * FROM fiscal_documents').get();Object.assign(row,{pfr_key:'7AF4D923-E3B30A31-999',pfr_number:'7AF4D923-E3B30A31-999',kind:'refund',operation_id:crypto.randomUUID()});h.sql.prepare('INSERT INTO fiscal_documents VALUES('+Object.keys(row).map(()=>'?').join(',')+')').run(...Object.values(row));};
  assert.equal((await ship(h)).status,409);assert.equal((await h.get(h.id)).status,'confirmed');assert.equal(h.state.emails.length,beforeEmails);
});
test('PFR uniqueness includes pre-upgrade manually linked fiscal numbers',async()=>{
  const h=await firstSaleHarness(),other=await h.add('AT-LEGACY-FISCAL',{local:false,status:'confirmed'});
  h.sql.prepare('UPDATE order_operations SET data_json=? WHERE order_id=?').run(JSON.stringify({fiscalNumber:' 7af4d923-e3b30a31-234 '}),other);
  const r=await record(h,await fiscalForm(h));assert.equal(r.status,409);assert.equal((await r.json()).code,'DUPLICATE_FISCAL_NUMBER');assert.equal(h.receiptFiles.size,0);
});
test('oversized multipart payload is rejected before storing a document or email',async()=>{
  const h=await firstSaleHarness(),form=await fiscalForm(h,{receipt:new Blob(['%PDF-',new Uint8Array(6*1024*1024)],{type:'application/pdf'})});
  const encoded=new Request('https://test',{method:'POST',body:form}),bytes=await encoded.arrayBuffer();
  const request=new Request('https://test/admin/orders/'+h.id+'/fiscal',{method:'POST',headers:{Origin:'https://adriatictrade.rs',Authorization:'Bearer synthetic-admin-token-for-tests-only','Content-Type':encoded.headers.get('Content-Type')},body:bytes});
  assert.equal((await h.ctx.run(request)).status,413);assert.equal(h.receiptFiles.size,0);assert.equal(h.state.emails.length,0);
});
test('fiscal-linked local payment and generic fiscal fields cannot be overwritten',async()=>{
  const h=await firstSaleHarness(true);await record(h,await fiscalForm(h));const before=await h.get(h.id);
  assert.equal((await h.call(h.id,'local-payment',{method:'bank_transfer'})).status,409);
  assert.equal((await h.operations(h.id,{fiscalNumber:'7AF4D923-E3B30A31-999'})).status,409);assert.deepEqual(await h.get(h.id),before);
});
for(const scenario of ['STANDARD','PAKET','BESPLATNA','GURMAN'])test('read-only invoice preparation keeps saved package components, shipping and exact cents: '+scenario,async()=>{
  const h=harness(),order=h.ctx.mmProbeOrder(scenario),rows=h.ctx.firstSaleInvoiceRows(order);
  assert.equal(rows.reduce((sum,r)=>sum+Math.round(r.value*100),0),Math.round(order.total*100));
  assert.equal(rows.some(r=>r.sku==='DOSTAVA'),scenario!=='BESPLATNA');assert.ok(rows.every(r=>!r.sku.startsWith('PKT-')));assert.equal(h.state.emails.length,0);
});
test('invoice preparation uses saved v2 recipe and accepted price rather than the current bundle',()=>{
  const h=harness(),order={items:[{sku:'PKT-PROBA',qty:2,unitPrice:1150,lineTotal:2300,packageVersion:'v2',bundleComponents:[{sku:'10012',units:2,referenceUnitPrice:800}]}],goodsTotal:2300,shipping:420,total:2720};
  const rows=h.ctx.firstSaleInvoiceRows(order);assert.equal(rows[0].sku,'10012');assert.equal(rows[0].qty,4);assert.equal(rows[0].price,575);assert.equal(rows.length,2);
});
test('preparation does not reprice a saved promotional individual item',()=>{
  const h=harness(),rows=h.ctx.firstSaleInvoiceRows({items:[{sku:'10240',qty:1,unitPrice:499,lineTotal:499}],goodsTotal:499,shipping:420,total:919});
  assert.equal(rows[0].price,499);assert.equal(rows[0].value,499);
});
