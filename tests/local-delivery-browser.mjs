import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {harness,today} from './helpers/local-delivery-harness.mjs';

// Optional integration test: Playwright must be installed. All Worker requests run
// against isolated SQLite/R2 and captured emails; every other external URL is blocked.
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const artifactDir=process.env.QA_ARTIFACT_DIR;
if(artifactDir)fs.mkdirSync(artifactDir,{recursive:true});
const root=process.cwd();
const server=http.createServer((req,res)=>{
  const file=path.join(root,new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const options={headless:true};
if(process.env.CHROMIUM_EXECUTABLE){options.executablePath=process.env.CHROMIUM_EXECUTABLE;options.args=['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--in-process-gpu'];}
const results=[];
try{
 for(const [mode,width,height]of[['ips-offline-desktop',1440,1000],['bank-transfer-mobile',390,844]]){
  const h=harness(),id=await h.add('AT-20261010-654321',{local:false});h.state.qr='error';
  const browser=await chromium.launch(options);
  try{
   const page=await browser.newPage({viewport:{width,height}}),errors=[],calls=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
   await page.route('https://**/*',async route=>{
    const r=route.request(),url=new URL(r.url());
    if(url.href==='https://adriatictrade.rs/assets/img/adriatic-trade-logo-header.png')return route.fulfill({contentType:'image/png',body:fs.readFileSync('assets/img/adriatic-trade-logo-header.png')});
    if(url.hostname!=='adriatic-trade-orders.lakifinance.workers.dev')return route.abort();
    calls.push({path:url.pathname,method:r.method()});
    const headers={...r.headers(),Origin:'https://adriatictrade.rs'};delete headers.origin;
    const response=await h.ctx.run(new Request(r.url(),{method:r.method(),headers,...(['GET','HEAD'].includes(r.method())?{}:{body:r.postDataBuffer()})}));
    await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'Access-Control-Allow-Origin':'*'},body:Buffer.from(await response.arrayBuffer())});
   });
   await page.addInitScript(()=>sessionStorage.setItem('at_admin_token','synthetic-admin-token-for-tests-only'));
   await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);
   await page.locator('[data-local-delivery]').click();
   await page.locator('[data-local-payment="bank_transfer"]').waitFor();
   assert.equal((await h.get(id)).shipping,0);assert.equal((await h.get(id)).total,598);
   assert.equal(await page.locator('[data-local-payment="cash"]').count(),0);
   if(mode.startsWith('bank')){
    await page.locator('[data-local-payment="bank_transfer"]').click();
    await page.locator('[data-local-payment="bank_transfer"][disabled]').waitFor();
   }
   await page.locator('[data-confirm]').click();await page.locator('[data-local-schedule-form]').waitFor();
   assert.equal((await h.get(id)).status,'confirmed');assert.equal((await h.get(id)).operations.paymentStatus,'unpaid');
   const confirmation=h.state.emails[0];assert.equal(confirmation.attachments.length,2);assert.match(confirmation.html,/265201031001135831/);assert.match(confirmation.html,/Poziv na broj/);assert.doesNotMatch(confirmation.html,/U prilogu je PNG/);
   const scheduled=page.locator('[data-local-schedule-form]');
   await scheduled.locator('[name="date"]').fill('2099-01-01');await scheduled.locator('[name="timeWindow"]').fill('17:00–19:00');await scheduled.locator('[name="location"]').fill('Test lokacija — Novi Sad');await scheduled.locator('button[type="submit"]').click();
   const delivered=page.locator('[data-local-delivered-form]');await delivered.waitFor();
   const before=calls.filter(c=>c.path.endsWith('/local-delivered')).length;
   await delivered.locator('button[type="submit"]').click();assert.equal(calls.filter(c=>c.path.endsWith('/local-delivered')).length,before);assert.equal((await h.get(id)).operations.paymentStatus,'unpaid');
   await delivered.locator('[name="remittanceDate"]').fill(today);await delivered.locator('[name="paymentReference"]').fill('TEST IZVOD 42 / stavka 3');await delivered.locator('[name="paymentConfirmed"]').check();
   // Existing legal PDF is only a valid PDF format fixture, not a real fiscal receipt.
   const receiptFixture=fs.readFileSync('dokumenti/adriatic-trade-obavestenje-prodaja-na-daljinu.pdf');
   await delivered.locator('[name="receipt"]').setInputFiles({name:'test-prilog.pdf',mimeType:'application/pdf',buffer:receiptFixture});
   if(artifactDir)await page.locator('[data-admin-detail]').screenshot({path:path.join(artifactDir,mode+'-before-delivery.png')});
   await delivered.locator('button[type="submit"]').click();await page.getByRole('heading',{name:'Porudžbina je lično isporučena'}).waitFor();
   const final=await h.get(id);assert.equal(final.operations.paymentStatus,'paid');assert.equal(final.operations.paymentMethod,'bank_transfer');assert.equal(final.operations.paymentReference,'TEST IZVOD 42 / stavka 3');assert.equal(final.operations.fulfillment,'delivered');assert.equal(final.total,598);assert.equal(final.receiptFilename,'test-prilog.pdf');assert.ok(h.receiptFiles.has(final.receiptKey));
   const email=h.state.emails.at(-1);assert.match(email.html,/Fiskalni račun je u prilogu/);assert.equal(email.attachments.length,1);assert.equal(Buffer.from(email.attachments[0].content,'base64').length,receiptFixture.length);
   const download=page.waitForEvent('download');await page.locator('[data-receipt]').click();const file=await download;assert.equal(file.suggestedFilename(),'test-prilog.pdf');
   assert.deepEqual(errors,[]);assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth)<=width);
   if(artifactDir){await page.locator('[data-admin-detail]').screenshot({path:path.join(artifactDir,mode+'-delivered.png')});for(let n=0;n<h.state.emails.length;n++)fs.writeFileSync(path.join(artifactDir,mode+'-email-'+n+'.html'),h.state.emails[n].html);}
   for(let n=0;n<h.state.emails.length;n++){
    await page.setContent(h.state.emails[n].html,{waitUntil:'networkidle'});
    assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth)<=width,mode+': email '+n+' overflows viewport');
    assert.equal(await page.locator('img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0)),true);
    if(artifactDir)await page.screenshot({path:path.join(artifactDir,mode+'-email-'+n+'.png'),fullPage:true});
   }
   assert.deepEqual(errors,[]);
   results.push(mode);console.log('PASS '+mode+': approval → confirmation → schedule → verified payment → delivery → PDF download');
  }finally{await browser.close();}
 }
}finally{await new Promise(resolve=>server.close(resolve));}
assert.equal(results.length,2);
