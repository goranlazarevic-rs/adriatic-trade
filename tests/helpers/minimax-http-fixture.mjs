// CI-only preload: all fetches are intercepted, never forwarded to the network.
import fs from 'node:fs';
import {CONFIG, buildDraft, sampleOrder} from '../../tools/minimax-draft/model.mjs';
if (process.env.MINIMAX_FIXTURE_MODE !== 'synthetic') throw Error('Synthetic fixture requires explicit opt-in');
const ID = 99999991;
const draft = buildDraft(sampleOrder());
const actual = id => ({...structuredClone(draft), IssuedInvoiceId: id, InvoiceNumber: 0, InvoiceValue: 0});
globalThis.fetch = async (url, options) => {
  const parsed = new URL(url);
  if (parsed.origin !== 'https://moj.minimax.rs') throw Error('Unexpected synthetic target');
  fs.appendFileSync(process.env.MINIMAX_FIXTURE_TRACE_FILE, `${options.method} ${parsed.pathname}\n`);
  if (parsed.pathname === '/RS/AUT/oauth20/token') {
    const p = new URLSearchParams(options.body);
    const checks = {code:p.get('client_id') === 'SYNTHETIC-CODE', client:p.get('client_secret') === 'SYNTHETIC-CLIENT-SECRET',
      user:p.get('username') === 'adriatic-webshop', password:p.get('password') === 'SYNTHETIC-USER-SECRET-č'};
    fs.appendFileSync(process.env.MINIMAX_FIXTURE_TRACE_FILE, 'synthetic-input-checks ' + JSON.stringify(checks) + '\n');
    if (!Object.values(checks).every(Boolean)) throw Error('Synthetic input mismatch');
    return Response.json({access_token:'SYNTHETIC-TOKEN',token_type:'bearer',expires_in:3600});
  }
  if (options.headers.Authorization !== 'Bearer SYNTHETIC-TOKEN') throw Error('Synthetic auth mismatch');
  if (parsed.pathname === '/RS/API/api/currentuser/orgs') return Response.json({Rows:[{Organisation:{ID:81179},APIAccess:'D'}]});
  if (parsed.pathname === '/RS/API/api/orgs/81179/items/pricelists') return Response.json({Rows:draft.IssuedInvoiceRows.map(r=>({
    Code:r.ItemCode,Item:r.Item,Customer:{ID:CONFIG.customerId},Warehouse:null,UnitOfMeasurement:'kom',
    PriceWithVAT:r.PriceWithVAT,PriceWithoutVAT:r.Price,
  })),ValidationMessages:[]});
  if (options.method === 'POST' && parsed.pathname === '/RS/API/api/orgs/81179/issuedinvoices') {
    if (JSON.stringify(JSON.parse(options.body)) !== JSON.stringify(draft)) throw Error('Synthetic draft mismatch');
    return new Response(null,{status:201,headers:{Location:`https://moj.minimax.rs/RS/API/api/orgs/81179/issuedinvoices/${ID}`}});
  }
  if (options.method === 'GET' && [CONFIG.referenceInvoiceId,ID].some(id=>parsed.pathname===`/RS/API/api/orgs/81179/issuedinvoices/${id}`)) {
    return Response.json(actual(Number(parsed.pathname.split('/').at(-1))));
  }
  throw Error('Unexpected synthetic request');
};
