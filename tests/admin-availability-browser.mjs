import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {harness} from './helpers/local-delivery-harness.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=process.cwd();
const server=http.createServer((req,res)=>{
 const file=path.join(root,new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const options={headless:true};if(process.env.CHROMIUM_EXECUTABLE){options.executablePath=process.env.CHROMIUM_EXECUTABLE;options.args=['--no-sandbox','--disable-dev-shm-usage'];}
const browser=await chromium.launch(options);
try{
 for(const width of [1440,390,320]){
  const h=harness();for(const file of ['cloudflare-d1-checkout-availability-v1.sql','cloudflare-d1-admin-availability-v1.sql'])h.sql.exec(fs.readFileSync(file,'utf8'));
  for(const sku of ['10086','10012','10306','10307','10240'])h.sql.prepare("INSERT INTO checkout_stock VALUES (?,'available',10,'2099-01-01','Synthetic only')").run(sku);
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],posts=[];let mode='real';
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',async route=>{
   const r=route.request(),url=new URL(r.url());assert.equal(url.hostname,'adriatic-trade-orders.lakifinance.workers.dev');
   if(url.pathname==='/admin/availability'&&r.method()==='POST')posts.push(JSON.parse(r.postData()));
   if(url.pathname==='/admin/availability'&&r.method()==='GET'&&mode==='offline')return route.abort();
   const response=await h.ctx.run(new Request(r.url(),{method:r.method(),headers:{Origin:'https://adriatictrade.rs',Authorization:r.headers().authorization||'','Content-Type':'application/json'},...(r.postData()?{body:r.postData()}:{})}));
   if(url.pathname==='/admin/availability'&&r.method()==='POST'&&mode==='lost'){mode='real';return route.abort();}
   await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'Access-Control-Allow-Origin':'*'},body:Buffer.from(await response.arrayBuffer())});
  });
  try{
   await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);assert.equal(posts.length,0);
   await page.locator('[data-admin-token]').fill('synthetic-admin-token-for-tests-only');await page.locator('[data-admin-login-form] button').click();
   await page.locator('[data-quota-sku="10306"]').waitFor();
   const section=page.locator('.admin-availability'),message=page.locator('[data-availability-message]');
   assert.match(await section.textContent(),/Prodaja je PAUZIRANA/);assert.equal(await section.locator('.availability-product').count(),5);
   assert.ok(await section.evaluate(el=>el.getBoundingClientRect().right<=innerWidth&&el.getBoundingClientRect().left>=0));
   assert.ok(await section.locator('.availability-product button').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)));
   await page.locator('[data-quota-sku="10306"]').click();const form=page.locator('[data-quota-form]');
   await form.locator('[name=quantity]').fill('15');await form.locator('[name=reason]').fill('Synthetic new allocation');await form.locator('[type=submit]').click();
   assert.equal(posts.length,0,'Review must not write');
   let review=page.locator('[data-quota-review]');await review.locator('[type=submit]').click();assert.equal(posts.length,0,'Missing confirmations must not write');
   await review.locator('[name=confirmation]').fill('10306 15');await review.locator('[name=evidence]').check();await review.locator('[name=confirmed]').check();
   mode='lost';await review.locator('[type=submit]').click();await page.locator('[data-quota-retry]').waitFor();
   assert.equal(h.sql.prepare("SELECT remaining FROM checkout_stock WHERE sku='10306'").get().remaining,15);
   assert.equal(await page.locator('[data-availability-refresh]').isDisabled(),true);
   await page.locator('[data-quota-retry]').click();await page.waitForFunction(()=>document.querySelector('[data-availability-message]').textContent.includes('nije ponovljena'));
   assert.deepEqual(posts[0],posts[1]);assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM checkout_control_events').get().n,1);
   await page.locator('[data-intake-action=open]').click();await page.locator('[data-quota-form] [name=reason]').fill('Synthetic readiness');await page.locator('[data-quota-form] [type=submit]').click();
   review=page.locator('[data-quota-review]');await review.locator('[name=confirmation]').fill('OTVORI PRODAJU');await review.locator('[name=evidence]').check();await review.locator('[name=confirmed]').check();await review.locator('[type=submit]').click();
   await page.locator('[data-intake-action=pause]').waitFor();
   await page.locator('[data-quota-sku="10306"]').click();await page.locator('[data-quota-form] [name=quantity]').fill('14');await page.locator('[data-quota-form] [name=reason]').fill('Synthetic stale correction');await page.locator('[data-quota-form] [type=submit]').click();
   h.sql.exec("UPDATE checkout_stock SET remaining=13 WHERE sku='10306'");
   await page.locator('[data-quota-review] [name=confirmed]').check();await page.locator('[data-quota-review] [type=submit]').click();
   await page.waitForFunction(()=>document.querySelector('[data-availability-message]').textContent.includes('Podaci su promenjeni'));
   assert.equal(h.sql.prepare("SELECT remaining FROM checkout_stock WHERE sku='10306'").get().remaining,13);
   await page.locator('[data-intake-action=pause]').click();await page.locator('[data-quota-form] [name=reason]').fill('Synthetic pause');await page.locator('[data-quota-form] [type=submit]').click();await page.locator('[data-quota-review] [name=confirmed]').check();await page.locator('[data-quota-review] [type=submit]').click();await page.locator('[data-intake-action=open]').waitFor();
   h.sql.prepare('UPDATE checkout_control_events SET reason=?').run('<img src=x onerror="window.injected=true">');
   await page.locator('[data-availability-refresh]').click();await page.locator('[data-quota-sku="10306"]').waitFor();
   await section.locator('.availability-history summary').click();assert.equal(await section.locator('.availability-history img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
   mode='offline';await page.locator('[data-availability-refresh]').click();await page.waitForFunction(()=>document.querySelector('[data-availability-message]').textContent.includes('nije učitana'));
   assert.equal(await page.locator('[data-quota-sku]').count(),0,'Failed refresh removes stale controls');
   mode='real';await page.locator('[data-availability-refresh]').click();await page.locator('[data-quota-sku="10306"]').waitFor();
   await page.locator('[data-admin-logout]').click();assert.equal(await page.locator('[data-availability-content]').textContent(),'');assert.equal(await page.evaluate(()=>sessionStorage.getItem('at_admin_token')),null);
   assert.deepEqual(errors,[]);console.log(`PASS browser ${width}px: review, confirmations, retry, open/pause, stale snapshot, history XSS, offline and logout`);
  }finally{await page.close();}
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
