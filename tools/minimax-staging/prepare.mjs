import fs from 'node:fs';
import path from 'node:path';
import {fixtures} from './fixtures.mjs';
const out=process.argv[2];
if(!out)throw new Error('Output directory required');
fs.mkdirSync(out,{recursive:true});
for(const file of ['admin.html','assets/js/admin.js','assets/css/style.css','assets/css/admin.css','assets/img/favicon.png','assets/img/adriatic-trade-logo-header.png']){
  const target=path.join(out,'assets',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);
}
const html=path.join(out,'assets/admin.html');
fs.writeFileSync(html,fs.readFileSync(html,'utf8').replace('<title>', '<title>PROBA · ').replace('<main', '<p style="padding:16px;background:#fff2cc;color:#111;text-align:center">PROBNI PANEL — samo sintetičke porudžbine. Nacrti se ne izdaju; nema slanja kupcima ili kuriru.</p><main'));
const quote=v=>"'"+String(v??'').replaceAll("'","''")+"'";
let sql=fs.readFileSync('cloudflare-d1-schema-v1.sql','utf8');
sql+='\nCREATE TABLE IF NOT EXISTS minimax_environment (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL);\nINSERT OR IGNORE INTO minimax_environment VALUES (1,\'minimax-staging\');\n';
for(const o of fixtures()){
  const cols=['id','submission_id','created_at','updated_at','status','customer_first_name','customer_last_name','customer_email','customer_phone','delivery_method','address','postal_code','city','note','payment','items_json','goods_total','shipping','total'];
  const values=[o.id,o.submissionId,o.createdAt,o.createdAt,o.status,o.customer.firstName,o.customer.lastName,o.customer.email,o.customer.phone,o.delivery.method,o.delivery.address,o.delivery.postalCode,o.delivery.city,o.delivery.note,o.payment,JSON.stringify(o.items),o.goodsTotal,o.shipping,o.total];
  sql+=`INSERT OR IGNORE INTO orders (${cols.join(',')}) VALUES (${values.map(quote).join(',')});\n`;
}
fs.writeFileSync(path.join(out,'seed.sql'),sql);
