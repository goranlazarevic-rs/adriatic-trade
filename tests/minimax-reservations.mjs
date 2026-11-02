import test from 'node:test';
import assert from 'node:assert/strict';
import {stockHarness} from './helpers/minimax-stock-harness.mjs';
import {seedReservations} from './helpers/minimax-reservations-fixture.mjs';
const setup=async scenarios=>{const h=stockHarness();h.entries=await seedReservations(h,scenarios);return h;};
const json=async h=>{const r=await h.availability();return {status:r.status,data:await r.json()};};
const database=h=>JSON.stringify(['checkout_stock','checkout_control','checkout_intake','checkout_admissions','orders','order_events','minimax_drafts'].map(t=>h.sql.prepare('SELECT * FROM '+t).all()));
test('four saved admissions deduct physical units once; seed orders are excluded; GET never writes',async()=>{
  const h=await setup();const old=h.ctx.mmProbeOrder('STANDARD');old.id=old.submissionId='AT-MMTEST-STANDARD';await h.ctx.insert(old);
  const before=database(h);
  for(let i=0;i<2;i++){
    const {status,data}=await json(h);assert.equal(status,200);assert.equal(data.scope,'synthetic-reservation-preview');assert.equal(data.salesReady,false);assert.equal(data.quotaWrite,false);assert.equal(data.reservationCount,4);
    const expected={'10012':3,'10086':7,'10240':6,'10306':5,'10307':5};
    for(const r of data.rows){assert.equal(r.reserved,expected[r.sku]);assert.equal(r.simulationRemaining,20-expected[r.sku]);}
    assert.equal(data.bundles.find(b=>b.sku==='PKT-PROBA').simulationRemaining,13);assert.equal(data.bundles.find(b=>b.sku==='PKT-GURMAN').simulationRemaining,13);assert.equal(data.bundles.find(b=>b.sku==='PKT-KOMPLET').simulationRemaining,13);
    assert.ok(!JSON.stringify(data).includes('minimax-test@example.invalid'));assert.ok(!JSON.stringify(data).includes('IssuedInvoiceRows'));assert.ok(!JSON.stringify(data).includes('987654321'));
    assert.equal(database(h),before);
  }
  assert.equal(h.mm.invoiceReads.length,16,'Four existing drafts checked before and after each stock read');assert.equal(h.mm.requests.filter(r=>r.method==='POST').length,2,'One OAuth per explicit read; no invoice POST');
});
test('no admissions and no journal are valid without creating schemas',async()=>{
  const h=stockHarness();const {status,data}=await json(h);assert.equal(status,200);assert.equal(data.reservationCount,0);assert.ok(data.rows.every(r=>r.reserved===0&&r.simulationRemaining===20));
  assert.equal(h.sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name='minimax_drafts'").get().n,0);
});
for(const mode of ['zero','negative','null','absent'])test('unknown, negative and insufficient stock never becomes a positive simulation: '+mode,async()=>{
  const h=await setup();h.mm.mode=mode;const {status,data}=await json(h);assert.equal(status,200);const row=data.rows.find(r=>r.sku==='10086');
  assert.equal(row.simulationRemaining,['null','absent'].includes(mode)?null:0);assert.equal(row.shortage,{zero:7,negative:9,null:null,absent:null}[mode]);
  assert.ok(data.bundles.every(b=>b.simulationRemaining===(['null','absent'].includes(mode)?null:0)));
});
test('pending admission without a draft still reserves its saved units',async()=>{
  const h=await setup(['PAKET']);h.sql.exec('DELETE FROM minimax_drafts');const {status,data}=await json(h);assert.equal(status,200);assert.equal(data.rows.find(r=>r.sku==='10086').reserved,2);assert.equal(h.mm.invoiceReads.length,0);
});
for(const state of ['sending','attention'])test('uncertain Minimax transfer blocks calculation before external calls: '+state,async()=>{
  const h=await setup(['STANDARD']);h.sql.prepare('UPDATE minimax_drafts SET status=?').run(state);const {status,data}=await json(h);assert.equal(status,409);assert.equal(data.code,'MINIMAX_RESERVATION_RECONCILIATION_REQUIRED');assert.equal(data.rows,undefined);assert.equal(h.mm.requests.length,0);
});
test('fresh issued invoice blocks before stock instead of releasing or subtracting again',async()=>{
  const h=await setup(['STANDARD']);h.mm.invoices.get(h.entries[0].invoiceId).Status='I';const before=database(h);const {status,data}=await json(h);assert.equal(status,409);assert.equal(data.code,'MINIMAX_RESERVATION_RECONCILIATION_REQUIRED');assert.equal(h.mm.reads,0);assert.equal(data.rows,undefined);assert.equal(database(h),before);
});
test('invoice issued during stock reading blocks result on second fresh verification',async()=>{
  const h=await setup(['STANDARD']);h.mm.onStockRead=sku=>{if(sku==='10307')h.mm.invoices.get(h.entries[0].invoiceId).Status='I';};const {status,data}=await json(h);assert.equal(status,409);assert.equal(data.code,'MINIMAX_RESERVATION_RECONCILIATION_REQUIRED');assert.equal(data.rows,undefined);assert.equal(h.mm.reads,5);
});
test('local quota change during reading invalidates the whole calculation',async()=>{
  const h=await setup(['STANDARD']);h.mm.onStockRead=sku=>{if(sku==='10307')h.sql.exec("UPDATE checkout_stock SET remaining=2 WHERE sku='10086'");};const {status,data}=await json(h);assert.equal(status,409);assert.equal(data.code,'MINIMAX_RESERVATIONS_CHANGED');assert.equal(data.rows,undefined);
});
for(const mutation of ['requirements','missing-order','cancelled','unknown-sku','duplicate-invoice','payload'])test('unreconciled reservation input is blocked: '+mutation,async()=>{
  const h=await setup(['STANDARD','PAKET']);
  if(mutation==='requirements')h.sql.exec("UPDATE checkout_admissions SET requirements_json='[]'");
  if(mutation==='missing-order')h.sql.exec("DELETE FROM orders WHERE id='AT-MMTEST-FLOW-STANDARD'");
  if(mutation==='cancelled')h.sql.exec("UPDATE orders SET status='cancelled'");
  if(mutation==='unknown-sku')h.sql.exec(`UPDATE orders SET items_json='[{"sku":"UNKNOWN","qty":1}]'`);
  if(mutation==='duplicate-invoice')h.sql.exec('UPDATE minimax_drafts SET external_id=45000001');
  if(mutation==='payload')h.sql.exec("UPDATE minimax_drafts SET payload_json='{}'");
  const {status,data}=await json(h);assert.equal(status,409);assert.equal(data.rows,undefined);assert.equal(h.mm.requests.length,0);
});
test('saved package components, rather than a mutable recipe, determine reservation units',async()=>{
  const h=await setup(['PAKET']);h.sql.exec('DELETE FROM minimax_drafts');
  const order=h.sql.prepare("SELECT items_json FROM orders WHERE id='AT-MMTEST-FLOW-PAKET'").get();const items=JSON.parse(order.items_json);items[0].packageVersion='v2';items[0].bundleComponents=[{sku:'10012',units:2,referenceUnitPrice:800}];
  h.sql.prepare("UPDATE orders SET items_json=? WHERE id='AT-MMTEST-FLOW-PAKET'").run(JSON.stringify(items));h.sql.prepare('UPDATE checkout_admissions SET requirements_json=?').run(JSON.stringify([{sku:'10012',qty:4},{sku:'10240',qty:1}]));
  const {status,data}=await json(h);assert.equal(status,200);assert.equal(data.rows.find(r=>r.sku==='10012').reserved,4);assert.equal(data.rows.find(r=>r.sku==='10086').reserved,0);
});
test('new calculation route retains exact origin, auth, method, fixed parameters and production gates',async()=>{
  const h=stockHarness();for(const [args,status] of [[['GET','',''],401],[['GET','','Bearer synthetic-admin-token-for-tests-only','https://example.invalid'],403],[['POST'],403],[['GET','?quantity=100'],400]])assert.equal((await h.availability(...args)).status,status);
  assert.equal(h.mm.requests.length,0);delete h.env.MINIMAX_MODE;assert.equal((await h.availability()).status,503);
  delete h.ctx.env.MINIMAX_MODE;assert.equal((await h.ctx.run(new Request('https://test/admin/minimax-availability',{headers:{Origin:'https://adriatictrade.rs',Authorization:'Bearer synthetic-admin-token-for-tests-only'}}))).status,404);
});
test('missing provider draft after stock read returns a safe error rather than a stale result',async()=>{
  const h=await setup(['STANDARD']);h.mm.onStockRead=sku=>{if(sku==='10307')h.mm.invoices.delete(h.entries[0].invoiceId);};const {status,data}=await json(h);
  assert.equal(status,502);assert.equal(data.code,'MINIMAX_HTTP_ERROR');assert.equal(data.step,'drafts');assert.equal(data.upstreamStatus,404);assert.equal(data.rows,undefined);assert.ok(!JSON.stringify(data).includes('private'));
});
test('new local admission during reading is detected even without a quota revision bump',async()=>{
  const h=await setup(['STANDARD']),order=h.ctx.mmProbeOrder('PAKET');await h.ctx.insert(order);
  const revision=h.sql.prepare('SELECT revision FROM checkout_control').get().revision;
  h.mm.onStockRead=sku=>{if(sku==='10307')h.sql.prepare('INSERT INTO checkout_admissions VALUES(?,?,?,1)').run(order.id,JSON.stringify(h.ctx.stockRequirements(order.items)),order.createdAt);};
  const {status,data}=await json(h);assert.equal(status,409);assert.equal(data.code,'MINIMAX_RESERVATIONS_CHANGED');assert.equal(data.rows,undefined);assert.equal(h.sql.prepare('SELECT revision FROM checkout_control').get().revision,revision);
});
