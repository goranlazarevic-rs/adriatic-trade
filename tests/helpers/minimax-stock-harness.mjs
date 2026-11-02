import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {harness} from './local-delivery-harness.mjs';
import {ITEMS} from '../../tools/minimax-draft/model.mjs';
const host='https://adriatic-trade-minimax-staging.lakifinance.workers.dev';
export function stockHarness(){
  const h=harness();h.ctx.URLSearchParams=URLSearchParams;
  for(const file of ['cloudflare-d1-checkout-availability-v1.sql','cloudflare-d1-admin-availability-v1.sql'])h.sql.exec(fs.readFileSync(file,'utf8'));
  h.sql.exec("CREATE TABLE minimax_environment(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO minimax_environment VALUES(1,'minimax-staging');INSERT INTO checkout_stock VALUES('10086','available',3,'2099-01-01','Synthetic test')");
  Object.assign(h.ctx.env,{MINIMAX_ENV:'staging',MINIMAX_MODE:'draft',MINIMAX_CLIENT_ID:'synthetic-client',MINIMAX_CLIENT_SECRET:'synthetic-secret',MINIMAX_USERNAME:'adriatic-webshop',MINIMAX_PASSWORD:'synthetic-password'});
  vm.runInContext('globalThis.orders=worker;',h.ctx);
  vm.runInContext(fs.readFileSync('worker/minimax-staging.js','utf8').replace(/^import orders[^\n]+\n/,'').replace('export default','globalThis.stage ='),h.ctx);
  const state={mode:'ok',requests:[],reads:0};
  h.ctx.fetch=async(url,options)=>{
    state.requests.push({url,method:options.method});assert.equal(options.redirect,'manual');assert.equal(new URL(url).origin,'https://moj.minimax.rs');
    if(url.endsWith('/oauth20/token'))return Response.json({access_token:'synthetic-token',token_type:'bearer'});
    assert.equal(options.method,'GET','No external mutation after OAuth');
    if(url.includes('/currentuser/orgs'))return Response.json({Rows:[{Organisation:{ID:state.mode==='org'?42:81179},APIAccess:'D'}]});
    const u=new URL(url);assert.equal(u.pathname,'/RS/API/api/orgs/81179/stocks');
    assert.equal(u.searchParams.get('WarehouseId'),'40999');assert.equal(u.searchParams.get('Mode'),'1');assert.equal(u.searchParams.get('CurrentPage'),'1');
    const [sku,item]=Object.entries(ITEMS).find(([sku,v])=>sku!=='DOSTAVA'&&String(v.id)===u.searchParams.get('ItemID'))||[];assert.ok(sku);state.reads++;
    if(state.mode==='network')throw Error('synthetic secret from upstream');
    if(state.mode==='redirect')return new Response(null,{status:302,headers:{Location:'https://example.invalid/secret'}});
    if(state.mode==='json')return new Response('not json secret');
    const row={Item:{ID:item.id},ItemCode:sku,UnitOfMeasurement:'kom',Quantity:20,AveragePurchasePrice:987654321,Value:987654321,BatchNumber:null};
    if(sku==='10086'){
      if(state.mode==='zero')row.Quantity=0;
      if(state.mode==='negative')row.Quantity=-2;
      if(state.mode==='null')row.Quantity=null;
      if(state.mode==='fraction')row.Quantity=1.5;
      if(state.mode==='string')row.Quantity='20';
      if(state.mode==='id')row.Item.ID++;
      if(state.mode==='code')row.ItemCode='wrong';
      if(state.mode==='unit')row.UnitOfMeasurement='kg';
      if(state.mode==='batch')row.BatchNumber='lot1';
    }
    const rows=sku==='10086'&&state.mode==='absent'?[]:[row];
    if(state.mode==='duplicate'&&sku==='10086')rows.push(row);
    return Response.json({Rows:rows,TotalRows:state.mode==='truncated'?101:rows.length,CurrentPageNumber:state.mode==='page'?2:1,PageSize:100});
  };
  // Reject ANY database write on this endpoint, including lazy schema initialization.
  const readDB={prepare(query){assert.match(query,/^SELECT /);return h.db.prepare(query);},batch(){assert.fail('Stock read cannot write D1');}};
  const env={...h.ctx.env,DB:readDB};
  const call=(method='GET',suffix='',authorization='Bearer synthetic-admin-token-for-tests-only',origin=host)=>h.ctx.stage.fetch(new Request(host+'/admin/minimax-stock'+suffix,{method,headers:{Origin:origin,Authorization:authorization}}),env,{});
  return {...h,mm:state,env,stock:call};
}
