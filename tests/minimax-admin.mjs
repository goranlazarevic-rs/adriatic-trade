import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {harness} from './helpers/local-delivery-harness.mjs';
import {fixtures} from '../tools/minimax-staging/fixtures.mjs';
import {ITEMS} from '../tools/minimax-draft/model.mjs';

async function setup(fixture=fixtures()[0],mode='ok'){
  const h=harness();h.ctx.URLSearchParams=URLSearchParams;
  await h.ctx.insert(fixture);
  await h.get(fixture.id);
  h.sql.prepare("UPDATE orders SET status='confirmed' WHERE id=?").run(fixture.id);
  h.sql.exec("CREATE TABLE minimax_environment(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO minimax_environment VALUES(1,'minimax-staging')");
  Object.assign(h.ctx.env,{MINIMAX_MODE:'draft',MINIMAX_ENV:'staging',MINIMAX_CLIENT_ID:'synthetic-client',MINIMAX_CLIENT_SECRET:'synthetic-secret',MINIMAX_USERNAME:'adriatic-webshop',MINIMAX_PASSWORD:'synthetic-password'});
  const state={mode,posts:0,gets:0,requests:[],payload:null,id:34567890};
  h.ctx.fetch=async(url,options)=>{
    state.requests.push({url,method:options.method});
    assert.equal(options.redirect,'manual');
    if(url.includes('/AUT/oauth20/token')){
      assert.equal(new URLSearchParams(options.body).get('password'),'synthetic-password');
      return Response.json({access_token:'synthetic-token',token_type:'bearer',expires_in:3600});
    }
    assert.equal(options.headers.Authorization,'Bearer synthetic-token');
    if(url.includes('/currentuser/orgs'))return Response.json({Rows:[{Organisation:{ID:81179},APIAccess:'D'}]});
    if(url.includes('/items/pricelists'))return Response.json({ValidationMessages:[],Rows:Object.entries(ITEMS).map(([sku,c])=>({Code:sku,Item:{ID:c.id},Customer:{ID:9775669},Warehouse:null,UnitOfMeasurement:'kom',PriceWithVAT:c.gross+(state.mode==='prices'?1:0),PriceWithoutVAT:c.gross/1.2}))});
    if(url.endsWith('/issuedinvoices')&&options.method==='POST'){
      state.posts++;state.payload=JSON.parse(options.body);
      if(state.mode==='lost')throw new Error('synthetic secret provider failure');
      if(state.mode==='http')return new Response('synthetic secret provider failure',{status:500});
      return new Response('',{status:201,headers:{Location:`https://moj.minimax.rs/RS/API/api/orgs/81179/issuedinvoices/${state.id}?id=${state.id}`}});
    }
    if(url.endsWith('/issuedinvoices/'+state.id)&&options.method==='GET'){
      state.gets++;if(state.mode==='read-fail')throw new Error('readback failed');
      const result=structuredClone(state.payload);result.IssuedInvoiceId=state.id;result.InvoiceNumber=0;result.InvoiceValue=0;
      if(state.mode==='mismatch')result.IssuedInvoiceRows[0].Quantity++;
      return Response.json(result);
    }
    throw new Error('Unexpected URL');
  };
  const preview=async()=>await (await h.call(fixture.id,'minimax-draft')).json();
  const create=async(hash)=>(await h.call(fixture.id,'minimax-draft',{action:'create',previewHash:hash||((await preview()).previewHash),confirm:true}));
  const verify=async(id=state.id)=>h.call(fixture.id,'minimax-draft',{action:'verify',invoiceId:id,confirm:true});
  return {...h,id:fixture.id,mm:state,preview,create,verify};
}
for(const f of fixtures())test('exact saved totals, package units and one durable draft: '+f.id,async()=>{
  const h=await setup(f);const p=await h.preview();assert.equal(p.total,f.total);assert.equal(p.status,'preview');assert.equal(h.mm.requests.length,0);
  assert.equal(Math.round(p.rows.reduce((s,r)=>s+r.value,0)*100),f.total*100);
  assert.equal(p.rows.some(r=>r.sku==='DOSTAVA'),f.shipping>0);
  const result=await (await h.create(p.previewHash)).json();assert.equal(result.status,'verified',JSON.stringify(result));assert.equal(result.invoiceId,h.mm.id);
  assert.equal((await (await h.create()).json()).status,'verified');assert.equal(h.mm.posts,1);
  assert.equal(h.mm.payload.Status,'O');assert.equal(h.mm.payload.IssuedInvoiceRows.reduce((s,r)=>s+Math.round(r.Value*100),0),f.total*100);
  if(f.id.endsWith('PAKET')){
    assert.equal(h.mm.payload.IssuedInvoiceRows.find(r=>r.ItemCode==='10240').PriceWithVAT,499);
    for(const sku of ['10086','10306','10307'])assert.equal(p.rows.filter(r=>r.sku===sku).reduce((s,r)=>s+r.qty,0),2);
  }
});
test('disabled by default, wrong database marker, unauthenticated and real orders fail closed',async()=>{
  const h=await setup();delete h.ctx.env.MINIMAX_MODE;assert.equal((await h.call(h.id,'minimax-draft')).status,404);
  h.ctx.env.MINIMAX_MODE='draft';h.sql.exec("UPDATE minimax_environment SET name='production'");assert.equal((await h.call(h.id,'minimax-draft')).status,404);
  h.sql.exec("UPDATE minimax_environment SET name='minimax-staging'");h.ctx.env.ADMIN_TOKEN='another-synthetic-admin-token';assert.equal((await h.call(h.id,'minimax-draft')).status,401);
  h.ctx.env.ADMIN_TOKEN='synthetic-admin-token-for-tests-only';h.sql.prepare("UPDATE orders SET customer_email='real@example.com' WHERE id=?").run(h.id);
  assert.equal((await h.call(h.id,'minimax-draft')).status,409);assert.equal(h.mm.requests.length,0);
});
test('stale preview and missing private secrets never POST',async()=>{
  const h=await setup();const p=await h.preview();h.sql.prepare('UPDATE orders SET total=total+1 WHERE id=?').run(h.id);
  assert.equal((await h.create(p.previewHash)).status,409);assert.equal(h.mm.posts,0);
  h.sql.prepare('UPDATE orders SET total=total-1 WHERE id=?').run(h.id);delete h.ctx.env.MINIMAX_PASSWORD;
  assert.equal((await h.create()).status,409);assert.equal(h.mm.requests.length,0);
});
test('fresh customer price failure is preflight-only and creates no journal',async()=>{
  const h=await setup(undefined,'prices');assert.equal((await h.create()).status,409);assert.equal(h.mm.posts,0);
  assert.equal(h.sql.prepare('SELECT count(*) n FROM minimax_drafts').get().n,0);
});
for(const mode of ['lost','http'])test('uncertain '+mode+' outcome never resends; ID reconciliation reads only',async()=>{
  const h=await setup(undefined,mode);const failed=await (await h.create()).json();assert.equal(failed.ok,false);assert.ok(!failed.error.includes('synthetic secret'));
  assert.equal((await h.preview()).status,'attention');await h.create();assert.equal(h.mm.posts,1);
  h.mm.mode='ok';const verified=await (await h.verify()).json();assert.equal(verified.status,'verified',JSON.stringify(verified));assert.equal(h.mm.posts,1);
});
test('ID persisted before failed readback and mismatch never verifies',async()=>{
  const h=await setup(undefined,'read-fail');assert.equal((await h.create()).status,409);const p=await h.preview();assert.equal(p.status,'created');assert.equal(p.invoiceId,h.mm.id);
  h.mm.mode='mismatch';assert.equal((await h.verify()).status,409);assert.equal((await h.preview()).status,'created');h.mm.mode='ok';assert.equal((await (await h.verify()).json()).status,'verified');assert.equal(h.mm.posts,1);
});
test('concurrent create clicks produce one POST',async()=>{
  const h=await setup();const p=await h.preview();await Promise.all([h.create(p.previewHash),h.create(p.previewHash)]);assert.equal(h.mm.posts,1);assert.equal((await h.preview()).status,'verified');
});
test('order revision change at claim prevents POST',async()=>{
  const h=await setup();const p=await h.preview();h.state.onCommit=()=>h.sql.prepare('UPDATE order_operations SET revision=revision+1 WHERE order_id=?').run(h.id);
  assert.equal((await h.create(p.previewHash)).status,409);assert.equal(h.mm.posts,0);assert.equal(h.sql.prepare('SELECT count(*) n FROM minimax_drafts').get().n,0);
});
test('pending attempt locks order changes and source changes are reported',async()=>{
  const h=await setup(undefined,'lost');await h.create();assert.equal((await h.call(h.id,'cancel',{reasonCode:'other',note:'test'})).status,409);
  h.sql.prepare("UPDATE orders SET updated_at='2099-01-01' WHERE id=?").run(h.id);assert.equal((await h.preview()).sourceChanged,true);assert.equal((await h.verify()).status,409);assert.equal(h.mm.posts,1);
});
test('missing historical package composition, paid orders and COD are blocked',async()=>{
  for(const change of ['package','paid','cod']){
    const f=fixtures()[1];if(change==='package')delete f.items[0].bundleComponents;
    const h=await setup(f);if(change==='paid')h.sql.prepare("UPDATE order_operations SET data_json=? WHERE order_id=?").run(JSON.stringify({paymentStatus:'paid'}),h.id);
    if(change==='cod')h.sql.prepare("UPDATE orders SET payment='Pouzećem' WHERE id=?").run(h.id);
    assert.equal((await h.call(h.id,'minimax-draft')).status,409);assert.equal(h.mm.requests.length,0);
  }
});
test('Location rejects mismatched query and foreign host',async()=>{
  const h=await setup();const location=vm.runInContext('mmLocation',h.ctx);
  for(const url of ['https://evil.example/api/orgs/81179/issuedinvoices/42','https://moj.minimax.rs/RS/API/api/orgs/81179/issuedinvoices/42?id=43','https://moj.minimax.rs/RS/API/api/orgs/81179/issuedinvoices/42?id=42&id=42'])assert.throws(()=>location(url));
});
