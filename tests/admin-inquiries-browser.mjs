import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {harness} from './helpers/local-delivery-harness.mjs';

// Exercise the real admin UI and authenticated Worker API with isolated SQLite.
// All external requests are intercepted; no production tokens or emails are used.
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=process.cwd();
const server=http.createServer((req,res)=>{
  const file=path.join(root,new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const options={headless:true};
if(process.env.CHROMIUM_EXECUTABLE){options.executablePath=process.env.CHROMIUM_EXECUTABLE;options.args=['--no-sandbox','--disable-dev-shm-usage'];}
const browser=await chromium.launch(options);
try{
 for(const width of [1440,390]){
  const h=harness(),id=await h.add('AT-INQUIRY-TEST',{local:false});
  const apiRequest=()=>new Request('https://test/admin/inquiries',{headers:{Origin:'https://adriatictrade.rs',Authorization:'Bearer synthetic-admin-token-for-tests-only'}});
  assert.equal((await h.ctx.run(apiRequest())).status,200); // Initialize inquiry schema.
  const now=Date.now();
  const seed=(id,status,age,attempts)=>h.sql.prepare('INSERT INTO inquiry_outbox (id,submission_hash,payload_json,status,created_at,attempts) VALUES (?,?,?,?,?,?)').run(id,id,JSON.stringify({text:'PRIVATE_MESSAGE',reply_to:'private@example.com'}),status,now-age,attempts);
  seed('id-attention','attention',23*3600000,8);
  seed('id-pending-old','pending',2*3600000,4);
  seed('id-pending-new','pending',5*60000,1);
  seed('id-sending','sending',60000,2);
  seed('id-sent','sent',30000,1);
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],calls=[];
  page.on('pageerror',e=>errors.push(e.message));
  let responseMode='real',waiting=null,held=null;
  await page.route('https://**/*',async route=>{
    const r=route.request(),url=new URL(r.url());
    assert.equal(url.hostname,'adriatic-trade-orders.lakifinance.workers.dev','Unexpected external request');
    calls.push({path:url.pathname,method:r.method(),authorization:r.headers().authorization});
    if(url.pathname==='/admin/inquiries'){
      assert.equal(r.method(),'GET');
      if(responseMode==='hold'){
        held=route;waiting?.();return;
      }
      if(responseMode==='offline')return route.abort();
      if(responseMode==='error')return route.fulfill({status:503,json:{ok:false,error:'PRIVATE_PROVIDER_ERROR'}});
      if(responseMode==='malformed')return route.fulfill({json:{ok:true}});
      if(responseMode==='invalid-json')return route.fulfill({body:'not json',contentType:'application/json'});
      if(responseMode==='unauthorized')return route.fulfill({status:401,json:{ok:false}});
      if(responseMode==='injected')return route.fulfill({json:{ok:true,inquiries:[{id:'<img src=x onerror="window.injected=true">',status:'<script>PRIVATE_STATUS</script>',created_at:now,attempts:3,email:'PRIVATE_EMAIL',name:'PRIVATE_NAME',message:'PRIVATE_MESSAGE'}]}});
    }
    const response=await h.ctx.run(new Request(r.url(),{headers:{Origin:'https://adriatictrade.rs',Authorization:r.headers().authorization||''}}));
    await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'Access-Control-Allow-Origin':'*'},body:Buffer.from(await response.arrayBuffer())});
  });
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);
    assert.equal(calls.length,0,'No API access before authentication');
    await page.locator('[data-admin-token]').fill('synthetic-admin-token-for-tests-only');
    await page.locator('[data-admin-login-form] button').click();
    await page.locator('[data-inquiry-list] tbody tr').nth(4).waitFor();
    await page.locator('[data-confirm]').waitFor(); // Existing order details still load.
    const section=page.locator('.admin-inquiries');
    assert.equal(await section.locator('tbody tr').count(),5);
    assert.match(await section.textContent(),/2 upita zahteva proveru/);
    assert.match(await section.textContent(),/Prihvaćeno za slanje/);
    assert.match(await section.textContent(),/24 sata/);
    const row=section.locator('tr').filter({hasText:'id-attention'});
    assert.match(await row.textContent(),/Zahteva proveru/);
    assert.equal(await row.locator('td').last().textContent(),'8');
    const expectedTime=new Intl.DateTimeFormat('sr-RS',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Belgrade'}).format(new Date(now-23*3600000));
    assert.equal(await row.locator('td').nth(2).textContent(),expectedTime);
    assert.doesNotMatch(await section.innerHTML(),/PRIVATE_|private@example/);
    const requestCount=calls.length;
    for(const [status,n]of[['attention',1],['pending',2],['sending',1],['sent',1],['',5]]){
      await page.locator('[data-inquiry-filter]').selectOption(status);
      assert.equal(await section.locator('tbody tr').count(),n);
      assert.match(await page.locator('[data-inquiry-warning]').textContent(),/2 upita/);
    }
    assert.equal(calls.length,requestCount,'Filters do not resend or fetch');
    assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth)<=width,'Panel fits viewport');
    if(process.env.QA_ARTIFACT_DIR){fs.mkdirSync(process.env.QA_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.QA_ARTIFACT_DIR,`inquiries-${width}.png`),fullPage:true});}

    for(const mode of ['error','offline','malformed','invalid-json']){
      responseMode=mode;await page.locator('[data-inquiry-refresh]').click();
      await page.locator('[data-inquiry-error]:not(.hidden)').waitFor();
      assert.equal(await section.locator('tbody tr').count(),0,'Failed refresh must not leave stale results');
      assert.doesNotMatch(await section.textContent(),/PRIVATE_/);
      assert.equal(await page.locator('[data-inquiry-refresh]').isEnabled(),true);
      await page.locator('[data-confirm]').waitFor();
      responseMode='real';await page.locator('[data-inquiry-refresh]').click();
      await section.locator('tbody tr').nth(4).waitFor();
    }
    responseMode='injected';await page.locator('[data-inquiry-refresh]').click();
    await section.getByText('Nepoznat status — proverite',{exact:true}).waitFor();
    assert.equal(await section.locator('img,script').count(),0);
    assert.equal(await page.evaluate(()=>window.injected),undefined);
    assert.doesNotMatch(await section.innerHTML(),/PRIVATE_/);

    h.sql.exec('DELETE FROM inquiry_outbox');responseMode='real';
    await page.locator('[data-inquiry-refresh]').click();
    await section.getByText('Nema upita za izabrani filter.',{exact:true}).waitFor();
    for(let n=0;n<101;n++)seed('limit-'+n,'sent',n*1000,1);
    await page.locator('[data-inquiry-refresh]').click();
    await section.locator('tbody tr').nth(99).waitFor();
    assert.equal(await section.locator('tbody tr').count(),100);
    assert.match(await section.textContent(),/dostignut limit API-ja/);
    // Logout while a response is in flight must clear state and ignore the late response.
    responseMode='hold';const arrived=new Promise(resolve=>waiting=resolve);
    await page.locator('[data-inquiry-refresh]').click();await arrived;
    assert.equal(await page.locator('[data-inquiry-refresh]').isDisabled(),true);
    await page.locator('[data-admin-logout]').click();
    await held.fulfill({json:{ok:true,inquiries:[{id:'late-response',status:'attention',created_at:now,attempts:5}]}});
    await page.waitForFunction(()=>document.querySelector('[data-inquiry-list]').getAttribute('aria-busy')==='false');
    assert.equal(await page.locator('[data-inquiry-list]').textContent(),'');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('at_admin_token')),null);
    responseMode='unauthorized';
    await page.locator('[data-admin-token]').fill('bad-key');
    await page.locator('[data-admin-login-form] button').click();
    await page.locator('[data-admin-login-error]:not(.hidden)').waitFor();
    assert.equal(await page.locator('[data-admin-app]').isVisible(),false);
    assert.equal(await page.locator('[data-inquiry-list]').textContent(),'');
    assert.ok(calls.filter(c=>c.path==='/admin/inquiries').every(c=>c.method==='GET'&&c.authorization?.startsWith('Bearer ')));
    assert.ok(calls.every(c=>c.method==='GET'),'Monitoring is read-only');
    assert.equal(h.state.emails.length,0,'No emails from monitoring');
    assert.equal((await h.get(id)).status,'new','Orders unchanged');
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}px: authenticated API, statuses/time/attempts, filters, persistent warning, refresh/recovery, privacy/XSS, empty/100 limit, logout/in-flight/401, existing order details`);
  }finally{await page.close();h.sql.close();}
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
