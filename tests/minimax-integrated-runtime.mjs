import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {ITEMS} from '../tools/minimax-draft/model.mjs';
const require=createRequire(import.meta.url);
const {Miniflare,Response:MFResponse,convertV4MiniflareOptions}=require(process.env.MINIFLARE_MODULE_PATH||'miniflare');
const host='https://adriatic-trade-minimax-staging.lakifinance.workers.dev';
const headers={Origin:host,Authorization:'Bearer synthetic-admin-token-for-tests-only','Content-Type':'application/json'};
const invoices=new Map(),posts=[];let loseCreate=false,failRead=false,invalidStock=false,stockFailure=false;const stockTimes=[];const stockIds=[];
const mf=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:'worker/minimax-staging.js'},{type:'ESModule',path:'worker/adriatic-trade-worker-v4.5.0.js'}],compatibilityDate:'2026-10-02',d1Databases:['DB'],
  serviceBindings:{ASSETS:async()=>new MFResponse('synthetic asset')},
  bindings:{ADMIN_TOKEN:'synthetic-admin-token-for-tests-only',MINIMAX_ENV:'staging',MINIMAX_MODE:'draft',MINIMAX_CLIENT_ID:'synthetic',MINIMAX_CLIENT_SECRET:'synthetic',MINIMAX_USERNAME:'adriatic-webshop',MINIMAX_PASSWORD:'synthetic'},
  outboundService:async request=>{
    const url=new URL(request.url);assert.equal(url.hostname,'moj.minimax.rs','Never call email/courier/Turnstile/other services');
    let body;
    if(url.pathname.endsWith('/oauth20/token'))body={access_token:'synthetic',token_type:'bearer'};
    else if(url.pathname.endsWith('/currentuser/orgs'))body={Rows:[{Organisation:{ID:81179},APIAccess:'D'}]};
    else if(url.pathname.endsWith('/stocks')){
      stockTimes.push(Date.now());stockIds.push(url.searchParams.get('ItemID'));
      assert.equal(request.method,'GET');assert.equal(url.searchParams.get('WarehouseId'),'40999');
      if(stockFailure&&url.searchParams.get('ItemID')===String(ITEMS['10240'].id))return new MFResponse('private provider body',{status:503});
      const [sku,item]=Object.entries(ITEMS).find(([sku,v])=>sku!=='DOSTAVA'&&String(v.id)===url.searchParams.get('ItemID'))||[];assert.ok(sku);
      body={Rows:[{Item:{ID:item.id},ItemCode:sku,UnitOfMeasurement:'kom',Quantity:23,AveragePurchasePrice:987654321}],TotalRows:invalidStock?2:1,CurrentPageNumber:1,PageSize:100};
    }
    else if(url.pathname.endsWith('/items/pricelists'))body={ValidationMessages:[],Rows:Object.entries(ITEMS).map(([Code,v])=>({Code,Item:{ID:v.id},Customer:{ID:9775669},Warehouse:null,UnitOfMeasurement:'kom',PriceWithVAT:v.gross,PriceWithoutVAT:v.gross/1.2}))};
    else if(request.method==='POST'&&url.pathname.endsWith('/issuedinvoices')){
      const payload=await request.json(),id=35000000+posts.length;posts.push(payload);invoices.set(id,{...payload,IssuedInvoiceId:id,InvoiceNumber:0});
      // A committed remote invoice with an ambiguous response must never be recreated.
      if(loseCreate)return new MFResponse('synthetic failure',{status:502});
      return new MFResponse('',{status:201,headers:{Location:`https://moj.minimax.rs/RS/API/api/orgs/81179/issuedinvoices/${id}?id=${id}`}});
    }else if(request.method==='GET'&&/\/issuedinvoices\/\d+$/.test(url.pathname)){
      if(failRead)return new MFResponse('synthetic read failure',{status:503});
      body=invoices.get(Number(url.pathname.split('/').pop()));assert.ok(body,'Known synthetic invoice only');
    }else throw Error('Unexpected provider request');
    return new MFResponse(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
  }}));
const call=(p,body,extra={})=>mf.dispatchFetch(host+p,{headers,method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)}),...extra});
const data=async(p,body)=>{const r=await call(p,body),j=await r.json();assert.ok(r.ok,JSON.stringify(j));return j;};
const admit=scenario=>call('/admin/probe-orders',{scenario,confirm:true});
const confirm=id=>data('/admin/probe-orders/'+id+'/confirm',{confirm:true});
const draft=id=>'/admin/orders/'+id+'/minimax-draft';
const preview=id=>data(draft(id));
const create=async id=>data(draft(id),{action:'create',confirm:true,previewHash:(await preview(id)).previewHash});
const quota=()=>data('/admin/availability');
const change=async body=>data('/admin/availability',{operationId:crypto.randomUUID(),revision:(await quota()).revision,reason:'Synthetic integration test',confirmed:true,...body});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'adriatic-integrated-'));
try {
  const prepared=spawnSync(process.execPath,['tools/minimax-staging/prepare.mjs',temp],{encoding:'utf8'});assert.equal(prepared.status,0,prepared.stderr);
  const db=await mf.getD1Database('DB');
  const seed=async()=>{for(const sql of fs.readFileSync(path.join(temp,'seed.sql'),'utf8').split(/;[ \t]*(?:\n|$)/).filter(s=>s.trim()))await db.prepare(sql).run();};
  await seed();
  const stockBefore=await quota();
  assert.equal((await call('/admin/minimax-stock',undefined,{headers:{Origin:host}})).status,401);
  assert.equal((await call('/admin/minimax-stock',{})).status,403);
  const observed=await data('/admin/minimax-stock');assert.equal(observed.rows.length,5);assert.ok(observed.rows.every(r=>r.quantity===23));assert.ok(!JSON.stringify(observed).includes('987654321'));
  assert.equal(stockTimes.length,5);for(let i=1;i<stockTimes.length;i++)assert.ok(stockTimes[i]-stockTimes[i-1]>=450,'Stock calls must be paced in real workerd');
  const beforeFailure=stockTimes.length;stockFailure=true;
  const failure=await call('/admin/minimax-stock'),failureData=await failure.json();assert.equal(failure.status,502);assert.equal(failureData.upstreamStatus,503);assert.equal(failureData.sku,'10240');assert.equal(failureData.rows,undefined);
  assert.equal(stockTimes.length-beforeFailure,3,'Stops at failing third SKU, without retry');assert.deepEqual(stockIds.slice(beforeFailure),['10012','10086','10240'].map(sku=>String(ITEMS[sku].id)));stockFailure=false;
  invalidStock=true;assert.equal((await call('/admin/minimax-stock')).status,502);invalidStock=false;
  assert.deepEqual(await quota(),stockBefore);assert.equal(posts.length,0);
  console.log('PASS stock GET in real workerd/D1: paced sequential reads, stop on 503, fixed warehouse/items, auth/method/invalid response, no invoice POST, quotas/revision/pause unchanged');
  const oldIds=['AT-MMTEST-STANDARD','AT-MMTEST-PAKET','AT-MMTEST-BESPLATNA'],oldInvoices=[];
  for(const id of oldIds){await data('/admin/orders/'+id);oldInvoices.push((await create(id)).invoiceId);}
  const preserved=await db.prepare('SELECT * FROM minimax_drafts ORDER BY order_id').all();
  await seed();assert.deepEqual((await db.prepare('SELECT * FROM minimax_drafts ORDER BY order_id').all()).results,preserved.results);
  for(let i=0;i<oldIds.length;i++){assert.equal((await preview(oldIds[i])).invoiceId,oldInvoices[i]);await data(draft(oldIds[i]),{action:'verify',confirm:true});}
  assert.equal(posts.length,3,'Upgrade/recheck of original drafts never creates a new invoice');
  console.log('PASS original three draft journals, invoice IDs and sources survive upgrade/reseed; GET verification only');

  assert.equal((await call('/admin/probe-orders',{scenario:'PAKET',confirm:true},{headers:{Origin:host}})).status,401);
  assert.equal((await call('/admin/probe-orders',{scenario:'PAKET',confirm:true},{headers:{...headers,Origin:'https://evil.example'}})).status,403);
  assert.equal((await call('/admin/probe-orders',{scenario:'PAKET',confirm:true},{headers:{Authorization:headers.Authorization,'Content-Type':'application/json'}})).status,403);
  for(const body of [{scenario:['PAKET'],confirm:true},{scenario:'__proto__',confirm:true},{scenario:'PAKET',confirm:false},{scenario:'PAKET',confirm:true,items:[]},{scenario:'PAKET',confirm:true,price:1},{scenario:'PAKET',confirm:true,customer:{email:'real@example.com'}}])assert.equal((await call('/admin/probe-orders',body)).status,400);
  assert.equal((await admit('PAKET')).status,503,'Paused intake');
  assert.equal((await db.prepare('SELECT count(*) n FROM checkout_admissions').first()).n,0);
  assert.equal((await quota()).mode,'paused');
  for(const sku of ['10086','10012','10306','10307','10240'])await change({action:'quantity',sku,quantity:10,increaseConfirmed:true,confirmation:sku+' 10'});
  await change({action:'open',readinessConfirmed:true,confirmation:'OTVORI PRODAJU'});
  await change({action:'quantity',sku:'10307',quantity:0});assert.equal((await admit('PAKET')).status,409);
  assert.equal((await db.prepare("SELECT remaining FROM checkout_stock WHERE sku='10086'").first()).remaining,10,'Partial stock failure must roll back all components');
  await change({action:'quantity',sku:'10307',quantity:10,increaseConfirmed:true,confirmation:'10307 10'});
  console.log('PASS authentication, exact origin, fixed cart restrictions, paused intake and unavailable shared component');

  const before=await quota(),responses=await Promise.all(Array.from({length:8},()=>admit('PAKET')));
  assert.ok(responses.every(r=>[200,201].includes(r.status)));
  const accepted=await Promise.all(responses.map(r=>r.json())),id='AT-MMTEST-FLOW-PAKET';
  assert.ok(accepted.every(r=>r.order.id===id&&r.order.total===3270));assert.equal(accepted.filter(r=>!r.duplicate).length,1);
  assert.equal((await db.prepare('SELECT count(*) n FROM checkout_admissions').first()).n,1);
  const snapshot=await quota();for(const [sku,remaining] of Object.entries({'10086':8,'10012':10,'10306':8,'10307':8,'10240':9}))assert.equal(snapshot.products.find(p=>p.sku===sku).remaining,remaining);
  const stale=await call('/admin/availability',{operationId:crypto.randomUUID(),revision:before.revision,action:'quantity',sku:'10086',quantity:9,reason:'Synthetic stale correction',confirmed:true,increaseConfirmed:true,confirmation:'10086 9'});assert.equal(stale.status,409);
  await change({action:'pause'});assert.equal((await data('/admin/probe-orders',{scenario:'PAKET',confirm:true})).duplicate,true);
  assert.equal((await preview(id).catch(()=>null)),null,'Unconfirmed order cannot build a Minimax plan');
  await Promise.all(Array.from({length:8},()=>confirm(id)));assert.equal((await db.prepare("SELECT count(*) n FROM order_events WHERE order_id=? AND event_type='probe_confirmed'").bind(id).first()).n,1);
  const p=await preview(id);assert.equal(p.total,3270);assert.equal(p.rows.find(r=>r.sku==='10240').price,550,'New admission uses current server price, not the old promo fixture');
  const attempts=await Promise.all(Array.from({length:8},()=>call(draft(id),{action:'create',confirm:true,previewHash:p.previewHash})));
  assert.ok(attempts.every(r=>r.ok));assert.equal(posts.length,4,'One draft POST for eight create clicks');
  const verified=await preview(id);assert.equal(verified.status,'verified');const original=accepted[0].order;
  await db.prepare("UPDATE checkout_stock SET remaining=0 WHERE sku='10086'").run();
  const replay=await data('/admin/probe-orders',{scenario:'PAKET',confirm:true});assert.equal(replay.order.id,id);assert.deepEqual(replay.order.items,original.items);assert.equal(replay.order.total,original.total);
  await data(draft(id),{action:'verify',confirm:true});await create(id);assert.equal((await preview(id)).invoiceId,verified.invoiceId);assert.equal(posts.length,4);
  assert.equal((await db.prepare('SELECT count(*) n FROM checkout_admissions').first()).n,1);
  console.log('PASS 8 intake retries -> one quota debit; stale quota edit blocked; 8 confirmations -> one event; 8 creates -> one draft; pause/stock changes preserve ID, price and components');

  for(const sku of ['10086','10012','10306','10307','10240'])await change({action:'quantity',sku,quantity:20,increaseConfirmed:true,confirmation:sku+' 20'});
  await change({action:'open',readinessConfirmed:true,confirmation:'OTVORI PRODAJU'});
  const rollbackBefore=await quota(),admissionsBefore=(await db.prepare('SELECT count(*) n FROM checkout_admissions').first()).n;
  await db.prepare("CREATE TRIGGER synthetic_order_failure BEFORE INSERT ON orders WHEN NEW.id='AT-MMTEST-FLOW-STANDARD' BEGIN SELECT RAISE(ABORT,'synthetic'); END").run();
  assert.equal((await admit('STANDARD')).status,503);
  assert.deepEqual(await quota(),rollbackBefore,'Failed order insert rolls back every debit and control revision');
  assert.equal((await db.prepare('SELECT count(*) n FROM checkout_admissions').first()).n,admissionsBefore);
  await db.prepare('DROP TRIGGER synthetic_order_failure').run();
  console.log('PASS integrated admission failure rolls back order, component quotas, audit and revision');
  for(const [scenario,total] of [['STANDARD',2968],['BESPLATNA',3600],['GURMAN',3720]]) {
    const o=await data('/admin/probe-orders',{scenario,confirm:true});await confirm(o.order.id);
    const view=await preview(o.order.id);assert.equal(view.total,total);assert.equal(view.rows.some(r=>r.sku==='DOSTAVA'),scenario!=='BESPLATNA');
    if(scenario==='BESPLATNA'){
      loseCreate=true;const start=posts.length;assert.equal((await call(draft(o.order.id),{action:'create',confirm:true,previewHash:view.previewHash})).status,409);
      await create(o.order.id);assert.equal(posts.length,start+1);loseCreate=false;
      await data(draft(o.order.id),{action:'verify',confirm:true,invoiceId:35000000+start});assert.equal((await preview(o.order.id)).status,'verified');
    }else {if(scenario==='GURMAN')failRead=true;
      const r=await call(draft(o.order.id),{action:'create',confirm:true,previewHash:view.previewHash});assert.equal(r.status,scenario==='GURMAN'?409:200);
      failRead=false;await data(draft(o.order.id),{action:'verify',confirm:true});
    }
  }
  assert.equal(posts.length,7,'Three existing fixtures + four new fixed-flow scenarios, no repeated creates');
  assert.equal((await db.prepare('SELECT count(*) n FROM notification_outbox').first()).n,0);
  for(const route of ['/order','/inquiry','/admin/courier-exports','/admin/orders/'+id+'/ship','/admin/orders/'+id+'/receipt'])assert.ok([403,404].includes((await call(route,{})).status));
  await change({action:'pause'});
  const beforeCalculation=await quota(),postsBefore=posts.length,journalsBefore=await db.prepare('SELECT * FROM minimax_drafts ORDER BY order_id').all();
  const calculation=await data('/admin/minimax-availability');assert.equal(calculation.reservationCount,4);assert.equal(calculation.salesReady,false);assert.equal(calculation.quotaWrite,false);
  for(const [sku,reserved] of Object.entries({'10012':3,'10086':7,'10240':6,'10306':5,'10307':5})){
    const row=calculation.rows.find(r=>r.sku===sku);assert.equal(row.reserved,reserved);assert.equal(row.simulationRemaining,23-reserved);
  }
  const linkedId=verified.invoiceId;invoices.get(linkedId).Status='I';
  const blocked=await call('/admin/minimax-availability');assert.equal(blocked.status,409);assert.equal((await blocked.json()).code,'MINIMAX_RESERVATION_RECONCILIATION_REQUIRED');invoices.get(linkedId).Status='O';
  assert.deepEqual(await quota(),beforeCalculation);assert.deepEqual((await db.prepare('SELECT * FROM minimax_drafts ORDER BY order_id').all()).results,journalsBefore.results);assert.equal(posts.length,postsBefore);
  console.log('PASS reservation calculation in real workerd/D1: four admissions, saved package units, existing drafts checked twice, issued blocks, no quota/journal/invoice writes');
  await db.prepare("UPDATE minimax_environment SET name='production'").run();assert.equal((await admit('PAKET')).status,503);
  console.log('PASS all three package recipes, free shipping, uncertain remote create/readback recovery, no email/courier/public checkout; wrong DB marker blocks writes');
}finally{await mf.dispose();fs.rmSync(temp,{recursive:true,force:true});}
