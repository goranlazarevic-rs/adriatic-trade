import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {CONFIG, ITEMS, sampleOrder, buildDraft, validatePriceList, verifyDraft, belgradeDay} from '../tools/minimax-draft/model.mjs';
import {MinimaxDraftClient, invoiceIdFromLocation, ProbeError} from '../tools/minimax-draft/client.mjs';
import {openJournal} from '../tools/minimax-draft/journal.mjs';
import {runProbe} from '../tools/minimax-draft/probe.mjs';
import {safeError} from '../tools/minimax-draft/cli.mjs';

const DAY = '2026-11-02', ID = 99999991;
const clone = value => structuredClone(value);
const payload = () => buildDraft(sampleOrder(), DAY);
function invoice(p = payload(), id = ID) {
  return {...clone(p), IssuedInvoiceId: id, InvoiceNumber: 0, InvoiceValue: 0,
    IssuedInvoiceRows: p.IssuedInvoiceRows.map(r => ({...clone(r), AdditionalWarehouse: null}))};
}
function prices(p = payload()) {
  return {Rows: p.IssuedInvoiceRows.flatMap(r => [
    {Code: r.ItemCode, Item: {ID: r.Item.ID}, Customer: null, Warehouse: null, UnitOfMeasurement: 'kom', PriceWithVAT: 1, PriceWithoutVAT: 1 / 1.2},
    {Code: r.ItemCode, Item: {ID: r.Item.ID}, Customer: {ID: CONFIG.customerId}, Warehouse: null,
      UnitOfMeasurement: 'kom', PriceWithVAT: r.PriceWithVAT, PriceWithoutVAT: r.Price},
  ]), ValidationMessages: []};
}
const credentials = () => ({clientId: 'synthetic-code', clientSecret: 'SYNTHETIC-CLIENT-SECRET', username: 'adriatic-webshop', password: 'SYNTHETIC-USER-SECRET'});
function provider({onCreate, onRead, tokenStatus = 200, tokenBody, onFetch, pricesBody, orgBody} = {}) {
  const calls = [], made = [];
  const fetchImpl = async (url, options) => {
    calls.push({url, options});
    onFetch?.(url, options);
    assert.equal(new URL(url).hostname, 'moj.minimax.rs');
    assert.equal(options.redirect, 'error');
    if (url.endsWith('/token')) return Response.json(tokenBody ?? {access_token: 'SYNTHETIC-TOKEN', token_type: 'bearer', expires_in: 3600}, {status: tokenStatus});
    assert.equal(options.headers.Authorization, 'Bearer SYNTHETIC-TOKEN');
    if (options.method === 'POST') {
      assert.equal(url, 'https://moj.minimax.rs/RS/API/api/orgs/81179/issuedinvoices');
      const p = JSON.parse(options.body); made.push(p);
      if (onCreate) return onCreate(p);
      return new Response(null, {status: 201, headers: {Location: `https://moj.minimax.rs/RS/API/api/orgs/81179/issuedinvoices/${ID}?id=${ID}`}});
    }
    if (url.includes('currentuser/orgs')) return Response.json(orgBody ?? {Rows: [{Organisation: {ID: 81179}, APIAccess: 'D'}]});
    if (url.includes('/items/pricelists')) return Response.json(pricesBody ?? prices());
    if (url.includes('/issuedinvoices/')) {
      const id = Number(url.split('/').at(-1));
      if (onRead) { const answer = await onRead(id, made); if (answer) return answer; }
      return Response.json(invoice(made[0] ?? payload(), id));
    }
    throw Error('Unexpected test route');
  };
  return {client: new MinimaxDraftClient({credentials: credentials(), fetchImpl}), calls, made};
}
async function inJournal(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimax-probe-'));
  try { await fn(dir); } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

test('sample matches six verified IDs, gross total, tax, warehouse and no copied read-only fields', () => {
  const p = payload();
  assert.equal(p.Status, 'O'); assert.equal(p.PricesOnInvoice, 'D');
  assert.deepEqual(p.IssuedInvoiceRows.map(r => r.Item.ID), [13473518,13473554,13473557,13473558,13473560,13473586]);
  assert.deepEqual(p.IssuedInvoiceRows.map(r => r.PriceWithVAT), [600,800,299,299,550,420]);
  assert.equal(p.IssuedInvoiceRows.reduce((sum, r) => sum + r.Value, 0), 2968);
  for (const row of p.IssuedInvoiceRows) { assert.equal(row.VatAccountingType, '3.2'); assert.equal(row.VatRate.ID, 4); }
  assert.equal(p.IssuedInvoiceRows.at(-1).Warehouse, null);
  assert.equal(p.IssuedInvoiceRows[0].Warehouse.ID, 40999);
  assert.equal(p.IssuedInvoicePaymentMethods[0].Amount, 2968);
  for (const key of ['IssuedInvoiceId','InvoiceNumber','RowVersion','InvoiceValue','AssociationWithStock','InvoiceAttachment']) assert.ok(!Object.hasOwn(p,key));
  assert.ok(!JSON.stringify(p).includes('24955965'));
  assert.equal(verifyDraft(invoice(), p).total, 2968);
});

test('actual Worker snapshot shape can be mapped only after explicit test payment selection', () => {
  const source = fs.readFileSync('worker/adriatic-trade-worker-v4.5.0.js','utf8').replace('export default', 'const worker =');
  const context = vm.createContext({console, crypto: globalThis.crypto, URL, Intl, TextEncoder});
  vm.runInContext(source + '\nglobalThis.make = buildOrder;', context);
  const order = clone(context.make({submissionId: 'synthetic-001', customer: {}, delivery: {},
    items: ['10086','10012','10306','10307','10240'].map(sku => ({sku, qty: 1}))}));
  assert.throws(() => buildDraft(order, DAY), /UNCONFIRMED_PAYMENT_MAPPING/);
  order.payment = 'TEST_BANK_TRANSFER';
  const mapped = buildDraft(order, DAY);
  assert.equal(mapped.IssuedInvoicePaymentMethods[0].Amount, 2968);
});

for (const sku of ['TEST01','UNKNOWN','__proto__','PKT-PROBA','PKT-GURMAN','PKT-KOMPLET','DOSTAVA']) {
  test(`unsupported SKU blocked: ${sku}`, () => {
    const o = sampleOrder(); o.items[0].sku = sku;
    assert.throws(() => buildDraft(o, DAY), /UNSUPPORTED_SKU_OR_BUNDLE/);
  });
}
test('invalid quantities, duplicate lines, decimals, altered totals or prices fail before transport', () => {
  for (const qty of [0,-1,1.5,21,NaN,Infinity,'1']) {
    const o=sampleOrder(); o.items[0].qty=qty; assert.throws(() => buildDraft(o,DAY));
  }
  for (const change of [o=>o.items.push(o.items[0]), o=>o.items[0].unitPrice=271.8405,
    o=>o.items[0].lineTotal=599, o=>o.goodsTotal=2547, o=>o.total=2968.01,
    o=>o.shipping=419, o=>o.payment='Pouzećem']) {
    const o=sampleOrder();change(o);assert.throws(() => buildDraft(o,DAY));
  }
});
test('free shipping omits delivery and current day uses Serbia timezone including DST', () => {
  const o=sampleOrder();o.shipping=0;o.total=o.goodsTotal;
  assert.equal(buildDraft(o,DAY).IssuedInvoiceRows.length,5);
  assert.equal(belgradeDay(new Date('2026-11-01T23:30:00Z')), '2026-11-02');
  assert.equal(belgradeDay(new Date('2026-07-01T22:30:00Z')), '2026-07-02');
  assert.throws(() => buildDraft(sampleOrder(),'2026-02-30'));
});
test('gross calculation retains 2548.00 + 420, not the old net rounding total 2968.01', () => {
  const p=payload();
  assert.equal(p.IssuedInvoiceRows[1].Price,666.666667);
  assert.equal(p.IssuedInvoiceRows[2].Price,249.166667);
  assert.equal(p.IssuedInvoiceRows.reduce((s,r)=>s+Math.round(r.PriceWithVAT*100)*r.Quantity,0),296800);
});
test('customer-specific price matching ignores base/other customer but rejects missing/duplicate/mismatched prices', () => {
  validatePriceList(prices(),payload());
  for (const mutate of [r=>r.Rows=r.Rows.filter(x=>x.Customer==null),
    r=>r.Rows.push(clone(r.Rows[1])), r=>r.Rows[1].Customer.ID=123,
    r=>r.Rows[1].Item.ID=13473521, r=>r.Rows[1].PriceWithVAT=601,
    r=>r.Rows[1].PriceWithoutVAT=499, r=>r.Rows[1].Code='TEST01',
    r=>r.ValidationMessages.push('synthetic validation')]) {
    const r=prices();mutate(r);assert.throws(()=>validatePriceList(r,payload()));
  }
});
test('readback rejects issued invoice, wrong tax, amount, reference, date, warehouse, quantity or payment', () => {
  for (const mutate of [r=>r.Status='I',r=>r.InvoiceNumber=42,r=>r.Customer.ID=1,
    r=>r.DateIssued='2026-10-31',r=>r.DocumentReference='OTHER',r=>r.PricesOnInvoice='N',
    r=>r.IssuedInvoiceRows[5].VatAccountingType='3.6',r=>r.IssuedInvoiceRows[0].Quantity=2,
    r=>r.IssuedInvoiceRows[5].Warehouse={ID:40999},r=>r.IssuedInvoiceRows[0].Value=599,
    r=>r.IssuedInvoiceRows[0].DiscountPercent=1,r=>r.IssuedInvoiceRows[0].VatRate.ID=3,
    r=>r.IssuedInvoicePaymentMethods[0].Amount=2968.01,r=>r.IssuedInvoicePaymentMethods[0].AlreadyPaid='D']) {
    const actual=invoice();mutate(actual);assert.throws(()=>verifyDraft(actual,payload()));
  }
});
test('create Location accepts own API URLs only and never lets provider choose another org/host', () => {
  for(const l of [`api/orgs/81179/issuedinvoices/${ID}`, `/api/orgs/81179/issuedinvoices/${ID}`,
    `/RS/API/api/orgs/81179/issuedinvoices/${ID}`,`https://moj.minimax.rs/RS/API/api/orgs/81179/issuedinvoices/${ID}`]) assert.equal(invoiceIdFromLocation(l),ID);
  for(const l of [null,'',`https://evil.example/api/orgs/81179/issuedinvoices/${ID}`,
    `https://user:pass@moj.minimax.rs/api/orgs/81179/issuedinvoices/${ID}`,
    `/api/orgs/1/issuedinvoices/${ID}`,`/api/orgs/81179/issuedinvoices/${ID}?token=bad`,
    '/api/orgs/81179/issuedinvoices/0','/api/orgs/81179/issuedinvoices/9007199254740993']) assert.throws(()=>invoiceIdFromLocation(l));
});
test('OAuth has four independent credentials, form encoding and one login attempt', async () => {
  const h=provider();await h.client.login();
  const form=new URLSearchParams(h.calls[0].options.body);
  assert.equal(form.get('client_id'),'synthetic-code');assert.equal(form.get('username'),'adriatic-webshop');
  assert.equal(form.get('grant_type'),'password');assert.equal(form.get('scope'),'minimax.rs');
  assert.equal(form.get('client_secret'),credentials().clientSecret);
  await assert.rejects(()=>h.client.login(),/LOGIN_ALREADY_ATTEMPTED/);
  assert.equal(h.calls.length,1);h.client.close();
});
test('documented Location query id must match the path; duplicate/foreign parameters fail closed', () => {
  for (const prefix of ['/api/orgs/81179/issuedinvoices/', 'https://moj.minimax.rs/RS/API/api/orgs/81179/issuedinvoices/']) {
    assert.equal(invoiceIdFromLocation(`${prefix}${ID}?id=${ID}`),ID);
    for (const query of [`id=${ID+1}`,`id=${ID}&id=${ID}`,`id=${ID}&token=bad`,
      `organisationId=81179&id=${ID}`,`id=0${ID}`,'id=']) {
      assert.throws(()=>invoiceIdFromLocation(`${prefix}${ID}?${query}`),/UNEXPECTED_CREATE_LOCATION/);
    }
  }
});
test('bad login is never retried and provider response does not leak secrets', async () => {
  const h=provider({tokenStatus:400,tokenBody:{error:'invalid_grant',password:credentials().password}});
  await assert.rejects(()=>h.client.login(),error=>{
    assert.equal(error.status,400);assert.ok(!JSON.stringify(error).includes('SYNTHETIC-USER'));return true;
  });
  await assert.rejects(()=>h.client.login());assert.equal(h.calls.length,1);
  assert.ok(!safeError(new Error(credentials().password)).includes(credentials().password));
  assert.equal(safeError(new ProbeError('MINIMAX_HTTP_ERROR',401)),'REZULTAT: NEUSPEH; MINIMAX_HTTP_ERROR; HTTP 401.');
});
test('transport failures/redirects are sanitized without exposing raw causes', async () => {
  const client=new MinimaxDraftClient({credentials:credentials(),fetchImpl:async()=>{throw Error('SYNTHETIC-SECRET https://evil/');}});
  await assert.rejects(()=>client.login(), e=>{assert.equal(e.message,'MINIMAX_NETWORK_ERROR');assert.equal(e.cause,undefined);return true;});
});
test('timeout also covers a response body that stalls after headers', async () => {
  const client=new MinimaxDraftClient({credentials:credentials(),timeoutMs:10,fetchImpl:async(_u,o)=>{
    return {ok:true,status:200,headers:new Headers(),text:()=>new Promise((_resolve,reject)=>o.signal.addEventListener('abort',()=>reject(Error('private-body'))))};
  }});
  await assert.rejects(()=>client.login(),/MINIMAX_TIMEOUT/);
});
test('transport rejects arbitrary create payload or copied invoice IDs without POST', async () => {
  const h=provider();await h.client.login();
  for (const mutate of [p=>p.Status='I',p=>p.IssuedInvoiceId=123,p=>p.RowVersion='stale',
    p=>p.IssuedInvoiceRows[0].IssuedInvoiceRowId=123,p=>p.AssociationWithStock='D',
    p=>p.IssuedInvoicePaymentMethods[0].IssuedInvoicePaymentMethodId=123]) {
    const p=payload();mutate(p);await assert.rejects(()=>h.client.createSampleDraft(p),/ONLY_FIXED_SAMPLE/);
  }
  assert.equal(h.calls.length,1);
  assert.equal(typeof h.client.issueReceipt,'undefined');assert.equal(typeof h.client.refundReceipt,'undefined');
});

test('live-shaped round trip creates one draft and a second launch reads it only', async()=>inJournal(async dir=>{
  const h=provider();let journal=openJournal(dir);
  const result=await runProbe({client:h.client,journal,day:DAY});journal.close();
  assert.deepEqual(result,{id:ID,total:2968,status:'O',reused:false});assert.equal(h.made.length,1);
  const readback=h.calls.find(c=>c.options.method==='GET' && c.url.endsWith(`/issuedinvoices/${ID}`));
  assert.equal(readback.url,`https://moj.minimax.rs/RS/API/api/orgs/81179/issuedinvoices/${ID}`);
  const h2=provider();journal=openJournal(dir);
  const again=await runProbe({client:h2.client,journal,day:'2026-11-03'});journal.close();
  assert.equal(again.reused,true);assert.equal(h2.made.length,0);
  assert.ok(!h2.calls.some(c=>c.url.includes('pricelists')));
  assert.ok(!fs.readFileSync(path.join(dir,'probe-001.json'),'utf8').includes('SECRET'));
}));
test('changed reference or customer price stops before creating or recording a POST attempt', async()=>inJournal(async dir=>{
  const h=provider({onRead:async()=>Response.json({...invoice(),Status:'I'})});
  const journal=openJournal(dir);
  await assert.rejects(()=>runProbe({client:h.client,journal,day:DAY}),/NOT_A_DRAFT/);
  assert.equal(h.made.length,0);assert.equal(journal.read(),null);journal.close();
}));
test('missing org rights or a changed live customer price causes zero create calls', async()=>{
  const changed=prices();changed.Rows[1].PriceWithVAT=601;
  for(const options of [{orgBody:{Rows:[{Organisation:{ID:81179},APIAccess:'N'}]}},{pricesBody:changed}]) {
    await inJournal(async dir=>{
      const h=provider(options),journal=openJournal(dir);
      await assert.rejects(()=>runProbe({client:h.client,journal,day:DAY}));
      assert.equal(h.made.length,0);assert.equal(journal.read(),null);journal.close();
    });
  }
});
test('provider accepted draft but lost response: durable unknown state blocks all resends', async()=>inJournal(async dir=>{
  const h=provider({onCreate:()=>{throw Error('lost response');}});let journal=openJournal(dir);
  await assert.rejects(()=>runProbe({client:h.client,journal,day:DAY}),/MINIMAX_NETWORK_ERROR/);
  assert.equal(journal.read().status,'sending');assert.equal(h.made.length,1);journal.close();
  const h2=provider();journal=openJournal(dir);
  await assert.rejects(()=>runProbe({client:h2.client,journal,day:DAY}),/OUTCOME_UNCERTAIN/);
  assert.equal(h2.calls.length,0);journal.close();
}));
for(const status of [400,401,429,500]) test(`create HTTP ${status} is never blindly retried`,async()=>inJournal(async dir=>{
  const h=provider({onCreate:()=>new Response('synthetic',{status})});const journal=openJournal(dir);
  await assert.rejects(()=>runProbe({client:h.client,journal,day:DAY}),/MINIMAX_HTTP_ERROR/);
  assert.equal(journal.read().status,'sending');assert.equal(h.made.length,1);journal.close();
}));
test('missing Location leaves unknown outcome and no repeated POST',async()=>inJournal(async dir=>{
  const h=provider({onCreate:()=>new Response(null,{status:201})});const journal=openJournal(dir);
  await assert.rejects(()=>runProbe({client:h.client,journal,day:DAY}),/CREATE_LOCATION_MISSING/);
  assert.equal(journal.read().status,'sending');journal.close();
}));
test('mismatching Location query preserves uncertain state and never reads an unrelated invoice',async()=>inJournal(async dir=>{
  const h=provider({onCreate:()=>new Response(null,{status:201,headers:{Location:`https://moj.minimax.rs/RS/API/api/orgs/81179/issuedinvoices/${ID}?id=${ID+1}`}})});
  const journal=openJournal(dir);
  await assert.rejects(()=>runProbe({client:h.client,journal,day:DAY}),/UNEXPECTED_CREATE_LOCATION/);
  assert.equal(journal.read().status,'sending');assert.equal(h.made.length,1);
  assert.ok(!h.calls.some(c=>c.options.method==='GET' && c.url.includes(`/issuedinvoices/${ID}`)));
  journal.close();
}));
test('ID persisted before failed readback; rerun GET verifies same ID without POST',async()=>inJournal(async dir=>{
  const h=provider({onRead:async id=>id===ID?new Response(null,{status:503}):null});let journal=openJournal(dir);
  await assert.rejects(()=>runProbe({client:h.client,journal,day:DAY}),/MINIMAX_HTTP_ERROR/);
  assert.equal(journal.read().status,'created');assert.equal(journal.read().invoiceId,ID);journal.close();
  const h2=provider();journal=openJournal(dir);
  assert.equal((await runProbe({client:h2.client,journal,day:DAY})).reused,true);
  assert.equal(h2.made.length,0);journal.close();
}));
test('manual reconciliation only accepts matching draft/reference; no POST',async()=>inJournal(async dir=>{
  let journal=openJournal(dir);journal.write({status:'sending',payload:payload()});journal.close();
  const wrong=provider({onRead:async()=>Response.json({...invoice(),DocumentReference:'OTHER'})});journal=openJournal(dir);
  await assert.rejects(()=>runProbe({client:wrong.client,journal,reconcileId:ID}),/REFERENCE_MISMATCH/);
  assert.equal(journal.read().status,'sending');assert.equal(wrong.made.length,0);journal.close();
  const h=provider();journal=openJournal(dir);
  assert.equal((await runProbe({client:h.client,journal,reconcileId:ID})).id,ID);
  assert.equal(h.made.length,0);assert.equal(journal.read().status,'verified');journal.close();
}));
test('unwritable sending journal stops before POST',async()=>{
  const h=provider();let writes=0;
  const journal={read:()=>null,write:()=>{if(++writes===2)throw Error('disk failure');}};
  await assert.rejects(()=>runProbe({client:h.client,journal,day:DAY}),/disk failure/);
  assert.equal(h.made.length,0);
});
test('exclusive journal lock blocks concurrent processes; stale lock is not auto-removed',async()=>inJournal(async dir=>{
  const journal=openJournal(dir);
  const code="import {openJournal} from './tools/minimax-draft/journal.mjs'; try{openJournal(process.argv[1]);process.exit(2)}catch(e){if(e.message==='PROBE_LOCKED_CHECK_PREVIOUS_ATTEMPT')process.exit(0);throw e}";
  const child=spawnSync(process.execPath,['--input-type=module','-e',code,dir],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);assert.ok(fs.existsSync(path.join(dir,'probe.lock')));
  journal.close();
}));
test('corrupt or altered durable journal fails closed',async()=>inJournal(async dir=>{
  let journal=openJournal(dir);journal.write({status:'sending',payload:payload()});journal.close();
  const file=path.join(dir,'probe-001.json'),entry=JSON.parse(fs.readFileSync(file));entry.payload.Status='I';
  fs.writeFileSync(file,JSON.stringify(entry));journal=openJournal(dir);
  assert.throws(()=>journal.read(),/JOURNAL_INVALID/);journal.close();
}));
test('default CLI is offline preview, no credentials, no journal and no write command',()=>{
  const result=spawnSync(process.execPath,['tools/minimax-draft/cli.mjs'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/LOKALNI PREGLED/);
  const json=result.stdout.slice(result.stdout.indexOf('{'),result.stdout.lastIndexOf('}')+1);
  assert.equal(JSON.parse(json).Status,'O');assert.ok(!result.stdout.includes('SYNTHETIC-TOKEN'));
});
