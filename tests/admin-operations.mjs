import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync('cloudflare-d1-schema-v1.sql','utf8'));
const db={prepare(sql){const stmt=sqlite.prepare(sql);let args=[];return {bind(...a){args=a;return this},async run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes)}}},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}}}},async batch(stmts){sqlite.exec('BEGIN');try {const r=[];for(const s of stmts)r.push(await s.run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
const source=fs.readFileSync('worker/adriatic-trade-worker-v4.5.0.js','utf8').replace('export default','const worker =');
const ctx=vm.createContext({Request,Response,Headers,URL,console,Intl,Date,crypto,TextEncoder});vm.runInContext(source,ctx);
ctx.db=db;
vm.runInContext(`globalThis.runAdmin=(request)=>handleAdmin(request,{DB:db},new URL(request.url),'https://adriatictrade.rs');globalThis.insert=()=>insertOrder(db,{id:'AT-TEST',submissionId:'test',createdAt:'2026-10-02T10:00:00Z',customer:{firstName:'Test',lastName:'Kupac',email:'test@example.com',phone:'060000000'},delivery:{method:'Dostava na adresu',address:'Test 1',postalCode:'21000',city:'Novi Sad'},payment:'Pouzećem',items:[{sku:'test',qty:1,unitPrice:600,lineTotal:600}],goodsTotal:600,shipping:420,total:1020});`,ctx);
await ctx.insert();
const get=async()=>{const res=await ctx.runAdmin(new Request('https://test/admin/orders/AT-TEST'));return (await res.json()).order};
const post=async(body)=>ctx.runAdmin(new Request('https://test/admin/orders/AT-TEST/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
let o=await get();assert.equal(o.operations.paymentStatus,'unpaid');
assert.equal((await post({revision:0,fulfillment:'ready',reason:'test'})).status,409);
sqlite.exec("UPDATE orders SET status='confirmed'");
assert.equal((await post({revision:0,fulfillment:'ready',internalNote:'Interno',reason:'Priprema'})).status,200);
assert.equal((await post({revision:0,internalNote:'Staro',reason:'Konflikt'})).status,409);
o=await get();assert.equal(o.operations.internalNote,'Interno');assert.equal(o.operationsRevision,1);
assert.equal((await post({revision:1,fulfillment:'delivered',reason:'Bez slanja'})).status,409);
assert.equal((await post({revision:1,paymentStatus:'refunded',reason:'Bez naplate'})).status,409);
assert.equal((await post({revision:1,paymentStatus:'paid',fiscalNumber:'F-1',reason:'Naplata'})).status,200);
sqlite.exec("UPDATE orders SET status='shipped',shipped_at='2026-10-02T12:00:00Z'");
o=await get();assert.equal(o.operations.fulfillment,'shipped');
assert.equal((await post({revision:2,fulfillment:'delivered',reason:'Isporuka'})).status,200);
assert.equal((await post({revision:3,paymentStatus:'refunded',reason:'Povraćaj'})).status,200);
o=await get();assert.equal(o.operations.paymentStatus,'refunded');assert.equal(o.total,1020);assert.equal(o.items[0].unitPrice,600);assert.equal(o.events.length,4);
for(const e of o.events)assert.ok(JSON.parse(e.note).actor);
const list=await ctx.runAdmin(new Request('https://test/admin/orders?from=2026-10-03'));assert.equal((await list.json()).orders.length,0);
for (const terminal of ['rejected','cancelled']) {
  sqlite.prepare('UPDATE orders SET status=? WHERE id=?').run(terminal,'AT-TEST');
  const before=await get();
  const blocked=await post({revision:before.operationsRevision,paymentStatus:'paid',internalNote:'Nedozvoljena izmena',reason:'Test zaključavanja'});
  assert.equal(blocked.status,409);
  const after=await get();assert.deepEqual(after.operations,before.operations);assert.equal(after.operationsRevision,before.operationsRevision);assert.equal(after.events.length,before.events.length);
}
sqlite.exec("UPDATE orders SET status='confirmed' WHERE id='AT-TEST'");
const raceBefore=await get();const batchOriginal=db.batch;
db.batch=async statements=>{sqlite.exec("UPDATE orders SET status='cancelled' WHERE id='AT-TEST'");return batchOriginal(statements);};
assert.equal((await post({revision:raceBefore.operationsRevision,internalNote:'Race',reason:'Race'})).status,409);
db.batch=batchOriginal;
const raceAfter=await get();assert.deepEqual(raceAfter.operations,raceBefore.operations);assert.equal(raceAfter.events.length,raceBefore.events.length);
ctx.env={DB:db,ADMIN_TOKEN:'synthetic-admin-secret'};
vm.runInContext('globalThis.runFetch=(request)=>worker.fetch(request,env,{});',ctx);
const unauthorized=await ctx.runFetch(new Request('https://test/admin/orders',{headers:{Origin:'https://adriatictrade.rs'}}));assert.equal(unauthorized.status,401);
const badOrigin=await ctx.runFetch(new Request('https://test/admin/orders',{headers:{Origin:'https://evil.example',Authorization:'Bearer synthetic-admin-secret'}}));assert.equal(badOrigin.status,403);
console.log('PASS: state transitions, payments, optimistic locking, audit events, immutable prices, date filters, manual fiscal linking.');

const uiSource=fs.readFileSync('assets/js/admin.js','utf8');
const formSource=uiSource.slice(uiSource.indexOf('  function operationsForm('),uiSource.indexOf('  function printLabel('));
const ui=vm.createContext({opsLabels:{unpaid:'Nenaplaćena'},esc:v=>String(v??'').replaceAll('<','&lt;'),row:(k,v)=>`${k}: ${String(v).replaceAll('<','&lt;')}`});vm.runInContext(formSource,ui);
for(const status of ['rejected','cancelled']){const html=ui.operationsForm({status,operations:{internalNote:'<script>test</script>',paymentStatus:'unpaid'}});assert.match(html,/zaključana/);assert.doesNotMatch(html,/<(?:input|select|textarea|button|form)\b/);assert.doesNotMatch(html,/<script>/);assert.match(html,/Obustavljena/);}
assert.match(ui.operationsForm({status:'confirmed',operations:{}}),/data-operations/);
console.log('PASS: rejected/cancelled read-only UI; active order form preserved.');

// Courier exports: readiness, immutable snapshots, retry, concurrent requests and global counts.
sqlite.exec("UPDATE orders SET status='confirmed', shipped_at=NULL WHERE id='AT-TEST'");
sqlite.prepare('UPDATE order_operations SET data_json=? WHERE order_id=?').run(JSON.stringify({fulfillment:'ready',paymentStatus:'unpaid'}),'AT-TEST');
const exportCall=async id=>ctx.runAdmin(new Request('https://test/admin/courier-exports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:id})}));
const uuid1='11111111-1111-4111-8111-111111111111',uuid2='22222222-2222-4222-8222-222222222222';
let exp=await (await exportCall(uuid1)).json();assert.equal(exp.batch.order_count,1);
assert.equal((await get()).status,'confirmed');
assert.equal((await (await exportCall(uuid1)).json()).batch.order_count,1);
assert.equal((await (await exportCall(uuid2)).json()).batch.order_count,0);
const csv1=await (await ctx.runAdmin(new Request('https://test/admin/courier-exports/EXP-'+uuid1))).text();
sqlite.exec("UPDATE orders SET total=9999,customer_first_name='Changed' WHERE id='AT-TEST'");
const csv2=await (await ctx.runAdmin(new Request('https://test/admin/courier-exports/EXP-'+uuid1))).text();assert.equal(csv1,csv2);assert.match(csv1,/1020/);assert.doesNotMatch(csv2,/Changed/);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM courier_export_access').get().n,2);
for(let i=0;i<105;i++){sqlite.prepare("INSERT INTO orders SELECT 'READY-'||?, 'submission-'||?,created_at,updated_at,'confirmed',customer_first_name,customer_last_name,customer_email,customer_phone,delivery_method,address,postal_code,city,note,payment,items_json,goods_total,shipping,total,business_email_sent,customer_email_sent,NULL,NULL,NULL,NULL,NULL,NULL,NULL FROM orders WHERE id='AT-TEST'").run(String(i),String(i));sqlite.prepare('INSERT INTO order_operations(order_id,data_json) VALUES (?,?)').run('READY-'+i,JSON.stringify({fulfillment:'ready'}));}
const counts=await (await ctx.runAdmin(new Request('https://test/admin/attention'))).json();assert.equal(counts.counts.exportReady,105);
const ids=['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
// SQLite harness shares one connection, so serialize D1 batches as D1 does for transactions.
let serial=Promise.resolve();const transaction=db.batch;db.batch=statements=>{const run=serial.then(()=>transaction(statements));serial=run.catch(()=>{});return run;};
const concurrent=await Promise.all(ids.map(async id=>(await (await exportCall(id)).json()).batch.order_count));assert.equal(concurrent.reduce((a,b)=>a+b),105);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM courier_export_orders').get().n,106);
const finalCounts=await (await ctx.runAdmin(new Request('https://test/admin/attention'))).json();assert.equal(finalCounts.counts.exportReady,0);
console.log('PASS: export retry, concurrent deduplication, immutable CSV, no shipment transition, download audit, >100 global counts.');

for(const path of ['/admin/attention','/admin/courier-exports','/admin/courier-exports/EXP-'+uuid1])assert.equal((await ctx.runFetch(new Request('https://test'+path,{headers:{Origin:'https://adriatictrade.rs'}}))).status,401);
assert.equal((await exportCall('invalid')).status,400);
for(const [i,status,fulfillment] of [[0,'new','ready'],[1,'confirmed','pending'],[2,'rejected','ready'],[3,'cancelled','ready']]){
 sqlite.prepare("INSERT INTO orders SELECT ?, ?,created_at,updated_at,?,customer_first_name,customer_last_name,customer_email,customer_phone,delivery_method,address,postal_code,city,note,payment,items_json,goods_total,shipping,total,business_email_sent,customer_email_sent,NULL,NULL,NULL,NULL,NULL,NULL,NULL FROM orders WHERE id='AT-TEST'").run('EXCLUDE-'+i,'exclude-'+i,status);
 sqlite.prepare('INSERT INTO order_operations(order_id,data_json) VALUES (?,?)').run('EXCLUDE-'+i,JSON.stringify({fulfillment}));
}
assert.equal((await (await exportCall('55555555-5555-4555-8555-555555555555')).json()).batch.order_count,0);
const overview=(await (await ctx.runAdmin(new Request('https://test/admin/attention'))).json()).counts;
assert.equal(overview.newOrders,1);assert.equal(overview.prepare,1);assert.equal(overview.exportReady,0);
for(const [key,expected] of [['new',1],['prepare',1],['export',0]])assert.equal((await (await ctx.runAdmin(new Request('https://test/admin/orders?attention='+key))).json()).orders.length,expected);
console.log('PASS: authenticated export endpoints, ineligible status exclusions and action filters.');
