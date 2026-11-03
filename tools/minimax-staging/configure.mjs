import fs from 'node:fs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('Cloudflare credentials required in Actions secrets');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`;
async function request(url,options={}){
  const r=await fetch(url,{...options,redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error('Cloudflare database configuration failed');
  const data=await r.json();if(!data.success)throw new Error('Cloudflare database configuration rejected');return data.result;
}
const dbs=[];
for(let page=1;page<=100;page++){
  const rows=await request(base+`?per_page=100&page=${page}`);if(!Array.isArray(rows))throw new Error('Invalid database list');dbs.push(...rows);if(rows.length<100)break;
  if(page===100)throw new Error('Database pagination limit');
}
const name='adriatic-trade-minimax-staging';
const matches=dbs.filter(d=>d.name===name);if(matches.length>1)throw new Error('Ambiguous staging database');
const db=matches[0]||await request(base,{method:'POST',body:JSON.stringify({name})});
const id=db.uuid||db.id;
if(!/^[a-f0-9-]{36}$/i.test(id||'')||db.name!==name||dbs.some(d=>d.name==='adriatic-trade-orders-db'&&(d.uuid||d.id)===id))throw new Error('Isolated staging database required');
fs.writeFileSync('.minimax-stage/wrangler.json',JSON.stringify({name,main:'../worker/minimax-staging.js',account_id:account,
  compatibility_date:'2026-10-02',workers_dev:true,
  assets:{directory:'./assets',binding:'ASSETS',run_worker_first:true,html_handling:'none',not_found_handling:'none'},
  d1_databases:[{binding:'DB',database_name:name,database_id:id}],
  vars:{MINIMAX_ENV:'staging',MINIMAX_MODE:'draft'}},null,2));
console.log('Isolated staging configuration ready. No production bindings or Minimax secrets in this file.');
