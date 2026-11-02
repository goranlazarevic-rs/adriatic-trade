import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {harness} from './helpers/local-delivery-harness.mjs';

export const skus=['10086','10012','10306','10307','10240'];
export function setup({migrate=true,seed=true}={}) {
  const h=harness();h.sql.exec(fs.readFileSync('cloudflare-d1-checkout-availability-v1.sql','utf8'));
  if(migrate)h.sql.exec(fs.readFileSync('cloudflare-d1-admin-availability-v1.sql','utf8'));
  if(seed)for(const sku of skus)h.sql.prepare("INSERT INTO checkout_stock VALUES (?,'available',10,'2099-01-01','Synthetic only')").run(sku);
  return h;
}
export function call(h,body,headers={}) {
  return h.ctx.run(new Request('https://test/admin/availability',{method:body===undefined?'GET':'POST',
    headers:{Origin:'https://adriatictrade.rs',Authorization:'Bearer synthetic-admin-token-for-tests-only','Content-Type':'application/json',...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)})}));
}
export const snapshot=async h=>(await call(h)).json();
export async function change(h,values={}) {return {operationId:crypto.randomUUID(),revision:(await snapshot(h)).revision,action:'quantity',sku:'10306',quantity:8,reason:'Synthetic adjustment',confirmed:true,...values};}
const remaining=h=>h.sql.prepare("SELECT remaining FROM checkout_stock WHERE sku='10306'").get().remaining;
const events=h=>h.sql.prepare('SELECT COUNT(*) n FROM checkout_control_events').get().n;

test('origin and existing bearer authentication protect reads and writes before DB access',async()=>{
 const h=setup(),b=await change(h);
 for(const body of [undefined,b])for(const [headers,status] of [[{Authorization:''},401],[{Authorization:'Bearer wrong'},401],[{Origin:'https://evil.example'},403],[{Origin:''},403]])assert.equal((await call(h,body,headers)).status,status);
 assert.equal(events(h),0);assert.equal(remaining(h),10);
});
test('missing migration returns 503, with no auto migration or stock write; reapplying migration preserves data',async()=>{
 const h=setup({migrate:false});assert.equal((await call(h)).status,503);assert.equal(h.sql.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='checkout_control'").get().n,0);
 h.sql.exec(fs.readFileSync('cloudflare-d1-admin-availability-v1.sql','utf8'));const before=await snapshot(h);
 h.sql.exec(fs.readFileSync('cloudflare-d1-admin-availability-v1.sql','utf8'));assert.equal((await snapshot(h)).revision,before.revision);assert.equal(remaining(h),10);assert.equal(before.mode,'paused');
});
test('snapshot has exactly five physical SKUs and three bundles derived from common quota; no independent allocation',async()=>{
 const h=setup();h.sql.exec("UPDATE checkout_stock SET remaining=2 WHERE sku='10086'");const s=await snapshot(h);
 assert.equal(s.products.length,5);assert.equal(s.bundles.length,3);assert.ok(s.bundles.every(b=>b.remaining===2));assert.equal(s.mode,'paused');assert.equal(s.canOpen,true);
 h.sql.exec("UPDATE checkout_stock SET state='unknown' WHERE sku='10012'");assert.equal((await snapshot(h)).bundles.find(b=>b.sku==='PKT-KOMPLET').remaining,null);
});
test('strict input validation prevents negative, fractional, string, null, huge, bundle and unknown quantities',async()=>{
 const h=setup();
 for(const patch of [{quantity:-1},{quantity:1.5},{quantity:'8'},{quantity:null},{quantity:10001},{quantity:111},{sku:'PKT-PROBA'},{sku:'toString'},{sku:'999'},{revision:'5'},{confirmed:false},{reason:'x'},{action:'adjust'},{extra:10},{operationId:'bad'}]){
  assert.equal((await call(h,await change(h,patch))).status,400,JSON.stringify(patch));assert.equal(remaining(h),10);assert.equal(events(h),0);
 }
 const b=await change(h);assert.equal((await call(h,b,{'Content-Type':'text/plain'})).status,415);
 assert.equal((await call(h,{...b,reason:'x'.repeat(5000)})).status,413);
 assert.equal((await h.ctx.run(new Request('https://test/admin/availability',{method:'POST',headers:{Origin:'https://adriatictrade.rs',Authorization:'Bearer synthetic-admin-token-for-tests-only','Content-Type':'application/json'},body:'{'}))).status,400);
});
test('increase requires exact typed SKU/new total, explicit free-stock evidence and a bounded increment; never opens sales',async()=>{
 const h=setup();
 for(const patch of [{},{increaseConfirmed:true},{increaseConfirmed:true,confirmation:'10306 12'},{increaseConfirmed:'yes',confirmation:'10306 15'}])assert.equal((await call(h,await change(h,{quantity:15,...patch}))).status,400);
 const b=await change(h,{quantity:15,increaseConfirmed:true,confirmation:'10306 15'});assert.equal((await call(h,b)).status,200);assert.equal(remaining(h),15);
 const s=await snapshot(h);assert.equal(s.mode,'paused');assert.equal(s.history.length,1);assert.equal(s.history[0].before.remaining,10);assert.equal(s.history[0].after.remaining,15);
 assert.match(s.history[0].actor,/^admin-key:[a-f0-9]{12}$/);assert.ok(!JSON.stringify(s).includes(h.ctx.env.ADMIN_TOKEN));
});
test('unknown/missing quantities require confirmation, zero blocks related bundles, all readiness conditions protect opening',async()=>{
 const h=setup({seed:false});let b=await change(h,{action:'open',sku:undefined,quantity:undefined,confirmation:'OTVORI PRODAJU',readinessConfirmed:true});
 assert.equal((await call(h,b)).status,400);
 for(const sku of skus){b=await change(h,{sku,quantity:0});assert.equal((await call(h,b)).status,200);}
 assert.equal((await snapshot(h)).canOpen,false);assert.equal((await call(h,await change(h,{action:'open',sku:undefined,quantity:undefined,confirmation:'OTVORI PRODAJU',readinessConfirmed:true}))).status,400);
 assert.equal((await call(h,await change(h,{quantity:5,increaseConfirmed:true,confirmation:'10306 5'}))).status,200);
 for(const patch of [{},{confirmation:'OTVORI PRODAJU'},{confirmation:'OTVORI PRODAJU',readinessConfirmed:'yes'}])assert.equal((await call(h,await change(h,{action:'open',sku:undefined,quantity:undefined,...patch}))).status,400);
 assert.equal((await call(h,await change(h,{action:'open',sku:undefined,quantity:undefined,confirmation:'OTVORI PRODAJU',readinessConfirmed:true}))).status,200);
 assert.equal((await snapshot(h)).mode,'open');assert.equal((await snapshot(h)).bundles[0].remaining,0);
 assert.equal((await call(h,await change(h,{action:'pause',sku:undefined,quantity:undefined}))).status,200);assert.equal((await snapshot(h)).mode,'paused');assert.equal(remaining(h),5);
});
test('re-enabling unknown or unavailable stock counts the entire released quantity as an increase',async()=>{
 for(const state of ['unknown','unavailable']){
  const h=setup();h.sql.prepare("UPDATE checkout_stock SET state=? WHERE sku='10306'").run(state);
  assert.equal((await call(h,await change(h,{quantity:10}))).status,400);
  assert.equal((await call(h,await change(h,{quantity:101,increaseConfirmed:true,confirmation:'10306 101'}))).status,400);
  assert.equal((await call(h,await change(h,{quantity:10,increaseConfirmed:true,confirmation:'10306 10'}))).status,200);
 }
});
test('same operation retries and simultaneous duplicates apply once; reuse with changed content conflicts',async()=>{
 const h=setup(),b=await change(h);const responses=await Promise.all([call(h,b),call(h,b),call(h,b)]);
 assert.ok(responses.every(r=>r.status===200));assert.equal(events(h),1);assert.equal(remaining(h),8);
 assert.equal((await (await call(h,b)).json()).duplicate,true);assert.equal((await call(h,{...b,reason:'Changed reason'})).status,409);
 assert.equal(events(h),1);
});
test('two admins cannot overwrite each other; a new order invalidates an old absolute correction',async()=>{
 const h=setup(),b=await change(h),other={...b,operationId:crypto.randomUUID(),quantity:7};
 assert.equal((await call(h,b)).status,200);assert.equal((await call(h,other)).status,409);assert.equal(remaining(h),8);
 const stale=await change(h);
 h.sql.exec("UPDATE checkout_stock SET remaining=remaining-1 WHERE sku='10306'");assert.equal((await call(h,stale)).status,409);assert.equal(remaining(h),7);
});
test('transaction rechecks revision at commit; stock, intake and audit errors roll back together',async()=>{
 for(const action of ['quantity','open']){
  const h=setup();const b=await change(h,action==='open'?{action,sku:undefined,quantity:undefined,readinessConfirmed:true,confirmation:'OTVORI PRODAJU'}:{});
  h.state.onCommit=()=>h.sql.exec("UPDATE checkout_stock SET remaining=9 WHERE sku='10306'");
  assert.equal((await call(h,b)).status,409);assert.equal(events(h),0);assert.equal(remaining(h),9);assert.equal((await snapshot(h)).mode,'paused');
 }
 for(const table of ['checkout_stock','checkout_intake']){
  const h=setup(),b=await change(h,table==='checkout_intake'?{action:'open',sku:undefined,quantity:undefined,readinessConfirmed:true,confirmation:'OTVORI PRODAJU'}:{}),s=await snapshot(h);
  h.sql.exec(`CREATE TRIGGER fail_control BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'synthetic'); END`);
  assert.equal((await call(h,b)).status,503);assert.equal(events(h),0);assert.equal(remaining(h),10);assert.equal((await snapshot(h)).revision,s.revision);
 }
 const h=setup(),b=await change(h);h.sql.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON checkout_control_events BEGIN SELECT RAISE(ABORT,'synthetic'); END");assert.equal((await call(h,b)).status,503);assert.equal(remaining(h),10);
});
test('lost commit response recovers using original operation without duplicating correction',async()=>{
 const h=setup(),b=await change(h),batch=h.db.batch;h.ctx.env.DB={...h.db,async batch(s){await batch(s);throw Error('lost response');}};
 const r=await call(h,b);assert.equal(r.status,200);assert.equal((await r.json()).duplicate,true);assert.equal(events(h),1);assert.equal(remaining(h),8);
});
test('read never creates missing gate or enables sales; deleted gate blocks changes',async()=>{
 const h=setup(),b=await change(h);h.sql.exec('DELETE FROM checkout_intake');assert.equal((await call(h)).status,503);assert.equal((await call(h,b)).status,503);assert.equal(events(h),0);
});
