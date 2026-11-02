import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'minimax-stage-'));
try{
 const r=spawnSync(process.execPath,['tools/minimax-staging/prepare.mjs',temp],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(temp,'seed.sql'),'utf8'));db.exec(fs.readFileSync(path.join(temp,'seed.sql'),'utf8'));
 assert.equal(db.prepare('SELECT count(*) n FROM orders').get().n,3);assert.equal(db.prepare('SELECT name FROM minimax_environment').get().name,'minimax-staging');
 assert.equal(db.prepare("SELECT count(*) n FROM orders WHERE customer_email!='minimax-test@example.invalid'").get().n,0);
 assert.match(fs.readFileSync(path.join(temp,'assets/admin.html'),'utf8'),/PROBNI PANEL/);
 for(const name of ['admin-availability.js','admin-probe.js'])assert.ok(fs.existsSync(path.join(temp,'assets/assets/js',name)));
 assert.equal(db.prepare('SELECT mode FROM checkout_intake').get().mode,'paused');
 assert.equal(db.prepare('SELECT count(*) n FROM checkout_stock').get().n,0,'Never seed allocations');
 db.exec("UPDATE checkout_intake SET mode='open';INSERT INTO checkout_stock VALUES('10306','available',7,'2099-01-01','Synthetic only')");
 const revision=db.prepare('SELECT revision FROM checkout_control').get().revision;
 db.exec(fs.readFileSync(path.join(temp,'seed.sql'),'utf8'));
 assert.equal(db.prepare('SELECT mode FROM checkout_intake').get().mode,'open');
 assert.equal(db.prepare('SELECT remaining FROM checkout_stock').get().remaining,7);
 assert.equal(db.prepare('SELECT revision FROM checkout_control').get().revision,revision);

 const config=fs.readFileSync('tools/minimax-staging/configure.mjs','utf8');assert.doesNotMatch(config,/r2_buckets|RESEND_API_KEY|TURNSTILE_SECRET_KEY/);assert.match(config,/run_worker_first:true/);
 const workflow=fs.readFileSync('.github/workflows/deploy-worker.yml','utf8').split('  minimax-staging:')[1];assert.match(workflow,/inputs\.deploy_minimax_staging == true/);assert.match(workflow,/inputs\.deploy_production != true/);assert.match(workflow,/needs: validate/);assert.doesNotMatch(workflow,/secrets\.MINIMAX|d1 execute adriatic-trade-orders-db|wrangler\.deploy\.json/);
 const sha='a'.repeat(40);const fakegit=path.join(temp,'git');fs.writeFileSync(fakegit,'#!/usr/bin/env bash\nprintf "%s\\n" "$GITHUB_SHA"\n',{mode:0o755});
 const base={...process.env,PATH:temp+':'+process.env.PATH,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/feat/minimax-admin-test',GITHUB_SHA:sha,APPROVED_STAGING_SHA:sha,DEPLOY_PRODUCTION:'false'};
 for(const [env,ok]of[[{},true],[{GITHUB_EVENT_NAME:'push'},false],[{GITHUB_REF:'refs/heads/main'},false],[{APPROVED_STAGING_SHA:'bad'},false],[{APPROVED_STAGING_SHA:'b'.repeat(40)},false],[{DEPLOY_PRODUCTION:'true'},false]])assert.equal(spawnSync('bash',['scripts/check-minimax-staging.sh'],{env:{...base,...env}}).status===0,ok);
 console.log('PASS: staging seed idempotency/synthetic data; isolated bindings; default-off/manual SHA and branch gate; production flag rejected');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
