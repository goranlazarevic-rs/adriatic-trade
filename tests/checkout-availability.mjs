import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {harness} from './helpers/local-delivery-harness.mjs';

const migration=fs.readFileSync('cloudflare-d1-checkout-availability-v1.sql','utf8');
const body=(items=[{sku:'10306',qty:1}],submissionId='availability-test-0001')=>({submissionId,
 customer:{firstName:'Test',lastName:'Kupac',email:'test@example.com',phone:'060000000'},
 delivery:{method:'Dostava na adresu',address:'Test 1',postalCode:'21000',city:'Novi Sad'},items,
 security:{turnstileToken:'synthetic',website:''}});
const call=(h,b=body())=>h.ctx.run(new Request('https://test/order',{method:'POST',headers:{Origin:'https://adriatictrade.rs','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(b)}));
function setup({migrate=true,open=true,quantity=20}={}) {
 const h=harness();Object.assign(h.ctx.env,{TURNSTILE_SECRET_KEY:'synthetic',SECURITY_PEPPER:'synthetic'});
 if(migrate){
  h.sql.exec(migration);
  if(open)h.sql.exec("UPDATE checkout_intake SET mode='open' WHERE id=1");
  for(const sku of ['10086','10012','10306','10307','10240'])h.sql.prepare("INSERT INTO checkout_stock VALUES (?,'available',?,'2099-01-01','SYNTHETIC TEST ONLY')").run(sku,quantity);
 }
 return h;
}
const remaining=(h,sku='10306')=>h.sql.prepare('SELECT remaining FROM checkout_stock WHERE sku=?').get(sku).remaining;
const count=h=>h.sql.prepare('SELECT COUNT(*) n FROM orders').get().n;
function noAcceptance(h){assert.equal(count(h),0);assert.equal(h.state.emails.length,0);}

test('migration defaults paused, rerun preserves state and allocates no physical stock',()=>{
 const h=harness();h.sql.exec(migration);assert.equal(h.sql.prepare('SELECT mode FROM checkout_intake').get().mode,'paused');assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM checkout_stock').get().n,0);
 h.sql.exec("UPDATE checkout_intake SET mode='open'; INSERT INTO checkout_stock VALUES ('10306','available',7,'2099-01-01','SYNTHETIC');");h.sql.exec(migration);
 assert.equal(h.sql.prepare('SELECT mode FROM checkout_intake').get().mode,'open');assert.equal(remaining(h),7);
});
test('paused or missing gate, migration, binding and database failure never accept email-only orders',async()=>{
 for(const mode of ['paused','missing-gate','missing-schema','missing-db','broken-db']){
  const h=setup({open:mode!=='paused',migrate:mode!=='missing-schema'});
  if(mode==='missing-gate')h.sql.exec('DELETE FROM checkout_intake');
  if(mode==='missing-db')delete h.ctx.env.DB;
  if(mode==='broken-db')h.ctx.env.DB={prepare(){throw Error('synthetic outage')}};
  assert.equal((await call(h)).status,503,mode);noAcceptance(h);
 }
});
test('available product accepted at boundary; quota, order and audit committed once; browser stock/price ignored',async()=>{
 const h=setup({quantity:2}),b=body([{sku:'10306',qty:2,remaining:999,unitPrice:1}]);b.stock=999;b.salesEnabled=true;
 const r=await call(h,b);assert.equal(r.status,201);assert.equal((await r.json()).total,1018);assert.equal(remaining(h),0);assert.equal(count(h),1);
 assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM checkout_admissions').get().n,1);assert.equal(h.sql.prepare("SELECT COUNT(*) n FROM order_events WHERE event_type='created'").get().n,1);assert.equal(h.state.emails.length,2);
 const retry=await call(h,b);assert.equal(retry.status,200);assert.equal((await retry.json()).duplicate,true);assert.equal(remaining(h),0);assert.equal(h.state.emails.length,2);
});
test('unavailable, zero and insufficient quantity reject the whole basket without quota debit or email',async()=>{
 for(const mode of ['unavailable','zero','insufficient']){
  const h=setup({quantity:1});if(mode==='unavailable')h.sql.exec("UPDATE checkout_stock SET state='unavailable' WHERE sku='10306'");if(mode==='zero')h.sql.exec("UPDATE checkout_stock SET remaining=0 WHERE sku='10306'");
  const b=body([{sku:'10086',qty:1},{sku:'10306',qty:2}]);const r=await call(h,b);assert.equal(r.status,409,mode);assert.equal((await r.json()).code,'PRODUCT_UNAVAILABLE');assert.equal(remaining(h,'10086'),1);noAcceptance(h);
 }
});
test('unknown state, missing row and NULL quantity fail closed; rejected submission may succeed after readiness restored',async()=>{
 for(const mode of ['unknown','missing','null']){
  const h=setup();if(mode==='missing')h.sql.exec("DELETE FROM checkout_stock WHERE sku='10306'");else h.sql.exec(mode==='null'?"UPDATE checkout_stock SET remaining=NULL WHERE sku='10306'":"UPDATE checkout_stock SET state='unknown' WHERE sku='10306'");
  const r=await call(h);assert.equal(r.status,503);assert.equal((await r.json()).code,'STOCK_UNKNOWN');noAcceptance(h);
  h.sql.exec("INSERT INTO checkout_stock VALUES ('10306','available',1,'2099-01-01','SYNTHETIC') ON CONFLICT(sku) DO UPDATE SET state='available',remaining=1");
  assert.equal((await call(h)).status,201);assert.equal(remaining(h),0);
 }
});
test('bundle quantities share components with singles and other bundles; browser contents cannot override',async()=>{
 const h=setup({quantity:3});const b=body([{sku:'PKT-PROBA',qty:1,components:[]},{sku:'PKT-GURMAN',qty:1},{sku:'10306',qty:1}]);
 assert.equal((await call(h,b)).status,201);assert.equal(remaining(h),0);assert.equal(remaining(h,'10307'),1);assert.equal(remaining(h,'10086'),1);assert.equal(remaining(h,'10240'),2);
 const blocked=await call(h,body([{sku:'PKT-PROBA',qty:1}],'availability-bundle-0002'));assert.equal(blocked.status,409);assert.equal(count(h),1);
 const premium=setup({quantity:1});assert.equal((await call(premium,body([{sku:'PKT-KOMPLET',qty:1}]))).status,201);for(const sku of ['10012','10240','10086'])assert.equal(remaining(premium,sku),0);
 const unknown=setup();unknown.sql.exec("DELETE FROM checkout_stock WHERE sku='10012'");assert.equal((await call(unknown,body([{sku:'PKT-KOMPLET',qty:1}]))).status,503);noAcceptance(unknown);
});
test('duplicate lines are merged; unknown and prototype-property SKUs are rejected',async()=>{
 const h=setup({quantity:3});assert.equal((await call(h,body([{sku:'10306',qty:1},{sku:'10306',qty:2}]))).status,201);assert.equal(remaining(h),0);
 for(const sku of ['bad','toString','constructor','__proto__']){const unknown=setup();assert.equal((await call(unknown,body([{sku,qty:1}]))).status,400);noAcceptance(unknown);}
});
test('pausing, stock deletion and exhausted quota do not block retrieval of an accepted identical submission',async()=>{
 const h=setup({quantity:1}),b=body();const first=await(await call(h,b)).json();h.sql.exec("UPDATE checkout_intake SET mode='paused'; DELETE FROM checkout_stock");
 const retry=await call(h,b),data=await retry.json();assert.equal(retry.status,200);assert.equal(data.orderId,first.orderId);assert.equal(data.duplicate,true);assert.equal(count(h),1);assert.equal(h.state.emails.length,2);
 assert.equal((await call(h,body(undefined,'availability-new-0002'))).status,503);
});
test('same ID with changed items or customer is a conflict; saved totals survive catalog/price tampering',async()=>{
 const h=setup(),b=body();assert.equal((await call(h,b)).status,201);
 for(const change of [b=>b.items[0].qty=2,b=>b.customer.email='other@example.com',b=>b.delivery.note='changed']){const changed=structuredClone(b);change(changed);const r=await call(h,changed);assert.equal(r.status,409);assert.equal((await r.json()).code,'SUBMISSION_CONFLICT');}
 assert.equal(remaining(h),19);assert.equal(h.state.emails.length,2);
});
test('gate or quantity changed immediately before commit is checked again inside the transaction',async()=>{
 for(const mode of ['gate','quantity']){
  const h=setup({quantity:1});h.state.onCommit=()=>h.sql.exec(mode==='gate'?"UPDATE checkout_intake SET mode='paused'":"UPDATE checkout_stock SET remaining=0 WHERE sku='10306'");
  assert.equal((await call(h)).status,mode==='gate'?503:409);noAcceptance(h);assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM checkout_admissions').get().n,0);
 }
});
test('order/audit insert failure rolls back every quota and admission; lost post-commit response recovers exactly once',async()=>{
 for(const table of ['orders','order_events']){
  const h=setup({quantity:1});h.sql.exec(`CREATE TRIGGER fail_accept BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'synthetic fault'); END`);
  assert.equal((await call(h)).status,503);noAcceptance(h);assert.equal(remaining(h),1);assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM checkout_admissions').get().n,0);
 }
 const h=setup({quantity:1}),batch=h.db.batch;h.ctx.env.DB={...h.db,async batch(statements){await batch(statements);throw Error('synthetic lost response');}};
 const r=await call(h);assert.equal(r.status,200);assert.equal((await r.json()).duplicate,true);assert.equal(remaining(h),0);assert.equal(count(h),1);
});
test('email failure retains the admission; retry sends from original order without a second quota debit',async()=>{
 const h=setup({quantity:1});h.state.email='error';assert.equal((await call(h)).status,502);assert.equal(count(h),1);assert.equal(remaining(h),0);
 h.sql.exec("UPDATE checkout_intake SET mode='paused'");h.state.email='ok';assert.equal((await call(h)).status,200);assert.equal(remaining(h),0);assert.equal(count(h),1);assert.equal(h.state.emailKeys[0],h.state.emailKeys[1]);
});
