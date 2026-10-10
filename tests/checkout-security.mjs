import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {harness} from './helpers/local-delivery-harness.mjs';
const body=(items=[{sku:'10306',qty:1}])=>({submissionId:'test-submission-000001',customer:{firstName:'Test',lastName:'Kupac',email:'test@example.com',phone:'060000000'},delivery:{method:'Dostava na adresu',address:'Test 1',postalCode:'21000',city:'Novi Sad'},items,security:{turnstileToken:'test-valid-token',website:''}});
const req=()=>new Request('https://test/order',{headers:{Origin:'https://adriatictrade.rs','CF-Connecting-IP':'192.0.2.1'}});
const call=(h,b)=>h.ctx.run(new Request('https://test/order',{method:'POST',headers:{Origin:'https://adriatictrade.rs','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(b)}));
test('valid Turnstile is accepted; invalid, expired, missing, wrong action and hostname are rejected',async()=>{
 const h=harness();h.ctx.env.TURNSTILE_SECRET_KEY='synthetic';
 assert.equal((await h.ctx.verifyTurnstile(req(),h.ctx.env,'valid')).ok,true);
 for(const result of [{success:false,'error-codes':['invalid-input-response']},{success:false,'error-codes':['timeout-or-duplicate']},{success:true,action:'other',hostname:'adriatictrade.rs'},{success:true,action:'checkout_order',hostname:'evil.example'}]){h.state.turnstile=result;assert.equal((await h.ctx.verifyTurnstile(req(),h.ctx.env,'invalid')).status,403);}
 assert.equal((await h.ctx.verifyTurnstile(req(),h.ctx.env,'')).status,403);delete h.ctx.env.TURNSTILE_SECRET_KEY;assert.equal((await h.ctx.verifyTurnstile(req(),h.ctx.env,'valid')).status,503);
 assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM orders').get().n,0);assert.equal(h.state.emails.length,0);
});
test('honeypot and missing token do not persist an order or send email',async()=>{
 const h=harness();h.ctx.env.TURNSTILE_SECRET_KEY='synthetic';const b=body();b.security.website='spam';assert.equal((await call(h,b)).status,400);b.security.website='';b.security.turnstileToken='';assert.equal((await call(h,b)).status,403);assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM orders').get().n,0);assert.equal(h.state.emails.length,0);
});
test('concurrent submissions cannot exceed five per IP per hour, duplicate is allowed, boundary resets',async()=>{
 const h=harness();h.ctx.env.SECURITY_PEPPER='synthetic';
 const result=await Promise.all(Array.from({length:12},(_,i)=>h.ctx.enforceOrderRateLimit(req(),h.ctx.env,'submission-'+i)));
 assert.equal(result.filter(r=>r.ok).length,5);assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM security_order_attempts').get().n,5);
 assert.equal((await h.ctx.enforceOrderRateLimit(req(),h.ctx.env,'submission-0')).duplicateAttempt,true);
 // Freeze the clock and place all five reservations exactly on the inclusive boundary.
 const now=Date.now();vm.runInContext('globalThis.Date=class extends Date {static now(){return '+now+'}}',h.ctx);
 h.sql.prepare('UPDATE security_order_attempts SET created_at=?').run(now-3600000);
 assert.equal((await h.ctx.enforceOrderRateLimit(req(),h.ctx.env,'boundary')).ok,false);
 h.sql.prepare('UPDATE security_order_attempts SET created_at=?').run(now-3600001);
 assert.equal((await h.ctx.enforceOrderRateLimit(req(),h.ctx.env,'reset')).ok,true);
 assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM security_order_attempts WHERE created_at=?').get(now).n,1);
});
test('server ignores tampered prices, total and payment, rejects unknown SKU and excess quantity',()=>{
 const h=harness(),b=body();b.items[0].unitPrice=1;b.total=1;b.shipping=0;b.payment='Lična dostava — gotovina';const v=h.ctx.validateOrder(b);assert.equal(v.ok,true);const o=h.ctx.buildOrder(v.data);assert.equal(o.goodsTotal,299);assert.equal(o.shipping,420);assert.equal(o.total,719);assert.equal(o.payment,'Pouzećem');
 for(const items of [[{sku:'bad',qty:1}],[{sku:'10306',qty:11}],[{sku:'10306',qty:6},{sku:'10306',qty:6}]])assert.equal(h.ctx.validateOrder(body(items)).ok,false);
});
test('frontend/backend catalog, bundles and promotion boundaries match Belgrade local dates',()=>{
 const h=harness();const frontend=fs.readFileSync('assets/js/main.js','utf8').split('applyScheduledPrices();')[0];
 const ui=vm.createContext({Intl,Date,document:{},window:{},localStorage:{}});vm.runInContext(frontend,ui);
 const products=vm.runInContext('PRODUCTS',ui),backend=vm.runInContext('PRODUCTS',h.ctx);
 assert.deepEqual(Object.keys(products).sort(),Object.keys(backend).sort());for(const sku of Object.keys(products))assert.equal(products[sku].price,backend[sku].price,sku);
 for(const [instant,expected] of [['2026-09-26T21:59:59Z',550],['2026-09-26T22:00:00Z',499],['2026-10-26T22:59:59Z',499],['2026-10-26T23:00:00Z',550]]){
  const date=new Date(instant);h.ctx.date=date;ui.date=date;const active=vm.runInContext('promoActive(PROMOTIONS["10240"],belgradeDateKey(date))',ui);assert.equal(vm.runInContext('currentProductPrice("10240",date)',h.ctx),expected);assert.equal(active?499:550,expected);
 }
});
test('delivery costs below, at and above 3500 RSD are computed server-side',()=>{
 const h=harness();const products=vm.runInContext('PRODUCTS',h.ctx);const old=products['10086'].price;
 // Boundary values use a controlled catalog price; no production fixture is written.
 for(const amount of [3499,3500,3501]){products['10086'].price=amount;const o=h.ctx.buildOrder(h.ctx.validateOrder(body([{sku:'10086',qty:1}])).data);assert.equal(o.goodsTotal,amount);assert.equal(o.shipping,amount<3500?420:0);assert.equal(o.total,amount+(amount<3500?420:0));}products['10086'].price=old;
});
