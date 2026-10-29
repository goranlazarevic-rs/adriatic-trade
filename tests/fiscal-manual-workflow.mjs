import assert from 'node:assert/strict';
import test from 'node:test';
import {harness, bank, proof, schedule} from './helpers/local-delivery-harness.mjs';

// Offline integration tests of the existing manual workflow. The harness rejects
// unknown external calls; no Minimax, PFR, real email or live order is accessed.
const pdf = () => new File(['%PDF-1.4\nSYNTHETIC TEST ONLY - NOT A FISCAL RECEIPT\n'], 'AT-TEST-PP.pdf', {type:'application/pdf'});
const jobs = h => h.sql.prepare('SELECT COUNT(*) AS n FROM notification_outbox').get().n;
function shipment(receipt=pdf()) {
  const fd=new FormData(); fd.set('courier','Synthetic courier'); fd.set('trackingNumber','TEST-SHIPMENT'); fd.set('receipt',receipt); return fd;
}

test('manual fiscal linking records metadata only and preserves the order snapshot', async()=>{
  const h=harness(), id=await h.add(undefined,{local:false,status:'confirmed'}), before=await h.get(id);
  const r=await h.operations(id,{fiscalProvider:'Minimax ESIR',fiscalNumber:'TEST-PFR-NOT-VALID',fiscalReference:''});
  assert.equal(r.status,200); const after=await h.get(id);
  assert.equal(after.operations.fiscalStatus,'linked');
  assert.equal(after.operations.paymentStatus,'unpaid');
  assert.deepEqual(after.items,before.items); assert.equal(after.total,before.total);
  assert.equal(h.receiptFiles.size,0); assert.equal(jobs(h),0); assert.equal(h.state.emails.length,0);
  assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM integration_jobs').get().n,0);
  const event=JSON.parse(after.events.at(-1).note);
  assert.ok(event.changes.some(c=>c.key==='fiscalNumber'&&c.after==='TEST-PFR-NOT-VALID'));
});

test('courier handoff stores and emails the supplied PDF while payment remains unpaid', async()=>{
  const h=harness(), id=await h.add(undefined,{local:false,status:'confirmed'});
  const r=await h.call(id,'ship',shipment()); assert.equal(r.status,200);
  const o=await h.get(id); assert.equal(o.status,'shipped'); assert.equal(o.operations.paymentStatus,'unpaid');
  assert.equal(o.total,1018); assert.equal(h.receiptFiles.size,1); assert.equal(jobs(h),1);
  assert.match(Buffer.from(h.state.emails[0].attachments[0].content,'base64').toString(),/SYNTHETIC TEST ONLY/);
});

test('a repeated courier handoff cannot replace the PDF or enqueue a second notification', async()=>{
  const h=harness(), id=await h.add(undefined,{local:false,status:'confirmed'});
  await h.call(id,'ship',shipment()); const key=(await h.get(id)).receiptKey;
  const r=await h.call(id,'ship',shipment(new File(['%PDF-1.4\nSECOND TEST FILE'],'other.pdf',{type:'application/pdf'})));
  assert.equal(r.status,200); assert.equal((await h.get(id)).receiptKey,key);
  assert.equal(h.receiptFiles.size,1); assert.equal(jobs(h),1); assert.equal(h.state.emails.length,1);
});

test('email failure retries the original PDF and email key without recreating a shipment', async()=>{
  const h=harness(), id=await h.add(undefined,{local:false,status:'confirmed'}); h.state.email='error';
  const r=await h.call(id,'ship',shipment()); assert.equal((await r.json()).emailPending,true);
  const key=(await h.get(id)).receiptKey, first=JSON.stringify(h.state.emails[0]);
  h.state.email='ok'; await h.call(id,'email-retry',{});
  assert.equal(JSON.stringify(h.state.emails[1]),first); assert.equal(h.state.emailKeys[0],h.state.emailKeys[1]);
  assert.equal((await h.get(id)).receiptKey,key); assert.equal(jobs(h),1); assert.equal(h.receiptFiles.size,1);
  assert.equal((await h.get(id)).operations.paymentStatus,'unpaid');
});

test('local bank payment evidence and later delivery PDF remain separate operations', async()=>{
  const h=harness(), id=await h.add(undefined,{status:'confirmed',payment:bank,operations:{localDelivery:schedule}});
  assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,200);
  const paid=await h.get(id); assert.equal(paid.operations.paymentMethod,'bank_transfer');
  assert.equal(paid.receiptKey,''); assert.equal(paid.status,'confirmed'); assert.equal(h.receiptFiles.size,0);
  assert.equal((await h.delivered(id,{receipt:pdf()})).status,200);
  const delivered=await h.get(id); assert.equal(delivered.operations.fulfillment,'delivered');
  assert.equal(delivered.operations.paymentReference,proof.paymentReference); assert.equal(delivered.operations.paymentStatus,'paid');
  assert.equal(delivered.total,paid.total); assert.equal(h.receiptFiles.size,1);
});

test('stored receipt requires admin authorization and an allowed origin', async()=>{
  const h=harness(), id=await h.add(undefined,{local:false,status:'confirmed'}); await h.call(id,'ship',shipment());
  const path='https://test/admin/orders/'+id+'/receipt';
  assert.equal((await h.ctx.run(new Request(path,{headers:{Origin:'https://adriatictrade.rs'}}))).status,401);
  assert.equal((await h.ctx.run(new Request(path,{headers:{Origin:'https://evil.example',Authorization:'Bearer synthetic-admin-token-for-tests-only'}}))).status,403);
  const ok=await h.call(id,'receipt'); assert.equal(ok.status,200); assert.equal(ok.headers.get('Content-Type'),'application/pdf');
  assert.match(await ok.text(),/SYNTHETIC TEST ONLY/);
});

test('invalid or oversized PDFs cannot advance fulfillment or send customer email', async()=>{
  for (const receipt of [new File(['NOT A PDF'],'fake.pdf',{type:'application/pdf'}),new File([new Uint8Array(5*1024*1024+1)],'big.pdf',{type:'application/pdf'})]) {
    const h=harness(), id=await h.add(undefined,{local:false,status:'confirmed'});
    const response=await h.call(id,'ship',shipment(receipt)); assert.ok([400,413].includes(response.status));
    assert.equal((await h.get(id)).status,'confirmed'); assert.equal(h.receiptFiles.size,0);
    assert.equal(jobs(h),0); assert.equal(h.state.emails.length,0);
  }
});
