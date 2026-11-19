const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const phase = process.argv[2] || 'after';
const output = path.join(process.env.QA_OUTPUT_ROOT, phase);
const pages = ['index.html','proizvodi.html','proizvodi/nerafinisana-sitna-600g.html','proizvodi/nerafinisana-krupna-600g.html','proizvodi/nerafinisana-sitna-500g.html','proizvodi/cvet-soli-100g.html','proizvodi/cvet-soli-125g.html'];
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true});
 const results=[];
 const before=phase==='after'?JSON.parse(fs.readFileSync(path.join(process.env.QA_OUTPUT_ROOT,'before','results.json'),'utf8')):[];
 try {
  for (const width of [320,390,768,1440]) {
   const context=await browser.newContext({viewport:{width,height:width===1440?1000:844}});
   await context.addInitScript(()=>localStorage.setItem('at_analytics_consent','denied'));
   await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
   const page=await context.newPage();
   let errors=[]; page.on('pageerror',e=>errors.push(e.message));
   for(const file of pages){
    errors=[];
    await page.goto('http://127.0.0.1:8765/'+file,{waitUntil:'networkidle'});
    await page.evaluate(async()=>{const images=[...document.querySelectorAll('main img')];for(const image of images)image.loading='eager';await Promise.all(images.map(image=>image.decode().catch(()=>{})));});
    await page.evaluate(()=>scrollTo(0,0));
    const data=await page.evaluate(()=>{
     const box=selector=>{const el=document.querySelector(selector);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,text:el.innerText}};
     return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,h1:box('h1'),hero:box('.premium-hero-v315'),lead:box('main p.lead'),images:[...document.querySelectorAll('main img')].filter(x=>!x.complete||!x.naturalWidth).map(x=>x.src),buttons:document.querySelectorAll('[data-add-cart]').length};
    });
    results.push({file,...data,errors:[...errors]});
    if([390,1440].includes(width))await page.screenshot({path:path.join(output,width+'-'+file.replaceAll('/','-')+'.png'),fullPage:true});
    if(phase==='after'){
     assert.equal(errors.length,0,file+' browser errors');
     assert.equal(data.images.length,0,file+' broken images');
     const baseline=before.find(x=>x.file===file&&x.width===width);
     assert.ok(data.scrollWidth<=Math.max(width,baseline.scrollWidth)+1,file+' new overflow at '+width+': '+data.scrollWidth);
     assert.equal(await page.locator('h1').count(),1);
     const button=page.locator('[data-add-cart]').first();
     const sku=await button.getAttribute('data-add-cart');
     await page.evaluate(()=>localStorage.removeItem('at_cart'));
     await page.reload({waitUntil:'networkidle'});
     await page.locator('[data-add-cart="'+sku+'"]').first().click();
     assert.equal(await page.evaluate(sku=>JSON.parse(localStorage.getItem('at_cart'))[sku],sku),1);
     assert.equal(await page.locator('[data-inline-cart="'+sku+'"] [data-inline-qty]').first().innerText(),'1');
     await page.evaluate(()=>localStorage.removeItem('at_cart'));
    }
   }
   if(phase==='after'){
    await page.goto('http://127.0.0.1:8765/proizvodi.html');
    if(width<768){await page.locator('.nav-toggle').click();await page.locator('.nav-links a[href="/solana-nin.html"]').click();assert.ok(page.url().endsWith('/solana-nin.html'));}
    await page.evaluate(()=>localStorage.setItem('at_cart',JSON.stringify({'10306':1,'10086':1})));
    await page.goto('http://127.0.0.1:8765/korpa.html');
    assert.equal(await page.locator('.cart-item').count(),2);
    assert.ok((await page.locator('[data-cart-summary]').innerText()).includes('1.319'));
   }
   await context.close();
  }
 } finally { await browser.close(); fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2)); }
 console.log(JSON.stringify({phase,pages:results.length,overflow:results.filter(x=>x.scrollWidth>x.width+1).map(x=>({file:x.file,width:x.width,scrollWidth:x.scrollWidth})),hero:results.filter(x=>x.file==='index.html').map(x=>({width:x.width,h1:x.h1,hero:x.hero}))},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
