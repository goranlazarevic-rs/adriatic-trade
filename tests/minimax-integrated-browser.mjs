import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {harness} from './helpers/local-delivery-harness.mjs';
import {fixtures} from '../tools/minimax-staging/fixtures.mjs';
import {ITEMS} from '../tools/minimax-draft/model.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const host='https://adriatic-trade-minimax-staging.lakifinance.workers.dev';
const browser=await chromium.launch(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']}:{headless:true});
try {
  for(const width of [1440,390,320]) {
    const h=harness();h.ctx.URLSearchParams=URLSearchParams;
    for(const file of ['cloudflare-d1-checkout-availability-v1.sql','cloudflare-d1-admin-availability-v1.sql'])h.sql.exec(fs.readFileSync(file,'utf8'));
    h.sql.exec("CREATE TABLE minimax_environment(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO minimax_environment VALUES(1,'minimax-staging')");
    for(const sku of ['10086','10012','10306','10307','10240'])h.sql.prepare("INSERT INTO checkout_stock VALUES(?,'available',10,'2099-01-01','Synthetic browser setup')").run(sku);
    Object.assign(h.ctx.env,{MINIMAX_ENV:'staging',MINIMAX_MODE:'draft',MINIMAX_CLIENT_ID:'synthetic',MINIMAX_CLIENT_SECRET:'synthetic',MINIMAX_USERNAME:'adriatic-webshop',MINIMAX_PASSWORD:'synthetic'});
    const invoices=new Map();let posts=0;
    h.ctx.fetch=async(url,options)=>{
      assert.equal(new URL(url).hostname,'moj.minimax.rs');
      if(url.includes('/oauth20/token'))return Response.json({access_token:'synthetic',token_type:'bearer'});
      if(url.includes('/currentuser/orgs'))return Response.json({Rows:[{Organisation:{ID:81179},APIAccess:'D'}]});
      if(url.includes('/items/pricelists'))return Response.json({ValidationMessages:[],Rows:Object.entries(ITEMS).map(([Code,v])=>({Code,Item:{ID:v.id},Customer:{ID:9775669},Warehouse:null,UnitOfMeasurement:'kom',PriceWithVAT:v.gross,PriceWithoutVAT:v.gross/1.2}))});
      if(options.method==='POST'&&url.endsWith('/issuedinvoices')){const id=35000000+posts++;invoices.set(id,{...JSON.parse(options.body),IssuedInvoiceId:id,InvoiceNumber:0});return new Response('',{status:201,headers:{Location:'https://moj.minimax.rs/RS/API/api/orgs/81179/issuedinvoices/'+id}});}
      if(options.method==='GET'&&/\/issuedinvoices\/\d+$/.test(url))return Response.json(invoices.get(Number(url.split('/').pop())));
      throw Error('Unexpected provider request');
    };
    for(const f of fixtures()){
      await h.ctx.insert(f);await h.get(f.id);h.sql.prepare("UPDATE orders SET status='confirmed' WHERE id=?").run(f.id);
      const p=await (await h.call(f.id,'minimax-draft')).json();assert.equal((await h.call(f.id,'minimax-draft',{action:'create',confirm:true,previewHash:p.previewHash})).status,200);
    }
    assert.equal(posts,3);
    // Route through the real staging wrapper as well as the real admin Worker.
    vm.runInContext('globalThis.orders=worker;',h.ctx);
    vm.runInContext(fs.readFileSync('worker/minimax-staging.js','utf8').replace(/^import orders[^\n]+\n/,'').replace('export default','globalThis.stage ='),h.ctx);
    const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];let loseAdmission=true;
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());assert.equal(url.origin,host,'No production/browser third-party traffic');
      if(url.pathname.startsWith('/admin/')) {
        const request=new Request(req.url(),{method:req.method(),headers:{...req.headers(),Origin:host},...(req.postData()?{body:req.postData()}:{})});
        const response=await h.ctx.stage.fetch(request,h.ctx.env,{});
        if(url.pathname==='/admin/probe-orders'&&req.method()==='POST'&&response.ok&&loseAdmission){loseAdmission=false;return route.abort();}
        return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
      }
      const file=url.pathname==='/admin.html'?'admin.html':url.pathname.slice(1);
      if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
      return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png'});
    });
    await page.goto(host+'/admin.html');
    await page.locator('[data-admin-token]').fill('synthetic-admin-token-for-tests-only');await page.locator('[data-admin-login-form] button').click();
    await page.locator('[data-probe-admit=PAKET]').waitFor();await page.locator('[data-intake-action=open]').waitFor();
    await page.locator('[data-probe-admit=PAKET]').click();await page.waitForFunction(()=>document.querySelector('[data-probe-message]').textContent.includes('pauzirana'));
    assert.equal(h.sql.prepare('SELECT count(*) n FROM checkout_admissions').get().n,0);
    await page.locator('[data-intake-action=open]').click();await page.locator('[data-quota-form] [name=reason]').fill('Otvaranje sintetičke probe');await page.locator('[data-quota-form] [type=submit]').click();
    const review=page.locator('[data-quota-review]');assert.match(await review.textContent(),/sintetičke probe/);
    await review.locator('[name=confirmation]').fill('OTVORI PRODAJU');await review.locator('[name=evidence]').check();await review.locator('[name=confirmed]').check();await review.locator('[type=submit]').click();await page.locator('[data-intake-action=pause]').waitFor();
    await page.locator('[data-probe-admit=PAKET]').click();await page.waitForFunction(()=>document.querySelector('[data-probe-message]').textContent.includes('Ponovite samo isti scenario'));
    assert.equal(h.sql.prepare('SELECT count(*) n FROM checkout_admissions').get().n,1);
    await page.locator('[data-probe-admit=PAKET]').click();await page.locator('[data-probe-confirm]').waitFor();
    assert.match(await page.locator('[data-probe-result=PAKET]').textContent(),/kvote nisu ponovo umanjene/);
    const id='AT-MMTEST-FLOW-PAKET';
    await page.locator('[data-probe-confirm]').click();await page.locator('[data-mm-create]').waitFor();
    assert.match(await page.locator('[data-minimax-panel]').textContent(),/3\.270,00 RSD/);
    assert.equal(h.sql.prepare("SELECT remaining FROM checkout_stock WHERE sku='10086'").get().remaining,8);
    await page.locator('[data-mm-create]').click();await page.locator('[data-mm-verify]').waitFor();assert.equal(posts,4);
    const invoice=h.sql.prepare('SELECT external_id FROM minimax_drafts WHERE order_id=?').get(id).external_id;
    await page.reload();await page.locator('[data-probe-admit=PAKET]').waitFor();await page.locator('[data-order-id="'+id+'"]').click();await page.locator('[data-mm-verify]').waitFor();
    await page.locator('[data-mm-verify]').click();await page.locator('[data-mm-verify]:enabled').waitFor();assert.equal(posts,4);
    assert.match(await page.locator('[data-minimax-panel]').textContent(),new RegExp(String(invoice)));
    await page.locator('[data-intake-action=pause]').click();await page.locator('[data-quota-form] [name=reason]').fill('Pauza posle probnog prenosa');await page.locator('[data-quota-form] [type=submit]').click();await page.locator('[data-quota-review] [name=confirmed]').check();await page.locator('[data-quota-review] [type=submit]').click();await page.locator('[data-intake-action=open]').waitFor();
    await page.locator('[data-probe-admit=PAKET]').click();await page.waitForFunction(()=>document.querySelector('[data-probe-result=PAKET]').textContent.includes('kvote nisu ponovo umanjene'));
    assert.equal(h.sql.prepare('SELECT count(*) n FROM checkout_admissions').get().n,1);assert.equal(posts,4);
    const overflow=await page.locator('[data-probe-section]').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false,'No mobile overflow in probe controls');
    await page.locator('[data-admin-logout]').click();assert.equal(await page.locator('[data-probe-content]').textContent(),'');assert.deepEqual(errors,[]);
    await page.close();console.log(`PASS integrated browser ${width}px: paused/open pilot, lost admission/retry, one quota debit, confirmation, draft/readback, reload same ID, pause/replay and logout`);
  }
}finally{await browser.close();}
