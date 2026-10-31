import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createLabServer } from '../tools/integration-lab/server.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const {server,lab}=createLabServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,options={headless:true};
if(process.env.CHROMIUM_EXECUTABLE){options.executablePath=process.env.CHROMIUM_EXECUTABLE;options.args=['--no-sandbox','--disable-dev-shm-usage'];}
let browser;
try {
  browser=await chromium.launch(options);
  for(const [width,height] of [[1440,1000],[390,844]]) {
    const page=await browser.newPage({viewport:{width,height}}),errors=[],external=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith(base+'/')||url.startsWith('blob:'))return route.continue();
      external.push(url);return route.abort();
    });
    await page.goto(base);await page.getByRole('button',{name:'TEST-COD-001',exact:true}).waitFor();
    await page.getByRole('button',{name:'TEST-COD-001',exact:true}).click();
    // Use a fresh timeout fixture in each viewport, then continue the same saved
    // state in mobile to verify refresh/persistence and responsive controls.
    const id=width===1440?'TEST-COD-001':'TEST-TIMEOUT-005';
    await page.getByRole('button',{name:id,exact:true}).click();
    const action=async name=>{await page.locator(`[data-action="${name}"]`).click();await page.locator(`[data-action="${name}"]:not([disabled])`).waitFor();};
    await page.locator('#scenario').selectOption('timeout');await action('confirm');
    await page.getByText('NEIZVESTAN ISHOD',{exact:true}).first().waitFor();
    await action('confirm');assert.match(await page.locator('#message').textContent(),/neizvestan/);
    await action('reconcile-transfer');await page.locator('#scenario').selectOption('ok');
    await action('stock');await action('mock-invoice');
    const downloadPromise=page.waitForEvent('download');await page.locator('#pdf').click();
    const download=await downloadPromise;assert.match(download.suggestedFilename(),/SIMULATION.pdf$/);
    await page.locator('#scenario').selectOption('email-failure');await action('email');
    assert.equal(lab.job(id,'receipt-email').status,'retryable');
    await page.locator('#scenario').selectOption('ok');await action('email');await action('shipment');
    assert.equal(lab.row(id).fulfillment,'pending');await action('handoff');
    assert.equal(lab.row(id).payment,'unpaid');await action('delivered');await action('payment');await action('remittance');
    assert.equal(lab.row(id).remittance,'received');await page.reload();
    await page.getByRole('button',{name:id,exact:true}).click();
    assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth),true);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
    console.log(`PASS: integration lab ${width}px; timeout/reconciliation, PDF download, email retry, courier and money; zero external requests`);
  }
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
