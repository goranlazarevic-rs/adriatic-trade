import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { IntegrationLab } from '../tools/integration-lab/flow.mjs';
import { createLabServer } from '../tools/integration-lab/server.mjs';
const cod='TEST-COD-001',local='TEST-LOCAL-002';
const order=(lab,id=cod)=>lab.state().orders.find(o=>o.id===id);
function setup(t) { const lab=new IntegrationLab(); t.after(()=>lab.close());return lab; }
function document(lab,id=cod) {for(const a of ['confirm','stock','mock-invoice'])lab.action(id,a);}
function ship(lab,id=cod) {document(lab,id);for(const a of ['email','shipment','handoff'])lab.action(id,a);}

test('confirmation transfers exactly one received order without creating invoice, payment or shipment',t=>{
  const lab=setup(t),snapshot=structuredClone(order(lab).snapshot);
  for(let i=0;i<5;i++)lab.action(cod,'confirm');
  const o=order(lab);assert.equal(o.status,'confirmed');assert.equal(o.receipt,null);assert.equal(o.payment,'unpaid');
  assert.equal(o.fulfillment,'pending');assert.equal(o.jobs.length,1);assert.equal(o.jobs[0].attempts,1);
  assert.deepEqual(o.snapshot,snapshot);assert.equal(lab.state().providerCounts[0].count,1);
});
test('unknown SKU stops transfer and cannot create an item or bypass stock control',t=>{
  const lab=setup(t),id='TEST-SKU-004';assert.throws(()=>lab.action(id,'confirm'),/Nepoznata šifra/);
  assert.equal(order(lab,id).jobs.length,0);assert.throws(()=>lab.action(id,'mock-invoice'),/prenos/);
  assert.equal(lab.state().providerCounts.length,0);
});
test('insufficient stock prevents receipt and shipment with no stock movement',t=>{
  const lab=setup(t),id='TEST-STOCK-003';lab.action(id,'confirm');
  assert.throws(()=>lab.action(id,'stock'),/zalihe/);assert.throws(()=>lab.action(id,'mock-invoice'),/zalihe/);
  assert.throws(()=>lab.action(id,'shipment'),/PDF/);assert.equal(order(lab,id).snapshot.available,0);
});
test('lost received-order response survives restart; replay blocked; reconciliation finds same record',t=>{
  const directory=mkdtempSync(join(tmpdir(),'at-lab-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const filename=join(directory,'lab.sqlite');let lab=new IntegrationLab({filename});
  lab.action(cod,'confirm','timeout');assert.equal(lab.job(cod,'received-order').status,'uncertain');lab.close();
  lab=new IntegrationLab({filename});t.after(()=>lab.close());
  assert.throws(()=>lab.action(cod,'confirm'),/neizvestan/);assert.throws(()=>lab.action(cod,'stock'),/prenos/);
  lab.action(cod,'reconcile-transfer');lab.action(cod,'confirm');
  assert.equal(lab.job(cod,'received-order').attempts,1);assert.equal(lab.state().providerCounts[0].count,1);
});
test('persisted in-flight crash without provider proof stays blocked',t=>{
  const lab=setup(t);lab.action(cod,'confirm','timeout');
  lab.db.prepare("UPDATE lab_jobs SET status='in_flight' WHERE order_id=?").run(cod);
  lab.db.prepare('DELETE FROM lab_provider').run();
  assert.throws(()=>lab.action(cod,'reconcile-transfer'),/ostaje blokirana/);
  assert.throws(()=>lab.action(cod,'confirm'),/neizvestan/);assert.equal(lab.job(cod,'received-order').attempts,1);
});
test('payload change and mismatched reconciliation never overwrite provider record',t=>{
  const lab=setup(t);lab.action(cod,'confirm','timeout');
  const original=lab.db.prepare('SELECT payload FROM lab_provider').get().payload;
  const snapshot=order(lab).snapshot;snapshot.total+=100;lab.db.prepare('UPDATE lab_orders SET snapshot=? WHERE id=?').run(JSON.stringify(snapshot),cod);
  assert.throws(()=>lab.action(cod,'confirm'),/promenjeni/);assert.equal(lab.db.prepare('SELECT payload FROM lab_provider').get().payload,original);
  lab.db.prepare("UPDATE lab_provider SET payload='{}'").run();assert.throws(()=>lab.action(cod,'reconcile-transfer'),/ostaje blokirana/);
});
test('two database clients share one stable transfer and one intent',t=>{
  const dir=mkdtempSync(join(tmpdir(),'at-lab-race-'));const filename=join(dir,'lab.sqlite');
  const a=new IntegrationLab({filename}),b=new IntegrationLab({filename});t.after(()=>{a.close();b.close();rmSync(dir,{recursive:true,force:true});});
  a.action(cod,'confirm');b.action(cod,'confirm');assert.equal(a.state().providerCounts[0].count,1);
  assert.equal(b.job(cod,'received-order').attempts,1);
});
test('one synthetic receipt per order; duplicate number rejected by persistent constraint',t=>{
  const lab=setup(t);document(lab);lab.action(cod,'mock-invoice');document(lab,local);
  assert.equal(lab.db.prepare('SELECT COUNT(*) AS n FROM lab_receipts').get().n,2);
  assert.throws(()=>lab.db.prepare('UPDATE lab_receipts SET number=? WHERE order_id=?').run(lab.receipt(cod).number,local),/UNIQUE/);
  assert.match(Buffer.from(lab.receipt(cod).pdf).toString(),/NOT A FISCAL RECEIPT/);
});
test('email failure retries only the same recipient/document/hash and never a new invoice',t=>{
  const lab=setup(t);document(lab);lab.action(cod,'email','email-failure');
  assert.equal(lab.job(cod,'receipt-email').status,'retryable');const payload=lab.job(cod,'receipt-email').payload;
  lab.action(cod,'email');lab.action(cod,'email');
  assert.equal(lab.job(cod,'receipt-email').payload,payload);assert.match(payload,/@example.invalid/);
  assert.equal(lab.job(cod,'receipt-email').attempts,2);assert.equal(lab.db.prepare('SELECT COUNT(*) AS n FROM lab_receipts').get().n,1);
  assert.equal(lab.state().providerCounts.find(p=>p.kind==='receipt-email').count,1);
});
test('lost email acknowledgement reconciles existing email, blocking blind resend',t=>{
  const lab=setup(t);document(lab);lab.action(cod,'email','timeout');
  assert.throws(()=>lab.action(cod,'email'),/neizvestan/);lab.action(cod,'reconcile-email');lab.action(cod,'email');
  assert.equal(lab.job(cod,'receipt-email').attempts,1);
});
test('courier timeout blocks handoff/recreation; reconciliation preserves COD and existing ID',t=>{
  const lab=setup(t);document(lab);lab.action(cod,'email');lab.action(cod,'shipment','timeout');
  assert.throws(()=>lab.action(cod,'handoff'),/razrešite/);assert.throws(()=>lab.action(cod,'shipment'),/neizvestan/);
  lab.action(cod,'reconcile-shipment');lab.action(cod,'shipment');lab.action(cod,'handoff');
  const o=order(lab);assert.equal(o.fulfillment,'handed_over');assert.equal(o.payment,'unpaid');
  assert.equal(JSON.parse(lab.job(cod,'shipment').payload).cod,101800);assert.equal(lab.job(cod,'shipment').attempts,1);
});
test('handoff requires receipt and captured email; label creation alone never means handoff/payment',t=>{
  const lab=setup(t);lab.action(cod,'confirm');assert.throws(()=>lab.action(cod,'shipment'),/PDF/);
  lab.action(cod,'stock');lab.action(cod,'mock-invoice');lab.action(cod,'shipment');
  assert.equal(order(lab).fulfillment,'pending');assert.throws(()=>lab.action(cod,'handoff'),/poruke/);
  lab.action(cod,'email');lab.action(cod,'handoff');assert.equal(order(lab).payment,'unpaid');
});
test('delivery, collection and remittance stay separate without any second receipt',t=>{
  const lab=setup(t);ship(lab);assert.throws(()=>lab.action(cod,'payment'),/isporuke/);
  lab.action(cod,'delivered');assert.equal(order(lab).payment,'unpaid');assert.throws(()=>lab.action(cod,'remittance'),/naplatu/);
  lab.action(cod,'payment');assert.equal(order(lab).remittance,'pending');lab.action(cod,'remittance');
  assert.equal(order(lab).remittance,'received');assert.equal(lab.db.prepare('SELECT COUNT(*) AS n FROM lab_receipts').get().n,1);
});
test('undelivered return never implies payment or automatically issued refund',t=>{
  const lab=setup(t);ship(lab);lab.action(cod,'returned');assert.equal(order(lab).fulfillment,'returned');
  assert.equal(order(lab).payment,'unpaid');assert.throws(()=>lab.action(cod,'payment'),/isporuke/);
  assert.equal(lab.db.prepare('SELECT COUNT(*) AS n FROM lab_receipts').get().n,1);
});
test('local delivery never creates courier shipment and requires proof simulation and PDF',t=>{
  const lab=setup(t);lab.action(local,'confirm');lab.action(local,'payment');
  assert.throws(()=>lab.action(local,'delivered'),/PDF/);lab.action(local,'stock');lab.action(local,'mock-invoice');lab.action(local,'email');
  assert.throws(()=>lab.action(local,'shipment'),/nema kurirski/);lab.action(local,'delivered');
  assert.equal(order(lab,local).snapshot.total,59800);assert.equal(order(lab,local).fulfillment,'delivered');
  assert.ok(!lab.job(local,'shipment'));assert.throws(()=>lab.action(local,'remittance'),/naplatu/);
});
test('invalid mode, real-order IDs, real issue action and unknown scenarios fail closed',t=>{
  assert.throws(()=>new IntegrationLab({mode:'production'}),/isključivo/);
  const lab=setup(t);assert.throws(()=>lab.action('AT-REAL-001','confirm'),/sintetičku/);
  for(const action of ['issue','issueAndGeneratepdf','refund','cancel-shipment'])assert.throws(()=>lab.action(cod,action),/nije podržana/);
  assert.throws(()=>lab.action(cod,'confirm','live'),/Nepoznat scenario/);
});
test('existing unrelated SQLite file is rejected before any write',t=>{
  const dir=mkdtempSync(join(tmpdir(),'at-not-lab-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const filename=join(dir,'unrelated.sqlite'),db=new DatabaseSync(filename);
  db.exec('CREATE TABLE unrelated (id INTEGER); INSERT INTO unrelated VALUES(42);');db.close();
  const before=readFileSync(filename);assert.throws(()=>new IntegrationLab({filename}),/nije postojeća TEST baza/);
  assert.deepEqual(readFileSync(filename),before);
});
test('simulation modules have no network/provider configuration dependencies',()=>{
  for(const path of ['flow.mjs','server.mjs']){
    const source=readFileSync(new URL('../tools/integration-lab/'+path,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\bfetch\s*\(|https\.request|https:\/\/|process\.env|RESEND_API_KEY|MINIMAX_SECRET|wrangler/);
  }
});
test('local server enforces host, origin, token, payload allowlist, no issue endpoint, and synthetic PDF',async t=>{
  const {server}=createLabServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));const base=`http://127.0.0.1:${server.address().port}`;
  const page=await fetch(base);assert.match(page.headers.get('content-security-policy'),/default-src 'none'/);
  const token=(await page.text()).match(/name="lab-token" content="([^"]+)"/)[1];const headers={'X-Lab-Token':token};
  assert.equal((await fetch(base+'/api/state')).status,403);
  assert.equal((await fetch(base+'/api/state',{headers:{...headers,Origin:'https://evil.invalid'}})).status,403);
  const badHost=await new Promise((resolve,reject)=>{const request=http.get(base+'/api/state',{headers:{...headers,Host:'attacker.invalid'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);});
  assert.equal(badHost,403);
  const post=body=>fetch(base+'/api/action',{method:'POST',headers:{...headers,Origin:base,'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
  assert.equal((await post('{')).status,400);assert.equal((await post(null)).status,400);
  assert.equal((await post({id:cod,action:'confirm',email:'real@example.com'})).status,400);
  assert.equal((await post({id:cod,action:'issue'})).status,400);
  assert.equal((await fetch(base+'/api/issue',{method:'POST',headers})).status,404);
  assert.equal((await post({id:cod,action:'confirm',padding:'x'.repeat(2100)})).status,413);
  for(const action of ['confirm','stock','mock-invoice'])assert.equal((await post({id:cod,action})).status,200);
  const pdf=await fetch(base+'/api/receipt/'+cod,{headers});assert.equal(pdf.headers.get('content-type'),'application/pdf');
  assert.match(await pdf.text(),/NOT A FISCAL RECEIPT/);
});
