import test from 'node:test';
import assert from 'node:assert/strict';
import {stockHarness as setup} from './helpers/minimax-stock-harness.mjs';
test('stock observations remain separate from quotas, paused intake and order journals',async()=>{
  const h=setup();const before=JSON.stringify(h.sql.prepare('SELECT * FROM checkout_stock').all());const revision=h.sql.prepare('SELECT revision FROM checkout_control').get().revision;
  for(const mode of ['ok','zero','negative','null','absent']){
    h.mm.mode=mode;const response=await h.stock();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
    const data=await response.json();assert.equal(data.rows.length,5);assert.equal(data.readOnly,true);assert.equal(data.warehouseId,40999);
    const row=data.rows.find(r=>r.sku==='10086');assert.equal(row.quantity,{ok:20,zero:0,negative:-2,null:null,absent:null}[mode]);assert.equal(row.state,['absent','null'].includes(mode)?'unreported':'reported');
    assert.ok(!JSON.stringify(data).includes('987654321'),'No costs or values in browser response');
  }
  assert.equal(JSON.stringify(h.sql.prepare('SELECT * FROM checkout_stock').all()),before);assert.equal(h.sql.prepare('SELECT revision FROM checkout_control').get().revision,revision);
  assert.equal(h.sql.prepare('SELECT mode FROM checkout_intake').get().mode,'paused');assert.equal(h.sql.prepare('SELECT count(*) n FROM orders').get().n,0);
  assert.equal(h.sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name='minimax_drafts'").get().n,0);
});
for(const mode of ['org','network','redirect','json','fraction','string','id','code','unit','batch','duplicate','truncated','page'])test('invalid/uncertain stock rejected without partial data: '+mode,async()=>{
  const h=setup();h.mm.mode=mode;const res=await h.stock();assert.equal(res.status,502);const data=await res.json();assert.equal(data.ok,false);assert.equal(data.rows,undefined);assert.ok(!JSON.stringify(data).includes('secret'));if(mode==='org')assert.equal(h.mm.reads,0);
});
test('authorization, exact origin, method and fixed filters precede external calls',async()=>{
  const h=setup();
  for(const [args,status] of [[['GET','',''],401],[['GET','','Bearer synthetic-admin-token-for-tests-only','https://example.invalid'],403],[['POST'],403],[['GET','?WarehouseId=42'],400]])assert.equal((await h.stock(...args)).status,status);
  assert.equal(h.mm.requests.length,0);delete h.env.MINIMAX_PASSWORD;assert.equal((await h.stock()).status,502);assert.equal(h.mm.requests.length,0);
});
test('production disabled and wrong database marker never query Minimax',async()=>{
  const h=setup();delete h.env.MINIMAX_MODE;assert.equal((await h.stock()).status,503);h.env.MINIMAX_MODE='draft';h.sql.exec("UPDATE minimax_environment SET name='production'");assert.equal((await h.stock()).status,503);assert.equal(h.mm.requests.length,0);
  // Shared production Worker is also default-off, even after successful admin authentication.
  delete h.ctx.env.MINIMAX_MODE;
  const result=await h.ctx.run(new Request('https://test/admin/minimax-stock',{headers:{Origin:'https://adriatictrade.rs',Authorization:'Bearer synthetic-admin-token-for-tests-only'}}));assert.equal(result.status,404);
});

for(const [step,status] of [['authentication',400],['organisation',403],['stock',404],['stock',429],['stock',500]])test(`HTTP diagnostic identifies ${step} ${status} without provider content`,async()=>{
  const h=setup();h.mm.httpStep=step;h.mm.httpStatus=status;
  const before=JSON.stringify(h.sql.prepare('SELECT * FROM checkout_stock').all());
  const response=await h.stock();assert.equal(response.status,502);
  const data=await response.json();assert.equal(data.code,'MINIMAX_HTTP_ERROR');assert.equal(data.step,step);assert.equal(data.upstreamStatus,status);
  assert.equal(data.rows,undefined);
  if(step==='stock')assert.ok(['10012','10086','10240','10306','10307'].includes(data.sku));else assert.equal(data.sku,null);
  assert.ok(!JSON.stringify(data).includes('synthetic'));assert.ok(!JSON.stringify(data).includes('secret'));
  assert.equal(response.headers.get('X-Private'),null);assert.equal(response.headers.get('Location'),null);
  assert.equal(JSON.stringify(h.sql.prepare('SELECT * FROM checkout_stock').all()),before);
  if(step==='authentication')assert.equal(h.mm.requests.length,1);
  if(step!=='stock')assert.equal(h.mm.reads,0);
});
test('non-HTTP failure has no invented upstream status',async()=>{
  const h=setup();h.mm.mode='network';const data=await (await h.stock()).json();
  assert.equal(data.step,'stock');assert.equal(data.code,'MINIMAX_NETWORK_ERROR');assert.equal(data.upstreamStatus,null);
});
