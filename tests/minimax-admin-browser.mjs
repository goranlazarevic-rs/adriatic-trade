import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {harness} from './helpers/local-delivery-harness.mjs';
import {fixtures} from '../tools/minimax-staging/fixtures.mjs';
import {ITEMS} from '../tools/minimax-draft/model.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const host='https://adriatic-trade-minimax-staging.lakifinance.workers.dev';
const browser=await chromium.launch(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']}:{headless:true});
try{
for(const width of [1440,390]){
  const h=harness();h.ctx.URLSearchParams=URLSearchParams;
  for(const f of fixtures()){await h.ctx.insert(f);await h.get(f.id);h.sql.prepare("UPDATE orders SET status='confirmed' WHERE id=?").run(f.id);}
  h.sql.exec("CREATE TABLE minimax_environment(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO minimax_environment VALUES(1,'minimax-staging')");
  Object.assign(h.ctx.env,{MINIMAX_MODE:'draft',MINIMAX_ENV:'staging',MINIMAX_CLIENT_ID:'synthetic',MINIMAX_CLIENT_SECRET:'synthetic',MINIMAX_USERNAME:'adriatic-webshop',MINIMAX_PASSWORD:'synthetic'});
  let payload,posts=0,lost=false;const id=34567890;
  h.ctx.fetch=async(url,options)=>{
    if(url.includes('/AUT/oauth20/token'))return Response.json({access_token:'synthetic',token_type:'bearer'});
    if(url.includes('/currentuser/orgs'))return Response.json({Rows:[{Organisation:{ID:81179},APIAccess:'D'}]});
    if(url.includes('/items/pricelists'))return Response.json({ValidationMessages:[],Rows:Object.entries(ITEMS).map(([Code,v])=>({Code,Item:{ID:v.id},Customer:{ID:9775669},Warehouse:null,UnitOfMeasurement:'kom',PriceWithVAT:v.gross,PriceWithoutVAT:v.gross/1.2}))});
    if(options.method==='POST'&&url.endsWith('/issuedinvoices')){posts++;payload=JSON.parse(options.body);if(lost)throw new Error('synthetic provider failure');return new Response('',{status:201,headers:{Location:`${'https://moj.minimax.rs/RS/API'}/api/orgs/81179/issuedinvoices/${id}?id=${id}`}});}
    if(url.endsWith('/issuedinvoices/'+id))return Response.json({...payload,IssuedInvoiceId:id,InvoiceNumber:0,InvoiceValue:0});
    throw new Error('Unexpected external service');
  };
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());assert.equal(url.origin,host,'All browser traffic stays on isolated origin');
    if(url.pathname.startsWith('/admin/')){
      requests.push(url.pathname);
      const response=await h.ctx.run(new Request(req.url(),{method:req.method(),headers:{...req.headers(),Origin:'https://adriatictrade.rs'},...(req.postData()?{body:req.postData()}:{})}));
      return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
    }
    const file=url.pathname==='/admin.html'?'admin.html':url.pathname.slice(1);
    if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png'});
  });
  await page.goto(host+'/admin.html');assert.equal(requests.length,0);
  await page.locator('[data-admin-token]').fill('synthetic-admin-token-for-tests-only');await page.locator('[data-admin-login-form] button').click();
  await page.locator('[data-mm-create]').waitFor();
  await page.locator('[data-order-id="AT-MMTEST-PAKET"]').click();
  const panel=page.locator('[data-minimax-panel]');await panel.locator('[data-mm-create]').waitFor();
  assert.match(await panel.textContent(),/3\.219,00 RSD/);assert.match(await panel.textContent(),/499,00 RSD/);assert.equal(posts,0);
  assert.equal(await page.locator('[data-ship-form]').count(),0,'Pilot has no shipping controls');
  await panel.locator('[data-mm-create]').click();await panel.getByText('Nacrt je pročitan i proveren',{exact:false}).waitFor();assert.equal(posts,1);
  await panel.locator('[data-mm-verify]').click();await panel.locator('[data-mm-verify]:enabled').waitFor();assert.equal(posts,1);
  await page.reload();await page.locator('[data-mm-create]').waitFor();await page.locator('[data-order-id="AT-MMTEST-PAKET"]').click();await panel.getByText('Nacrt je pročitan i proveren',{exact:false}).waitFor();assert.equal(posts,1);
  assert.equal(await panel.locator('[data-mm-create]').count(),0);
  assert.ok((await panel.locator('a').getAttribute('href')).includes('iracid='+id));
  lost=true;await page.locator('[data-order-id="AT-MMTEST-STANDARD"]').click();await panel.locator('[data-mm-create]').waitFor();await panel.locator('[data-mm-create]').click();
  await panel.locator('[data-mm-id]').waitFor();assert.equal(posts,2);assert.equal(await panel.locator('[data-mm-create]').count(),0);
  await panel.locator('[data-mm-id]').fill(String(id));lost=false;await panel.locator('[data-mm-verify]').click();await panel.getByText('Nacrt je pročitan i proveren',{exact:false}).waitFor();assert.equal(posts,2);
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS browser ${width}px: exact package/promo preview, explicit draft create, reload/read-only verify, uncertain outcome reconciliation, no production traffic or shipping action`);
}
}finally{await browser.close();}
