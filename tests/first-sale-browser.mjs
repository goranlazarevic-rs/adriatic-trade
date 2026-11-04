import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {harness} from './helpers/local-delivery-harness.mjs';
import {reviewFields} from './helpers/fiscal-review-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=process.cwd(),host='adriatic-trade-orders.lakifinance.workers.dev';
const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--in-process-gpu']}:{})});
try{for(const width of [1440,390,320]){
  const h=harness();h.ctx.env.FIRST_SALE_MODE='manual-minimax';const id=await h.add('AT-20261103-BROWSER',{local:false});
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('https://**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.hostname!==host){if(u.pathname.endsWith('adriatic-trade-logo-header.png'))return route.fulfill({contentType:'image/png',body:fs.readFileSync('assets/img/adriatic-trade-logo-header.png')});return route.abort();}
    const requestHeaders={...r.headers()};delete requestHeaders.origin;requestHeaders.Origin='https://adriatictrade.rs';
    const response=await h.ctx.run(new Request(r.url(),{method:r.method(),headers:requestHeaders,...(['GET','HEAD'].includes(r.method())?{}:{body:r.postDataBuffer()})}));
    return route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'Access-Control-Allow-Origin':'*'},body:Buffer.from(await response.arrayBuffer())});});
  await page.addInitScript(()=>sessionStorage.setItem('at_admin_token','synthetic-admin-token-for-tests-only'));await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);
  await page.locator('[data-confirm]').click();const fiscal=page.locator('[data-fiscal-form]');await fiscal.waitFor();const shipping=page.locator('[data-ship-form]');assert.equal(await shipping.locator('button[type="submit"]').isDisabled(),true);
  assert.equal(await page.locator('[data-fiscal-invoice-rows] tbody tr').count(),2);assert.match(await page.locator('[data-fiscal-invoice-rows]').textContent(),/299,00 RSD/);
  await fiscal.locator('[name="pfrNumber"]').fill('7AF4D923-E3B30A31-903');await fiscal.locator('[name="issuedAt"]').fill(new Date(Date.now()-120000).toISOString().slice(0,16));
  await fiscal.locator('[name="reason"]').fill('Synthetic original fiscal document checked');await fiscal.locator('[name="confirmed"]').check();await fiscal.locator('[name="receipt"]').setInputFiles({name:'synthetic-fiscal.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nSYNTHETIC FORMAT FIXTURE')});
  await fiscal.locator('[name="originalUnchanged"]').check();
  const toggle=fiscal.locator('[data-fiscal-review-toggle]');assert.equal(await toggle.isChecked(),false);assert.equal(await fiscal.locator('[name="verificationUrl"]').isDisabled(),true);
  await fiscal.locator('[name="deliveryMode"]').selectOption('minimax');assert.equal(await fiscal.locator('[name="receipt"]').getAttribute('required'),'');await fiscal.locator('[name="deliveryMode"]').selectOption('panel');
  await toggle.check();await fiscal.locator('button[type="submit"]').click();assert.equal(h.sql.prepare('SELECT count(*) n FROM fiscal_documents').get().n,0,'An explicitly selected incomplete review must not be saved as verified');
  if(width===1440){
    const review=reviewFields();await fiscal.locator('[name="verificationUrl"]').fill(review.verificationUrl);await fiscal.locator('[name="verifiedTaxId"]').fill(review.verifiedTaxId);await fiscal.locator('[name="documentType"]').selectOption(review.documentType);for(const name of ['portalChecked','itemsChecked','paymentChecked'])await fiscal.locator('[name="'+name+'"]').check();
  }else{
    await fiscal.locator('[name="verificationUrl"]').fill('https://invalid.example/partial-review');await toggle.uncheck();assert.equal(await fiscal.locator('[name="verificationUrl"]').isDisabled(),true);
  }
  assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1),'Portal review form must fit the viewport');
  if(process.env.QA_SCREENSHOT_DIR){fs.mkdirSync(process.env.QA_SCREENSHOT_DIR,{recursive:true});await fiscal.screenshot({path:process.env.QA_SCREENSHOT_DIR+'/fiscal-review-form-'+width+'.png'});}
  h.state.email='error';await fiscal.locator('button[type="submit"]').click();await page.locator('[data-fiscal-panel]').getByText('Email čeka slanje',{exact:true}).waitFor();assert.equal(await shipping.locator('button[type="submit"]').isDisabled(),true);
  h.state.email='ok';await page.locator('[data-email-retry]').click();await page.locator('[data-fiscal-panel]').getByText('Email servis je prihvatio PDF',{exact:true}).waitFor();assert.equal(await shipping.locator('button[type="submit"]').isEnabled(),true);
  assert.equal(Boolean((await h.get(id)).fiscalControl.sale.portalReview),width===1440);
  if(width===390){
    const late=page.locator('[data-review-only]');await late.locator('..').locator('summary').click();await late.locator('[data-fiscal-review-toggle]').check();const review=reviewFields();
    await late.locator('[name="receipt"]').setInputFiles({name:'synthetic-fiscal.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nSYNTHETIC FORMAT FIXTURE')});
    for(const key of ['verificationUrl','verifiedTaxId'])await late.locator('[name="'+key+'"]').fill(review[key]);await late.locator('[name="documentType"]').selectOption(review.documentType);
    for(const key of ['portalChecked','itemsChecked','paymentChecked','originalUnchanged','confirmed'])await late.locator('[name="'+key+'"]').check();
    await late.locator('[name="reason"]').fill('Synthetic optional review after recording');await late.locator('button[type="submit"]').click();await page.getByText('Ručno evidentirana',{exact:true}).waitFor();
    assert.equal((await h.get(id)).fiscalControl.sale.portalReview.mode,'manual');
  }
  assert.equal((await h.get(id)).status,'confirmed');assert.equal(h.state.emails.filter(e=>e.subject.startsWith('Fiskalni')).length,2,'One failed attempt and one same-key retry');
  if(process.env.QA_SCREENSHOT_DIR){fs.mkdirSync(process.env.QA_SCREENSHOT_DIR,{recursive:true});await page.locator('[data-admin-detail]').screenshot({path:process.env.QA_SCREENSHOT_DIR+'/first-sale-'+width+'.png'});}
  await shipping.locator('[name="courier"]').fill('Synthetic courier');await shipping.locator('[name="trackingNumber"]').fill('SYNTHETIC-903');await shipping.locator('button[type="submit"]').click();await page.getByRole('heading',{name:'Pošiljka je poslata'}).waitFor();
  assert.equal((await h.get(id)).status,'shipped');assert.equal(h.state.emails.at(-1).attachments,undefined);assert.deepEqual(errors,[]);assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1));
  await page.close();console.log(`PASS first-sale browser ${width}px: confirm -> original fiscal PDF -> blocked pending email -> retry -> manual courier handoff; no overflow or page errors`);
}}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
