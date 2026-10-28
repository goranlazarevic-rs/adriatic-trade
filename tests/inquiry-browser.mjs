import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {harness} from './helpers/local-delivery-harness.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const api='https://adriatic-trade-orders.lakifinance.workers.dev';
const stub=`window.turnstile={render(el,options){window.challenge=options;options.callback('synthetic-token');return 1;},reset(){window.challenge.callback('new-synthetic-token');},remove(){}};`;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}: {})});
try{
 for(const [mode,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  for(const [file,type] of [['kontakt.html','contact'],['saradnja.html','b2b']]){
   const h=harness();Object.assign(h.ctx.env,{TURNSTILE_SITE_KEY:'synthetic',TURNSTILE_SECRET_KEY:'synthetic',SECURITY_PEPPER:'synthetic'});h.state.turnstile={success:true,action:'inquiry_'+type,hostname:'adriatictrade.rs'};
   const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
   const requests=[],errors=[],external=[];let behavior='normal',configFailure=false;
   page.on('pageerror',error=>errors.push(error.message));
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===api){
     if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'https://adriatictrade.rs','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
     if(url.pathname==='/inquiry/config'&&configFailure)return route.fulfill({status:503,headers:{'Access-Control-Allow-Origin':'https://adriatictrade.rs'},json:{ok:false}});
     if(url.pathname==='/inquiry'){
      requests.push(req.postDataJSON());
      if(behavior==='timeout')return;
      if(behavior==='malformed')return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'https://adriatictrade.rs','Content-Type':'application/json'},body:'{}'});
      if(behavior==='invalid-json')return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'https://adriatictrade.rs','Content-Type':'application/json'},body:'not JSON'});
      if(behavior==='rate')return route.fulfill({status:429,headers:{'Access-Control-Allow-Origin':'https://adriatictrade.rs','Access-Control-Expose-Headers':'Retry-After','Retry-After':'3600'},json:{ok:false}});
     }
     const response=await h.ctx.run(new Request(req.url(),{method:req.method(),headers:{...req.headers(),origin:'https://adriatictrade.rs','cf-connecting-ip':'192.0.2.50'},...(req.method()==='POST'?{body:req.postData()}:{} )}));
     if(behavior==='lost'&&url.pathname==='/inquiry'){behavior='normal';return route.abort('failed');}
     return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    }
    if(url.hostname==='challenges.cloudflare.com')return route.fulfill({contentType:'application/javascript',body:stub});
    if(url.origin==='https://adriatictrade.rs'){
     const target=path.resolve('.','.'+url.pathname);
     if(!target.startsWith(process.cwd()+path.sep))throw new Error('Unexpected static path');
     if(fs.existsSync(target)&&fs.statSync(target).isFile())return route.fulfill({path:target});
     return route.fulfill({status:404,body:''});
    }
    external.push(req.url());await route.abort();
   });
   await page.goto('https://adriatictrade.rs/'+file);
   const submit=page.locator('form [type="submit"]'),status=page.locator('[data-inquiry-status]');
   await submit.waitFor();await page.waitForFunction(()=>window.challenge,{},{timeout:15000}).catch(async error=>{console.log({errors,external,status:await status.textContent()});throw error;});
   // Native constraint validation prevents an empty form and unchecked consent.
   await submit.click();assert.equal(requests.length,0);
   await page.getByLabel('Ime i prezime *',{exact:true}).fill('Test Osoba');
   await page.getByLabel('Email *',{exact:true}).fill('test@example.com');
   await page.getByLabel('Poruka *',{exact:true}).fill('Samo sintetički lokalni upit.');
   if(type==='b2b')await page.getByLabel('Kompanija *',{exact:true}).fill('Test doo');
   await submit.click();assert.equal(requests.length,0);
   await page.locator('[name="Saglasnost"]').check();
   await page.getByLabel('Ime i prezime *',{exact:true}).fill('   ');await submit.click();assert.equal(requests.length,0);
   await page.getByLabel('Ime i prezime *',{exact:true}).fill('Test Osoba');
   await page.waitForTimeout(850); // Server-signed minimum form age, not a bypass.
   for(const bad of ['malformed','invalid-json','rate',...(mode==='desktop'&&type==='contact'?['timeout']:[])]){
    behavior=bad;await submit.click();await page.waitForFunction(()=>!document.querySelector('form [type="submit"]').disabled);
    assert.equal(new URL(page.url()).pathname,'/'+file);assert.equal(await page.getByLabel('Poruka *',{exact:true}).inputValue(),'Samo sintetički lokalni upit.');
    if(bad==='rate')assert.match(await status.textContent(),/sat vremena/);
    if(bad==='timeout')assert.match(await status.textContent(),/Odgovor nije stigao na vreme/);
   }
   // The server commits, but the browser loses the acknowledgment. Retry stays idempotent.
   behavior='lost';const beforeDouble=requests.length;await page.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});await page.waitForFunction(()=>!document.querySelector('form [type="submit"]').disabled);
   assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM inquiry_outbox').get().n,1);
   assert.equal(requests.length,beforeDouble+1);const lastId=requests.at(-1).submissionId;
   await submit.click();await page.waitForURL('**/'+(type==='b2b'?'saradnja-hvala.html':'kontakt-hvala.html'));
   assert.equal(requests.at(-1).submissionId,lastId);assert.equal(requests.at(-1).fields.Saglasnost,'Da');assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM inquiry_outbox').get().n,1);
   assert.ok(requests.every(r=>!Object.hasOwn(r.fields,'_captcha')));
   await h.ctx.flushInquiryOutbox(h.ctx.env);assert.equal(h.state.emails.length,1);
   // Init outage and challenge expiry preserve data and expose a usable retry.
   configFailure=true;await page.goto('https://adriatictrade.rs/'+file);await page.locator('[data-inquiry-retry]').waitFor({state:'visible'});assert.equal(await submit.isDisabled(),true);
   configFailure=false;await page.locator('[data-inquiry-retry]').click();await page.waitForFunction(()=>!document.querySelector('form [type="submit"]').disabled);
   await page.evaluate(()=>window.challenge['error-callback']());assert.equal(await submit.isDisabled(),true);await page.locator('[data-inquiry-retry]').click();await page.waitForFunction(()=>!document.querySelector('form [type="submit"]').disabled);
   assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth)<=width);
   await page.screenshot({path:'/tmp/inquiry-'+mode+'-'+type+'.png',fullPage:true});
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
   await context.close();console.log('PASS '+mode+' '+type+': native validation, consent, malformed/error responses, 429, lost acknowledgment/retry, init outage, challenge retry, no external sends');
  }
 }
 const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();
 await page.route('**/*',route=>{const url=new URL(route.request().url());return url.pathname==='/kontakt.html'?route.fulfill({path:path.resolve('kontakt.html')}):route.fulfill({body:''});});
 await page.goto('https://adriatictrade.rs/kontakt.html');assert.equal(await page.locator('form [type="submit"]').isDisabled(),true);assert.match(await page.locator('noscript').textContent(),/info@adriatictrade.rs/);await context.close();
 console.log('PASS JavaScript disabled: no unprotected submission; visible email alternative');
}finally{await browser.close();}
