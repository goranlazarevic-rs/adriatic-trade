import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {seal,unseal} from '../ops/seal.mjs';
const pair=crypto.generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'at-operations-test-'));
process.on('exit',()=>fs.rmSync(root,{recursive:true,force:true}));
for(const [name,data] of [['binary',crypto.randomBytes(100000)],['empty',Buffer.alloc(0)]])test('Authenticated encryption round trip: '+name,async()=>{
 const input=path.join(root,name),encrypted=input+'.atbak',output=input+'.out';fs.writeFileSync(input,data);
 await seal(input,encrypted,pair.publicKey);await unseal(encrypted,output,pair.privateKey);
 assert.deepEqual(fs.readFileSync(output),data);assert.equal(fs.statSync(encrypted).mode&0o777,0o600);
 await assert.rejects(seal(input,encrypted,pair.publicKey),/already exists/);
 await assert.rejects(unseal(encrypted,output,pair.privateKey),/already exists/);
});
test('Corruption, truncation and wrong keys leave no plaintext output',async()=>{
 const input=path.join(root,'secret'),encrypted=input+'.atbak';fs.writeFileSync(input,'private invoice PDF');await seal(input,encrypted,pair.publicKey);
 const bytes=fs.readFileSync(encrypted);
 const badKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
 for(const [label,value,key] of [['tampered',Buffer.from(bytes),pair.privateKey],['truncated',bytes.subarray(0,30),pair.privateKey],['wrong-key',bytes,badKey]]){
  if(label==='tampered')value[value.length-20]^=1;
  const damaged=input+'.'+label,out=damaged+'.out';fs.writeFileSync(damaged,value);
  await assert.rejects(unseal(damaged,out,key));assert.equal(fs.existsSync(out),false);assert.equal(fs.existsSync(out+'.partial'),false);
 }
});
test('Public asset build excludes infrastructure, SQL and recovery keys',()=>{
 const result=spawnSync(process.execPath,['scripts/build-web.mjs'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 for(const file of ['index.html','admin.html','checkout.html','assets/js/main.js','assets/js/admin.js','dokumenti/adriatic-trade-obrazac-odustanak.pdf'])assert.ok(fs.statSync('.web-dist/'+file).isFile());
 for(const file of ['ops','worker','.git','.github','tests','cloudflare-d1-schema-v1.sql','CNAME'])assert.equal(fs.existsSync('.web-dist/'+file),false);
 const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
 assert.ok(!walk('.web-dist').some(p=>/\.(pem|sql|sqlite|atbak|p12|pfx)$/.test(p)));
});
