import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import web from '../worker/web-assets.js';

test('Gift catalogue resolves without redirecting to another host, preserving query and HEAD',async()=>{
 for (const method of ['GET','HEAD']) {
  let called;
  const response=await web.fetch(new Request('https://adriatictrade.rs/korporativni-pokloni?source=linkedin',{method}),{ASSETS:{fetch:async request=>{called=request;return new Response(null,{status:200})}}});
  assert.equal(response.status,200);
  assert.equal(called.url,'https://adriatictrade.rs/korporativni-pokloni.html?source=linkedin');
  assert.equal(called.method,method);
 }
 const config=JSON.parse(fs.readFileSync('wrangler.web.json'));
 assert.ok(config.assets.run_worker_first.includes('/korporativni-pokloni'));
});

test('Legacy catalogue paths redirect once to the branded canonical address',async()=>{
 for (const pathname of ['/korporativni-pokloni/','/korporativni-pokloni.html']) {
  const response=await web.fetch(new Request('https://adriatictrade.rs'+pathname+'?source=linkedin'),{ASSETS:{fetch:()=>assert.fail('Alias must redirect before fetching assets')}});
  assert.equal(response.status,301);
  assert.equal(response.headers.get('location'),'https://adriatictrade.rs/korporativni-pokloni?source=linkedin');
 }
});

test('Existing storefront pages and assets retain their original paths',async()=>{
 for (const pathname of ['/admin.html','/checkout.html','/proizvodi.html','/assets/js/main.js','/assets/korporativni-pokloni/mailto.mjs','/unknown']) {
  let called;
  await web.fetch(new Request('https://adriatictrade.rs'+pathname),{ASSETS:{fetch:async request=>{called=request.url;return new Response(null)}}});
  assert.equal(called,'https://adriatictrade.rs'+pathname);
 }
});

test('Deployed catalogue assets and sharing links belong to Adriatic Trade',()=>{
 const html=fs.readFileSync('.web-dist/korporativni-pokloni.html','utf8');
 assert.ok(html.includes('href="https://adriatictrade.rs/korporativni-pokloni"'));
 assert.ok(html.includes('https://adriatictrade.rs/assets/korporativni-pokloni/assets/linkedin-luxury.jpg'));
 assert.doesNotMatch(html,/chatgpt\.site/);
 for(const [,file] of html.matchAll(/(?:src|href)="(\/assets\/korporativni-pokloni\/[^"?#]+)"/g)) assert.ok(fs.statSync('.web-dist'+file).isFile(),file);
 for (const file of ['app.js','style.css','mailto.mjs','assets/hero-luxury.webp','assets/fonts/serif.woff']) assert.ok(fs.statSync('.web-dist/assets/korporativni-pokloni/'+file).isFile(),file);
 const app=fs.readFileSync('.web-dist/assets/korporativni-pokloni/app.js','utf8');
 assert.ok(app.includes("const url='https://adriatictrade.rs/korporativni-pokloni'"));
 assert.doesNotMatch(app,/chatgpt\.site/);
});
