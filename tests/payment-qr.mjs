import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,ips} from './helpers/local-delivery-harness.mjs';

test('new retail QR uses 221, exact cents, recipient allowlist and unique full alphanumeric references',()=>{
  const h=harness(),a=h.ctx.ipsFields({id:'AT-20261103-AB12CD',total:598.01}),b=h.ctx.ipsFields({id:'AT-20261103-EF12GH',total:598.01});
  assert.equal(a.I,'RSD598,01');assert.equal(a.SF,'221');assert.equal(a.K,'PR');assert.equal(a.V,'01');assert.equal(a.C,'1');
  assert.equal(a.R,'265201031001135831');assert.equal(BigInt(a.R)%97n,1n);assert.equal(a.N,'ADRIATIC TRADE DOO\r\nCVETNA 6\r\nSREMSKA KAMENICA');
  assert.notEqual(a.RO,b.RO);assert.equal(a.RO,'00AT-20261103-AB12CD');assert.ok(a.RO.length<=25);assert.ok(a.S.length<=35);
  assert.equal(h.ctx.ipsFields({id:'AT-20261103-123456',total:598}).RO,'0020261103123456');
  for(const amount of [0,-1,NaN,Infinity,'598',0.001,300000.01])assert.throws(()=>h.ctx.ipsFields({id:'AT-20261103-123456',total:amount}));
  for(const id of ['',null,'AT-|R:000000000000000000','AT-'+('A'.repeat(24))])assert.throws(()=>h.ctx.ipsFields({id,total:598}));
});

test('confirmation freezes the same QR and transfer instructions; no payer data or paid status',async()=>{
  const h=harness(),id=await h.add('AT-20261103-AB12CD'),before=(await h.get(id)).bankTransfer;
  assert.equal((await h.call(id,'confirm',{})).status,200);const o=await h.get(id),fields=h.state.qrRequests[0];
  assert.deepEqual(o.bankTransfer,before);assert.equal(o.payment,ips);assert.equal(o.operations.paymentStatus,'unpaid');
  assert.equal(o.events.filter(e=>e.event_type==='payment_instructions').length,1);
  assert.equal(fields.RO,before.model+before.reference);assert.equal(fields.P,undefined);assert.equal(fields.O,undefined);
  assert.match(h.state.emails[0].html,/nije fiskalni račun/);assert.match(h.state.emails[0].html,/proverite primaoca, račun, iznos i poziv/);
  await h.call(id,'ips-qr');assert.deepEqual(h.state.qrRequests[1],fields);
  await h.call(id,'confirm',{});assert.equal((await h.get(id)).events.filter(e=>e.event_type==='payment_instructions').length,1);
});

test('pre-upgrade instructions and stored payment labels remain usable without silently changing an issued reference',async()=>{
  const h=harness(),id=await h.add('AT-20261103-AB12CD',{payment:'Lična dostava — IPS na račun',status:'confirmed'});
  h.sql.prepare("INSERT INTO order_events(order_id,event_type,note,created_at) VALUES(?,'confirmed','Synthetic legacy confirmation',?)").run(id,new Date().toISOString());
  const old=await h.get(id);assert.equal(old.bankTransfer.paymentCode,'289');assert.equal(old.bankTransfer.reference,'2026110312');
  assert.equal((await h.call(id,'ips-qr')).status,200);assert.equal(h.state.qrRequests[0].RO,'002026110312');assert.equal(h.state.emails.length,0);
});

test('a changed amount cannot silently reissue an archived payment instruction',async()=>{
  const h=harness(),id=await h.add('AT-20261103-123456');await h.call(id,'confirm',{});
  const o=await h.get(id);assert.throws(()=>h.ctx.ipsFields({...o,total:100}));
});
