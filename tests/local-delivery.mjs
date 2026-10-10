import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import {harness,ips,bank,cash,today,schedule,proof} from './helpers/local-delivery-harness.mjs';
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0]);

function regression(name,fn){test(name,fn);}
regression('approval uses IPS, free shipping, identical transfer/QR fields and unpaid state',async()=>{
  const h=harness(),id=await h.add(),o=await h.get(id);
  assert.equal(o.payment,ips);assert.equal(o.shipping,0);assert.equal(o.total,598);assert.equal(o.operations.paymentStatus,'unpaid');
  const b=o.bankTransfer;assert.equal(b.account,'265201031001135831');assert.equal(b.model,'00');assert.equal(b.amount,598);assert.equal(b.reference,'20261010');
  assert.equal((await h.call(id,'confirm',{})).status,200);
  const fields=h.state.qrRequests[0];assert.equal(fields.RO,b.model+b.reference);assert.equal(fields.S,b.purpose);assert.equal(fields.SF,b.paymentCode);assert.equal(fields.I,'RSD598,00');
  assert.equal((await h.get(id)).operations.paymentStatus,'unpaid');
});
regression('cash and unrecognized methods are rejected with no payment/history changes',async()=>{
  const h=harness(),id=await h.add(),before=await h.get(id);
  for(const method of ['cash','Cash','card','',null,{}]) assert.equal((await h.call(id,'local-payment',{method})).status,400);
  assert.deepEqual(await h.get(id),before);assert.equal(h.state.emails.length,0);
});
regression('explicit bank transfer requires no NBS service; confirmation includes complete instructions',async()=>{
  const h=harness(),id=await h.add();h.state.qr='throw';
  assert.equal((await h.call(id,'local-payment',{method:'bank_transfer'})).status,200);
  assert.equal((await h.call(id,'confirm',{})).status,200);
  assert.equal(h.state.qrRequests.length,0);const email=h.state.emails[0];
  assert.equal(email.attachments.length,2);assert.match(email.html,/265201031001135831/);assert.match(email.html,/Poziv na broj/);assert.match(email.html,/Šifra plaćanja/);assert.doesNotMatch(email.html,/PNG slika|gotovinom|Plaćanje ostaje/);
  assert.equal((await h.get(id)).payment,bank);
});
for(const mode of ['error','throw','timeout','wrong-type','bad-png']) regression(`QR ${mode}: confirms with transfer fallback, no false attachment or paid status`,async()=>{
  const h=harness(),id=await h.add();h.state.qr=mode;
  assert.equal((await h.call(id,'confirm',{})).status,200);
  const email=h.state.emails[0];assert.equal(email.attachments.length,2);assert.match(email.html,/IPS QR trenutno nije dostupan/);assert.match(email.html,/265201031001135831/);assert.doesNotMatch(email.html,/U prilogu je PNG/);
  const o=await h.get(id);assert.equal(o.status,'confirmed');assert.equal(o.operations.paymentStatus,'unpaid');assert.equal(o.payment,ips);assert.match(o.events.at(-1).note,/bez QR priloga/);
  assert.ok(h.state.timeoutMs.includes(5000));
});
regression('working IPS attaches QR and also supplies ordinary bank transfer instructions',async()=>{
  const h=harness(),id=await h.add();assert.equal((await h.call(id,'confirm',{})).status,200);
  const email=h.state.emails[0];assert.equal(email.attachments.length,3);assert.ok(email.attachments[2].filename.endsWith('.png'));assert.equal(email.attachments[2].content,Buffer.from(png).toString('base64'));assert.match(email.html,/U prilogu je PNG/);assert.match(email.html,/265201031001135831/);
  assert.equal((await h.call(id,'confirm',{})).status,200);assert.equal(h.state.emails.length,1);
});
regression('email failure keeps order unconfirmed even with QR fallback',async()=>{
  const h=harness(),id=await h.add(),before=await h.get(id);h.state.qr='error';h.state.email='error';
  assert.equal((await h.call(id,'confirm',{})).status,502);assert.deepEqual(await h.get(id),before);
});
regression('QR download outage exposes fallback message; instructions remain accessible',async()=>{
  const h=harness(),id=await h.add();h.state.qr='error';const r=await h.call(id,'ips-qr');assert.equal(r.status,502);assert.match((await r.json()).error,/uplatu na račun/);assert.ok((await h.get(id)).bankTransfer.account);
  h.state.qr='ok';const ok=await h.call(id,'ips-qr');assert.equal(ok.status,200);assert.equal(ok.headers.get('Content-Type'),'image/png');
});
regression('legacy cash blocks confirmation, schedule, delivery and new paid operations',async()=>{
  const h=harness(),id=await h.add(undefined,{payment:cash});
  assert.equal((await h.call(id,'confirm',{})).status,409);assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,409);
  h.sql.prepare("UPDATE orders SET status='confirmed' WHERE id=?").run(id);
  const before=await h.get(id);assert.equal((await h.call(id,'local-schedule',schedule)).status,409);
  assert.equal((await h.delivered(id,proof)).status,409);assert.deepEqual(await h.get(id),before);assert.equal(h.state.emails.length,0);
});
regression('unpaid confirmed legacy cash converts explicitly, notifies buyer and preserves prior events',async()=>{
  const h=harness(),id=await h.add(undefined,{payment:cash,status:'confirmed'}),before=await h.get(id);
  assert.equal((await h.call(id,'local-payment',{method:'bank_transfer'})).status,200);
  const after=await h.get(id);assert.equal(after.payment,bank);assert.deepEqual(after.events.slice(0,before.events.length),before.events);assert.match(after.events.at(-1).note,/gotovina →/);
  assert.equal(after.operations.paymentStatus,'unpaid');assert.match(h.state.emails[0].html,/265201031001135831/);assert.match(h.state.emails[0].subject,/Uputstvo/);
});
regression('failed amendment email leaves legacy cash and history untouched',async()=>{
  const h=harness(),id=await h.add(undefined,{payment:cash,status:'confirmed'}),before=await h.get(id);h.state.email='error';
  assert.equal((await h.call(id,'local-payment',{method:'ips'})).status,502);assert.deepEqual(await h.get(id),before);
});
regression('completed legacy cash history is preserved and delivery retry does not create payment',async()=>{
  const h=harness(),id=await h.add(undefined,{payment:cash,status:'shipped',operations:{fulfillment:'delivered',paymentStatus:'paid',paymentReference:'istorijska gotovina'}}),before=await h.get(id);
  assert.equal((await h.call(id,'local-payment',{method:'ips'})).status,409);
  assert.equal((await h.delivered(id)).status,200);assert.deepEqual(await h.get(id),before);assert.equal(h.state.emails.length,0);
});
regression('local delivery needs checked bank verification, valid date and statement reference',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed'});assert.equal((await h.call(id,'local-schedule',schedule)).status,200);
  const before=await h.get(id);h.state.emails=[];
  for(const body of [{},{paymentConfirmed:'yes'},{...proof,paymentConfirmed:'no'},{...proof,remittanceDate:'2099-01-01'},{...proof,remittanceDate:'2026-02-30'},{...proof,paymentReference:'  '}])assert.equal((await h.delivered(id,body)).status,409);
  assert.deepEqual(await h.get(id),before);assert.equal(h.state.emails.length,0);
  assert.equal((await h.delivered(id,proof)).status,200);
  const after=await h.get(id);assert.equal(after.status,'shipped');assert.equal(after.courier,'Lična dostava');assert.equal(after.operations.fulfillment,'delivered');assert.equal(after.operations.paymentStatus,'paid');assert.equal(after.operations.paymentMethod,'bank_transfer');assert.ok(after.operations.paymentVerifiedAt);assert.equal(after.operations.paymentReference,proof.paymentReference);assert.equal(after.total,598);assert.deepEqual(after.items,before.items);assert.match(after.events.at(-1).note,/IZVOD-42/);
  const eventCount=after.events.length;assert.equal((await h.delivered(id,proof)).status,200);assert.equal((await h.get(id)).events.length,eventCount);
});
regression('operations cannot mark local paid without bank evidence or before confirmation',async()=>{
  const h=harness(),id=await h.add();assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,409);
  h.sql.prepare("UPDATE orders SET status='confirmed' WHERE id=?").run(id);
  assert.equal((await h.operations(id,{paymentStatus:'paid'})).status,409);
  assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,200);
  const o=await h.get(id);assert.equal(o.operations.paymentMethod,'bank_transfer');assert.ok(o.operations.paymentVerifiedAt);const event=JSON.parse(o.events.at(-1).note);assert.ok(event.changes.some(x=>x.key==='paymentVerifiedAt'));
  assert.equal((await h.call(id,'local-payment',{method:'bank_transfer'})).status,409);
});
regression('previously verified bank payment can finish delivery without duplicate verification',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed'});
  assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,200);
  assert.equal((await h.call(id,'local-schedule',schedule)).status,200);
  assert.equal((await h.delivered(id)).status,200);assert.equal((await h.get(id)).operations.paymentStatus,'paid');
});
regression('old IPS paid flag alone is not accepted as verified bank transfer',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed',operations:{paymentStatus:'paid',localDelivery:schedule}});
  assert.equal((await h.delivered(id)).status,409);assert.equal((await h.delivered(id,proof)).status,200);
});
regression('refund blocks delivery; unpaid correction requires fresh verification',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed'});
  assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,200);
  assert.equal((await h.call(id,'local-schedule',schedule)).status,200);
  assert.equal((await h.operations(id,{paymentStatus:'refunded'})).status,200);assert.equal((await h.delivered(id,proof)).status,409);
  assert.equal((await h.operations(id,{paymentStatus:'unpaid'})).status,200);
  assert.equal((await h.operations(id,{paymentStatus:'paid'})).status,409);
  assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,200);
});
regression('local delivery cannot use courier shipment or export to bypass bank verification',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed'});
  assert.equal((await h.call(id,'ship',new FormData())).status,409);
  assert.equal((await h.operations(id,{fulfillment:'ready'})).status,200);
  const headers={Origin:'https://adriatictrade.rs',Authorization:'Bearer synthetic-admin-token-for-tests-only'};
  const count=await(await h.ctx.run(new Request('https://test/admin/attention',{headers}))).json();assert.equal(count.counts.exportReady,0);
  const list=await(await h.ctx.run(new Request('https://test/admin/orders?attention=export',{headers}))).json();assert.equal(list.orders.length,0);
  const exported=await(await h.ctx.run(new Request('https://test/admin/courier-exports',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({requestId:'11111111-1111-4111-8111-111111111111'})}))).json();assert.equal(exported.batch.order_count,0);
});
regression('courier COD stays 420 RSD with ordinary confirmation and no NBS calls',async()=>{
  const h=harness(),id=await h.add(undefined,{local:false});assert.equal((await h.call(id,'confirm',{})).status,200);
  const o=await h.get(id);assert.equal(o.payment,'Pouzećem');assert.equal(o.shipping,420);assert.equal(o.total,1018);assert.equal(h.state.qrRequests.length,0);assert.match(h.state.emails[0].html,/Plaćanje ostaje/);
  assert.equal((await h.call(id,'local-payment',{method:'ips'})).status,409);
});
regression('payment conversion detects concurrent paid operation and does not overwrite it',async()=>{
  const h=harness(),id=await h.add(undefined,{payment:cash,status:'confirmed'});
  h.state.onEmail=()=>h.sql.prepare('UPDATE order_operations SET revision=revision+1,data_json=? WHERE order_id=?').run(JSON.stringify({paymentStatus:'paid'}),id);
  assert.equal((await h.call(id,'local-payment',{method:'bank_transfer'})).status,409);const o=await h.get(id);assert.equal(o.payment,cash);assert.equal(o.operations.paymentStatus,'paid');assert.equal(o.events.filter(x=>x.event_type==='local_payment_changed').length,0);
});
regression('delivery detects concurrent cancellation and never records bank payment over it',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed',operations:{localDelivery:schedule}});
  h.state.onEmail=()=>h.sql.prepare("UPDATE orders SET status='cancelled' WHERE id=?").run(id);
  assert.equal((await h.delivered(id,proof)).status,409);const o=await h.get(id);assert.equal(o.status,'cancelled');assert.equal(o.operations.paymentStatus,'unpaid');assert.equal(o.events.filter(x=>x.event_type==='local_delivery_delivered').length,0);
});

regression('admin renders bank choices, fallback details, verification inputs and old cash history',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed',operations:{localDelivery:{...schedule,notifiedAt:'2026-10-10'}}}),o=await h.get(id);
  const ui=fs.readFileSync('assets/js/admin.js','utf8');
  const detail={innerHTML:'',querySelector(){return null;},querySelectorAll(){return [];}};
  const ctx=vm.createContext({detail,Intl,Date,esc:v=>String(v??'').replaceAll('<','&lt;'),money:v=>`${v} RSD`,dt:v=>v,chip:()=>'',opsLabels:{}});
  vm.runInContext(ui.slice(ui.indexOf('  function renderDetail('),ui.indexOf('  function lastDecisionNote('))+ui.slice(ui.indexOf('  function hasVerifiedBankPayment('),ui.indexOf('  function printLabel(')),ctx);
  ctx.renderDetail(o);assert.match(detail.innerHTML,/data-local-payment="ips"/);assert.match(detail.innerHTML,/data-local-payment="bank_transfer"/);assert.doesNotMatch(detail.innerHTML,/data-local-payment="cash"|Gotovina/);assert.match(detail.innerHTML,/265201031001135831/);assert.match(detail.innerHTML,/name="paymentReference"/);assert.match(detail.innerHTML,/name="remittanceDate"/);assert.doesNotMatch(detail.innerHTML,/paymentConfirmed[^>]*disabled/);
  assert.equal(ctx.cashOnDeliveryAmount(o),0);assert.equal(ctx.cashOnDeliveryAmount({...o,payment:'Pouzećem'}),598);
  ctx.renderDetail({...o,payment:cash});assert.match(detail.innerHTML,/Lična dostava — gotovina/);assert.doesNotMatch(detail.innerHTML,/data-local-delivered-form/);
});

regression('changing verified bank evidence requires a fresh check and cannot erase it',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed'});
  assert.equal((await h.operations(id,{paymentStatus:'paid',...proof})).status,200);
  const before=await h.get(id);
  assert.equal((await h.operations(id,{paymentReference:''})).status,409);
  assert.equal((await h.operations(id,{remittanceDate:''})).status,409);
  assert.deepEqual(await h.get(id),before);
  assert.equal((await h.operations(id,{...proof,paymentReference:'IZVOD-43 / ispravka'})).status,200);
  assert.equal((await h.get(id)).operations.paymentReference,'IZVOD-43 / ispravka');
});

const pdfBytes=new TextEncoder().encode('%PDF-1.4\nsynthetic receipt\n%%EOF');
const pdfFile=()=>new File([pdfBytes],'test-racun.pdf',{type:'application/pdf'});
regression('new PDF is attached, stored and downloaded after verified local delivery',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed',operations:{localDelivery:schedule}});
  assert.equal((await h.delivered(id,{...proof,receipt:pdfFile()})).status,200);
  const o=await h.get(id),email=h.state.emails.at(-1);assert.equal(o.receiptFilename,'test-racun.pdf');assert.ok(h.receiptFiles.has(o.receiptKey));assert.match(email.html,/Fiskalni račun je u prilogu/);assert.equal(email.attachments[0].content,Buffer.from(pdfBytes).toString('base64'));
  const download=await h.call(id,'receipt');assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),Buffer.from(pdfBytes));
});
regression('previously linked PDF is actually reattached, not merely promised in email',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed',operations:{localDelivery:schedule}});
  await h.receipts.put('existing.pdf',pdfBytes,{httpMetadata:{contentType:'application/pdf'}});
  h.sql.prepare('UPDATE orders SET receipt_key=?,receipt_filename=? WHERE id=?').run('existing.pdf','existing.pdf',id);
  assert.equal((await h.delivered(id,proof)).status,200);assert.equal(h.state.emails.at(-1).attachments[0].filename,'existing.pdf');assert.equal(h.state.emails.at(-1).attachments[0].content,Buffer.from(pdfBytes).toString('base64'));assert.ok(h.receiptFiles.has('existing.pdf'));
});
regression('failure to email new PDF rolls back new file; existing PDF is never deleted',async()=>{
  for(const saved of [false,true]){
    const h=harness(),id=await h.add(undefined,{status:'confirmed',operations:{localDelivery:schedule}});
    if(saved){await h.receipts.put('existing.pdf',pdfBytes,{});h.sql.prepare('UPDATE orders SET receipt_key=?,receipt_filename=? WHERE id=?').run('existing.pdf','existing.pdf',id);}
    const before=await h.get(id);h.state.email='error';
    assert.equal((await h.delivered(id,{...proof,...(saved?{}:{receipt:pdfFile()})})).status,502);assert.deepEqual(await h.get(id),before);assert.equal(h.receiptFiles.size,saved?1:0);
  }
});
regression('missing linked PDF blocks false attachment notice and payment recording',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed',operations:{localDelivery:schedule}});
  h.sql.prepare('UPDATE orders SET receipt_key=?,receipt_filename=? WHERE id=?').run('missing.pdf','missing.pdf',id);
  const before=await h.get(id);assert.equal((await h.delivered(id,proof)).status,409);assert.equal(h.state.emails.length,0);assert.deepEqual(await h.get(id),before);
});
regression('invalid or oversized PDF is rejected without email or payment changes',async()=>{
  const h=harness(),id=await h.add(undefined,{status:'confirmed',operations:{localDelivery:schedule}}),before=await h.get(id);
  assert.equal((await h.delivered(id,{...proof,receipt:new File(['not pdf'],'fake.pdf',{type:'application/pdf'})})).status,400);
  assert.equal((await h.delivered(id,{...proof,receipt:new File([new Uint8Array(5*1024*1024+1)],'large.pdf',{type:'application/pdf'})})).status,413);
  assert.equal(h.state.emails.length,0);assert.equal(h.receiptFiles.size,0);assert.deepEqual(await h.get(id),before);
});

regression('schedule rejects invalid dates and assigns a new email key when place changes',async()=>{
 const h=harness(),id=await h.add(undefined,{status:'confirmed'});
 for(const date of ['2099-02-30','2099-13-01','2020-01-01'])assert.equal((await h.call(id,'local-schedule',{...schedule,date})).status,400);
 assert.equal(h.state.emails.length,0);
 assert.equal((await h.call(id,'local-schedule',schedule)).status,200);
 assert.equal((await h.call(id,'local-schedule',{...schedule,location:'Drugo mesto'})).status,200);
 assert.notEqual(h.state.emailKeys[0],h.state.emailKeys[1]);assert.equal((await h.get(id)).operations.localDelivery.location,'Drugo mesto');
});
regression('schedule cannot overwrite payment recorded while notification is in flight',async()=>{
 const h=harness(),id=await h.add(undefined,{status:'confirmed'});
 h.state.onEmail=()=>h.sql.prepare('UPDATE order_operations SET revision=revision+1,data_json=? WHERE order_id=?').run(JSON.stringify({paymentStatus:'paid',paymentMethod:'bank_transfer',paymentReference:'NOVA UPLATA'}),id);
 assert.equal((await h.call(id,'local-schedule',schedule)).status,409);
 const o=await h.get(id);assert.equal(o.operations.paymentStatus,'paid');assert.equal(o.operations.paymentReference,'NOVA UPLATA');assert.equal(o.events.filter(x=>x.event_type==='local_delivery_scheduled').length,0);
});
regression('confirmation cannot revive a rejected order or overwrite a concurrent payment choice',async()=>{
 for(const change of ['rejected','bank']){
  const h=harness(),id=await h.add();
  h.state.onEmail=()=>change==='rejected'?h.sql.prepare("UPDATE orders SET status='rejected' WHERE id=?").run(id):h.sql.prepare('UPDATE orders SET payment=? WHERE id=?').run(bank,id);
  assert.equal((await h.call(id,'confirm',{})).status,409);
  const o=await h.get(id);assert.equal(o.status,change==='rejected'?'rejected':'new');assert.equal(o.events.filter(x=>x.event_type==='confirmed').length,0);if(change==='bank')assert.equal(o.payment,bank);
 }
});
