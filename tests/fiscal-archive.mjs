import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {harness} from './helpers/local-delivery-harness.mjs';
import {downloadArchive,documentPath,API} from '../tools/fiscal-archive/download.mjs';

const token='synthetic-read-only-archive-token-123456789';
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
async function fixture(){
  const h=harness();h.ctx.env.FIRST_SALE_MODE='manual-minimax';h.ctx.env.FISCAL_ARCHIVE_TOKEN=token;
  const order=await h.add(undefined,{local:false,status:'confirmed'});await h.get(order);
  const add=async(i,options={})=>{
    const id='00000000-0000-4000-8000-'+String(i).padStart(12,'0'),pdf=Buffer.from('%PDF-1.4\nSYNTHETIC ARCHIVE ONLY '+i);
    const row={pfr_key:'TESTTEST-TESTTEST-'+i,pfr_number:'TESTTEST-TESTTEST-'+i,order_id:order,kind:'sale',
      operation_id:id,request_hash:'synthetic',issued_at:'2026-10-31T23:30:00.000Z',gross_cents:101800,delivery_mode:'minimax',
      recipient:'test@example.com',pdf_key:'fiscal/old-layout/'+i+'.pdf',pdf_filename:'original.pdf',pdf_hash:hash(pdf),reason:'Synthetic archive fixture',
      source_items:'[]',source_email:'test@example.com',source_payment:'Pouzećem',source_goods:598,source_shipping:420,source_total:1018,created_at:'2026-11-01T12:00:00.000Z',...options};
    // Use a separate order per extra synthetic document to respect UNIQUE(order_id,kind).
    row.order_id=i===1?order:'TEST-ORDER-'+i;
    h.sql.prepare(`INSERT INTO fiscal_documents (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(()=>'?').join(',')})`).run(...Object.values(row));
    if(row.pdf_key)await h.receipts.put(row.pdf_key,pdf,{httpMetadata:{contentType:'application/pdf'}});
    return {id,pdf,row};
  };
  const request=(suffix='',method='GET',key=token)=>h.ctx.run(new Request(API+'/archive/fiscal'+suffix,{method,headers:{Authorization:'Bearer '+key}}));
  return {...h,add,request};
}

test('read-only archive denies missing, admin and reused credentials; denies writes and grants no admin access',async()=>{
  const h=await fixture();await h.add(1);
  for(const key of ['',h.ctx.env.ADMIN_TOKEN,'wrong'])assert.equal((await h.request('','GET',key)).status,401);
  for(const method of ['POST','PUT','DELETE'])assert.equal((await h.request('',method)).status,405);
  const denied=await h.ctx.run(new Request(API+'/admin/orders',{headers:{Origin:'https://adriatictrade.rs',Authorization:'Bearer '+token}}));
  assert.equal(denied.status,401);
  h.ctx.env.FISCAL_ARCHIVE_TOKEN=h.ctx.env.ADMIN_TOKEN;
  assert.equal((await h.request('','GET',h.ctx.env.ADMIN_TOKEN)).status,401);
  assert.equal(h.sql.prepare('SELECT count(*) n FROM fiscal_documents').get().n,1);assert.equal(h.state.emails.length,0);
});

test('inventory returns minimum metadata, reports missing originals and legacy receipts; exact old-layout bytes remain readable',async()=>{
  const h=await fixture(),doc=await h.add(1);await h.add(2,{pdf_key:null,pdf_hash:null});
  h.sql.prepare('UPDATE orders SET receipt_key=?').run('fiscal/legacy.pdf');
  const response=await h.request(),data=await response.json();assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(data.documents.length,1);assert.equal(data.incomplete,1);assert.equal(data.legacy,1);assert.equal(data.next,null);
  assert.equal(data.documents[0].sha256,hash(doc.pdf));assert.ok(!JSON.stringify(data).includes('test@example.com'));
  const pdf=await h.request('/'+doc.id);assert.equal(pdf.headers.get('x-content-sha256'),hash(doc.pdf));
  assert.deepEqual(Buffer.from(await pdf.arrayBuffer()),doc.pdf);
  h.receiptFiles.delete(doc.row.pdf_key);assert.equal((await h.request('/'+doc.id)).status,503);
  assert.equal((await h.request('/invalid')).status,404);assert.equal((await h.request('?after=bad')).status,400);
});

test('paginated inventory crosses 100 documents without loss',async()=>{
  const h=await fixture();for(let i=1;i<=102;i++)await h.add(i);
  const first=await(await h.request()).json(),last=await(await h.request('?after='+first.next)).json();
  assert.equal(first.documents.length,100);assert.equal(last.documents.length,2);assert.equal(last.next,null);
  assert.equal(new Set([...first.documents,...last.documents].map(d=>d.id)).size,102);
});

test('new storage and local folders use invoice year/month in Belgrade; traversal and invalid dates are refused',async()=>{
  const h=await fixture();
  const key=vm.runInContext("fiscalStorageKey('TEST-ORDER','original.pdf','2026-10-31T23:30:00.000Z')",h.ctx);
  assert.match(key,/^fiscal\/2026\/11\/TEST-ORDER\/.+-original\.pdf$/);
  const doc={id:crypto.randomUUID(),orderId:'../../CON',kind:'refund',issuedAt:'2026-10-31T23:30:00.000Z',sha256:'a'.repeat(64)};
  const relative=documentPath(doc);assert.ok(relative.startsWith(path.join('2026','11')+path.sep));assert.ok(!relative.includes('..'));
  assert.throws(()=>documentPath({...doc,id:'../../bad'}));assert.throws(()=>documentPath({...doc,issuedAt:'2026-02-30'}));
});

async function local(t){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'at-archive-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  return {root:path.join(temp,'OneDrive','Fiscal'),stateDirectory:path.join(temp,'private-state'),token};
}

test('end-to-end download verifies originals, repeats without PDF network requests, restores deleted local copy and keeps source-deleted copies',async t=>{
  const h=await fixture(),doc=await h.add(1),options=await local(t);let pdfRequests=0;
  options.fetchImpl=(url,init)=>{assert.ok(url.startsWith(API+'/archive/fiscal'));assert.equal(init.redirect,'error');if(url.includes('/'+doc.id))pdfRequests++;return h.ctx.run(new Request(url,init));};
  let result=await downloadArchive(options);assert.equal(result.downloaded,1);
  const metadata=(await(await h.request()).json()).documents[0],target=path.join(options.root,documentPath(metadata));
  assert.deepEqual(await fs.readFile(target),doc.pdf);
  result=await downloadArchive(options);assert.equal(result.verified,1);assert.equal(pdfRequests,1);
  await fs.unlink(target);result=await downloadArchive(options);assert.equal(result.downloaded,1);assert.equal(pdfRequests,2);
  h.sql.exec('DELETE FROM fiscal_documents');await downloadArchive(options);assert.deepEqual(await fs.readFile(target),doc.pdf);
  assert.equal(JSON.parse(await fs.readFile(path.join(options.stateDirectory,'last-success.json'))).cloudSync,'not-verified');
});

test('corruption in an existing copy halts without overwrite or a new success timestamp',async t=>{
  const h=await fixture();await h.add(1);const options=await local(t);options.fetchImpl=(url,init)=>h.ctx.run(new Request(url,init));
  await downloadArchive(options);const doc=(await(await h.request()).json()).documents[0],target=path.join(options.root,documentPath(doc));
  const report=await fs.readFile(path.join(options.stateDirectory,'last-success.json'),'utf8');
  await fs.writeFile(target,'SYNTHETIC CORRUPTION');await assert.rejects(downloadArchive(options),/razlikuje/);
  assert.equal(await fs.readFile(target,'utf8'),'SYNTHETIC CORRUPTION');
  assert.equal(await fs.readFile(path.join(options.stateDirectory,'last-success.json'),'utf8'),report);
});

test('download refuses a changed network PDF; no original is saved and lock is released',async t=>{
  const h=await fixture(),doc=await h.add(1),options=await local(t);
  options.fetchImpl=async(url,init)=>url.endsWith('/'+doc.id)?new Response('%PDF-TAMPERED',{headers:{'Content-Type':'application/pdf','X-Content-SHA256':doc.row.pdf_hash}}):h.ctx.run(new Request(url,init));
  await assert.rejects(downloadArchive(options),/ne odgovara/);
  await assert.rejects(fs.stat(path.join(options.stateDirectory,'last-success.json')),{code:'ENOENT'});
  await assert.rejects(fs.stat(path.join(options.stateDirectory,'download.lock')),{code:'ENOENT'});
});

test('metadata pagination loops, oversized PDF responses and directory links fail closed',async t=>{
  const h=await fixture(),doc=await h.add(1),options=await local(t);
  const metadata=(await(await h.request()).json()).documents[0];
  options.fetchImpl=async()=>new Response(JSON.stringify({ok:true,version:1,documents:[metadata],incomplete:0,legacy:0,next:metadata.id}));
  await assert.rejects(downloadArchive(options));
  options.fetchImpl=async(url,init)=>url.endsWith('/'+doc.id)?new Response('%PDF-BAD',{headers:{'Content-Type':'application/pdf','X-Content-SHA256':doc.row.pdf_hash,'Content-Length':String(6*1024*1024)}}):h.ctx.run(new Request(url,init));
  await assert.rejects(downloadArchive(options),/velicinu/);
  const outside=path.join(path.dirname(options.root),'outside');await fs.mkdir(outside);await fs.rm(path.join(options.root,'2026'),{recursive:true,force:true});
  await fs.symlink(outside,path.join(options.root,'2026'),process.platform==='win32'?'junction':'dir');
  options.fetchImpl=(url,init)=>h.ctx.run(new Request(url,init));await assert.rejects(downloadArchive(options),/preusmeren/);
});

test('credentials are not accepted from cloud folder; lock avoids concurrent jobs',async t=>{
  const options=await local(t);
  await assert.rejects(downloadArchive({...options,stateDirectory:path.join(options.root,'secret')}),/izvan/);
  await fs.mkdir(options.stateDirectory,{recursive:true});await fs.writeFile(path.join(options.stateDirectory,'download.lock'),'synthetic active job');
  await assert.rejects(downloadArchive(options),/vec pokrenuto/);
});

test('an incomplete archive cannot produce a complete-backup success record',async t=>{
  const h=await fixture();await h.add(1,{pdf_key:null,pdf_hash:null});const options=await local(t);
  options.fetchImpl=(url,init)=>h.ctx.run(new Request(url,init));
  const result=await downloadArchive(options);assert.equal(result.incomplete,1);
  assert.equal(JSON.parse(await fs.readFile(path.join(options.stateDirectory,'last-download.json'))).incomplete,1);
  await assert.rejects(fs.stat(path.join(options.stateDirectory,'last-success.json')),{code:'ENOENT'});
});
