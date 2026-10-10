import assert from 'node:assert/strict';
import test from 'node:test';
import {harness,bank,cash,schedule,proof} from './helpers/local-delivery-harness.mjs';

const count=h=>h.sql.prepare('SELECT COUNT(*) AS n FROM notification_outbox').get().n;
const flush=h=>h.ctx.flushNotificationOutbox(h.ctx.env);
test('all administrative emails follow persisted transitions, including courier cash on delivery',async()=>{
 for(const action of ['confirm','reject','cancel','local-schedule','local-delivered','local-payment','ship']){
  const h=harness(),id=await h.add(undefined,{local:action==='ship'?false:true,status:['cancel','local-schedule','local-delivered','local-payment','ship'].includes(action)?'confirmed':'new',operations:action==='local-delivered'?{localDelivery:schedule}:undefined,payment:action==='local-payment'?cash:undefined});
  h.state.onEmail=()=>{const o=h.sql.prepare('SELECT status,payment FROM orders WHERE id=?').get(id);assert.equal(o.status,({confirm:'confirmed',reject:'rejected',cancel:'cancelled','local-delivered':'shipped',ship:'shipped'})[action]||'confirmed');assert.equal(count(h),1);if(action==='local-payment')assert.equal(o.payment,bank);if(action==='ship')assert.equal(o.payment,'Pouzećem');if(action==='local-schedule')assert.equal(JSON.parse(h.sql.prepare('SELECT data_json FROM order_operations WHERE order_id=?').get(id).data_json).localDelivery.location,schedule.location);};
  let response;
  if(action==='local-delivered')response=await h.delivered(id,proof);
  else if(action==='ship'){const fd=new FormData();fd.set('courier','Test kurir');fd.set('trackingNumber','TEST-1');response=await h.call(id,action,fd);}
  else response=await h.call(id,action,action==='local-schedule'?schedule:action==='local-payment'?{method:'bank_transfer'}:['cancel','reject'].includes(action)?{reasonCode:'customer_request'}:{});
  assert.equal(response.status,200,action);assert.equal((await response.json()).emailPending,false,action);assert.equal(h.state.emails.length,1,action);
 }
});
test('outbox insert failure atomically rolls back state and audit without sending',async()=>{
 const h=harness(),id=await h.add(),before=await h.get(id);
 h.sql.exec("CREATE TRIGGER fail_queue BEFORE INSERT ON notification_outbox BEGIN SELECT RAISE(ABORT,'synthetic queue failure'); END;");
 assert.equal((await h.call(id,'confirm',{})).status,500);assert.deepEqual(await h.get(id),before);assert.equal(count(h),0);assert.equal(h.state.emails.length,0);
});
test('stale state never sends a message or leaves a queued job',async()=>{
 const h=harness(),id=await h.add();h.state.onCommit=()=>h.sql.prepare("UPDATE orders SET status='rejected' WHERE id=?").run(id);
 assert.equal((await h.call(id,'confirm',{})).status,409);assert.equal(count(h),0);assert.equal(h.state.emails.length,0);
});
test('lost acknowledgement retries exactly the same Resend idempotency key and payload',async()=>{
 const h=harness(),id=await h.add();
 h.sql.exec("CREATE TRIGGER fail_ack BEFORE UPDATE OF status ON notification_outbox WHEN NEW.status='sent' BEGIN SELECT RAISE(ABORT,'synthetic acknowledgement failure'); END;");
 const response=await h.call(id,'confirm',{});assert.equal((await response.json()).emailPending,true);assert.equal((await h.get(id)).status,'confirmed');
 const first=JSON.stringify(h.state.emails[0]);h.sql.exec('DROP TRIGGER fail_ack');
 assert.equal((await (await h.call(id,'email-retry',{})).json()).emailPending,false);assert.equal(h.state.emailKeys[0],h.state.emailKeys[1]);assert.equal(JSON.stringify(h.state.emails[1]),first);assert.equal(count(h),1);
});
test('Cron retries a failed send after its backoff and never resends a sent job',async()=>{
 const h=harness(),id=await h.add();h.state.email='error';await h.call(id,'confirm',{});assert.equal(h.state.emails.length,1);
 await flush(h);assert.equal(h.state.emails.length,1);h.state.email='ok';h.sql.exec('UPDATE notification_outbox SET next_attempt_at=0');await flush(h);assert.equal(h.state.emails.length,2);assert.equal((await h.get(id)).notifications.length,0);await flush(h);assert.equal(h.state.emails.length,2);
});
test('provider/network exception preserves state and pending notification',async()=>{
 const h=harness(),id=await h.add();h.state.onEmail=()=>{throw new Error('synthetic network outage');};const r=await h.call(id,'confirm',{});assert.equal((await r.json()).emailPending,true);assert.equal((await h.get(id)).status,'confirmed');assert.equal(count(h),1);
});
test('concurrent draining honors one lease and notification order',async()=>{
 const h=harness(),id=await h.add();h.state.email='error';await h.call(id,'confirm',{});await h.call(id,'cancel',{reasonCode:'customer_request'});assert.equal(count(h),2);
 h.state.emails=[];h.state.email='ok';h.sql.exec('UPDATE notification_outbox SET next_attempt_at=0');
 let serial=Promise.resolve();const batch=h.db.batch;h.db.batch=statements=>{const run=serial.then(()=>batch(statements));serial=run.catch(()=>{});return run;};
 await Promise.all([flush(h),flush(h)]);assert.equal(h.state.emails.length,2);assert.match(h.state.emails[0].subject,/potvrđena$/);assert.match(h.state.emails[1].subject,/otkazana$/);assert.equal((await h.get(id)).notifications.length,0);
});
test('expired lease can resume safely while a live lease cannot send again',async()=>{
 const h=harness(),id=await h.add();h.state.email='error';await h.call(id,'confirm',{});h.state.email='ok';h.state.emails=[];
 h.sql.exec("UPDATE notification_outbox SET status='sending',lease_token='other',lease_until="+(Date.now()+90000)+',next_attempt_at=0');await flush(h);assert.equal(h.state.emails.length,0);
 h.sql.exec('UPDATE notification_outbox SET lease_until=0');await flush(h);assert.equal(h.state.emails.length,1);
});
test('uncertain send older than safe idempotency window stops for operator review',async()=>{
 const h=harness(),id=await h.add();h.state.email='error';await h.call(id,'confirm',{});h.state.email='ok';h.state.emails=[];
 h.sql.prepare('UPDATE notification_outbox SET first_attempt_at=?,next_attempt_at=0').run(Date.now()-24*60*60*1000);
 await flush(h);assert.equal(h.state.emails.length,0);assert.equal((await h.get(id)).notifications[0].status,'attention');await h.call(id,'email-retry',{});assert.equal(h.state.emails.length,0);
});
test('large PDF is referenced from R2, retained on outage and not stored in D1',async()=>{
 const h=harness(),id=await h.add(undefined,{status:'confirmed',operations:{localDelivery:schedule}});h.state.email='error';
 const bytes=new Uint8Array(3*1024*1024);bytes.set(new TextEncoder().encode('%PDF-1.4\n'));
 assert.equal((await h.delivered(id,{...proof,receipt:new File([bytes],'large.pdf',{type:'application/pdf'})})).status,200);
 const job=h.sql.prepare('SELECT payload_json FROM notification_outbox').get();assert.ok(job.payload_json.length<30000);assert.ok(JSON.parse(job.payload_json).attachments[0].r2Key);assert.equal(h.receiptFiles.size,1);
 h.state.email='ok';await h.call(id,'email-retry',{});assert.equal(Buffer.from(h.state.emails.at(-1).attachments[0].content,'base64').length,bytes.length);
});
test('database rollback cleans only a newly uploaded receipt',async()=>{
 const h=harness(),id=await h.add(undefined,{status:'confirmed',operations:{localDelivery:schedule}}),before=await h.get(id);
 h.sql.exec("CREATE TRIGGER fail_queue BEFORE INSERT ON notification_outbox BEGIN SELECT RAISE(ABORT,'synthetic queue failure'); END;");
 assert.equal((await h.delivered(id,{...proof,receipt:new File(['%PDF-1.4\n'],'new.pdf',{type:'application/pdf'})})).status,500);assert.equal(h.receiptFiles.size,0);assert.deepEqual(await h.get(id),before);assert.equal(h.state.emails.length,0);
});
test('duplicate schedule requests reuse saved notification rather than queue another',async()=>{
 const h=harness(),id=await h.add(undefined,{status:'confirmed'});h.state.email='error';await h.call(id,'local-schedule',schedule);h.state.email='ok';await h.call(id,'local-schedule',schedule);assert.equal(count(h),1);assert.equal(h.state.emailKeys[0],h.state.emailKeys[1]);assert.ok((await h.get(id)).operations.localDelivery.notifiedAt);
});
test('notification acknowledgment merges the latest payment evidence',async()=>{
 const h=harness(),id=await h.add(undefined,{status:'confirmed'});
 h.state.onEmail=()=>{const data=JSON.parse(h.sql.prepare('SELECT data_json FROM order_operations WHERE order_id=?').get(id).data_json);data.paymentReference='concurrent-payment';h.sql.prepare('UPDATE order_operations SET data_json=?,revision=revision+1 WHERE order_id=?').run(JSON.stringify(data),id);};
 await h.call(id,'local-schedule',schedule);const o=await h.get(id);assert.equal(o.operations.paymentReference,'concurrent-payment');assert.ok(o.operations.localDelivery.notifiedAt);
});
test('retry endpoint requires the existing admin authorization',async()=>{
 const h=harness(),id=await h.add();const r=await h.ctx.run(new Request('https://test/admin/orders/'+id+'/email-retry',{method:'POST',headers:{Origin:'https://adriatictrade.rs'}}));assert.equal(r.status,401);
});
test('blocked notification history cannot starve another order during Cron draining',async()=>{
 const h=harness(),id=await h.add();h.state.email='error';await h.call(id,'confirm',{});
 h.sql.exec("UPDATE notification_outbox SET status='attention'");
 for(let i=0;i<12;i++)h.sql.prepare("INSERT INTO notification_outbox(operation_key,order_id,payload_json,created_at) SELECT ?,order_id,payload_json,created_at FROM notification_outbox WHERE id=1").run('blocked-'+i);
 const other=await h.add('AT-20261010-OTHER');await h.call(other,'confirm',{});h.sql.exec("UPDATE notification_outbox SET next_attempt_at=0");h.state.email='ok';h.state.emails=[];await flush(h);
 assert.equal(h.state.emails.length,1);assert.match(h.state.emails[0].subject,/OTHER/);assert.equal((await h.get(other)).notifications.length,0);
});
test('repeated provider failures stop after eight attempts and remain visible for operator review',async()=>{
 const h=harness(),id=await h.add();h.state.email='error';await h.call(id,'confirm',{});
 for(let i=0;i<7;i++){h.sql.exec('UPDATE notification_outbox SET next_attempt_at=0');await flush(h);}
 assert.equal(h.state.emails.length,8);assert.equal((await h.get(id)).notifications[0].status,'attention');await flush(h);assert.equal(h.state.emails.length,8);
});
