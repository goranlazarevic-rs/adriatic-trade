import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {stockHarness} from './helpers/minimax-stock-harness.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const host='https://adriatic-trade-minimax-staging.lakifinance.workers.dev';
const browser=await chromium.launch(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']}:{headless:true});
try {
  for(const width of [1440,390,320]){
    const h=stockHarness(),page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
    let hold=false,release,entered;
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());assert.equal(url.origin,host);
      if(url.pathname.startsWith('/admin/')){
        const headers=new Headers(req.headers());headers.set('Origin',host);
        const res=await h.ctx.stage.fetch(new Request(req.url(),{method:req.method(),headers,...(req.postData()?{body:req.postData()}:{})}),h.ctx.env,{});
        if(hold&&url.pathname==='/admin/minimax-stock'){entered();await new Promise(resolve=>release=resolve);}
        return route.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:Buffer.from(await res.arrayBuffer())});
      }
      const file=url.pathname.slice(1);
      return fs.existsSync(file)?route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png'}):route.fulfill({status:404,body:''});
    });
    await page.goto(host+'/admin.html');assert.equal(h.mm.requests.length,0);
    assert.equal(await page.locator('[data-minimax-stock-section]').isVisible(),false);
    await page.locator('[data-admin-token]').fill('synthetic-admin-token-for-tests-only');await page.locator('[data-admin-login-form] button').click();
    const section=page.locator('[data-minimax-stock-section]'),button=section.locator('[data-minimax-stock-read]'),message=section.locator('[data-minimax-stock-message]');
    await section.waitFor();assert.equal(h.mm.requests.length,0,'No automatic stock calls at login');
    const before=JSON.stringify(h.sql.prepare('SELECT * FROM checkout_stock').all());
    await button.click();await page.waitForFunction(()=>document.querySelector('[data-minimax-stock-message]').textContent.startsWith('Očitano:'));
    assert.equal(await section.locator('article').count(),5);assert.equal(h.mm.reads,5);assert.ok(!(await section.textContent()).includes('987654321'));
    h.mm.mode='zero';await button.click();await page.waitForFunction(()=>document.querySelector('[data-minimax-stock-message]').textContent.startsWith('Očitano:'));assert.match(await section.textContent(),/0 kom\./);
    h.mm.mode='absent';await button.click();await page.waitForFunction(()=>document.querySelector('[data-minimax-stock-message]').textContent.startsWith('Očitano:'));assert.match(await section.textContent(),/Nije prijavljeno/);
    h.mm.mode='network';await button.click();await page.waitForFunction(()=>document.querySelector('[data-minimax-stock-message]').textContent.startsWith('Zalihe nisu učitane'));assert.equal(await section.locator('article').count(),0,'Failed refresh clears old snapshot');
    h.mm.mode='negative';await button.click();await page.waitForFunction(()=>document.querySelector('[data-minimax-stock-message]').textContent.startsWith('Očitano:'));assert.match(await section.textContent(),/Negativno stanje/);
    assert.equal(JSON.stringify(h.sql.prepare('SELECT * FROM checkout_stock').all()),before);assert.equal(h.sql.prepare('SELECT mode FROM checkout_intake').get().mode,'paused');
    assert.equal(await section.evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'No stock panel overflow');
    if(process.env.QA_SCREENSHOT_DIR){fs.mkdirSync(process.env.QA_SCREENSHOT_DIR,{recursive:true});await section.screenshot({path:process.env.QA_SCREENSHOT_DIR+'/minimax-stock-'+width+'.png'});}
    hold=true;const waiting=new Promise(resolve=>entered=resolve);await button.click();await waiting;
    await page.locator('[data-admin-logout]').click();const lateResponse=page.waitForResponse(res=>res.url().endsWith('/admin/minimax-stock'));release();await lateResponse;
    assert.equal(await section.isVisible(),false);assert.equal(await section.locator('[data-minimax-stock-content]').textContent(),'','Late response must not reveal signed-out data');
    assert.deepEqual(errors,[]);await page.close();console.log(`PASS stock browser ${width}px: explicit read, zero/unknown/negative, failed refresh, unchanged quota/pause, late logout response and layout`);
  }
}finally{await browser.close();}
