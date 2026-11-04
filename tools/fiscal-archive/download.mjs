import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const API='https://adriatic-trade-orders.lakifinance.workers.dev';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const MAX_PDF=5*1024*1024;
function demand(ok,message){if(!ok)throw Error(message);}

export function parseArchiveCredential(input) {
  demand(typeof input==='string'&&input.length<=4096,'Neispravan unos kljuca.');
  // Windows PowerShell/.NET may prefix redirected UTF-8 stdin with a BOM.
  const data=JSON.parse(input.replace(/^\uFEFF/,''));
  demand(data&&typeof data.token==='string','Nedostaje kljuc arhive.');
  return data.token;
}

export function documentPath(doc) {
  demand(uuid.test(doc.id)&&['sale','refund'].includes(doc.kind)&&typeof doc.orderId==='string'&&doc.orderId.length<=160,'Neispravna oznaka dokumenta.');
  demand(typeof doc.sha256==='string'&&/^[a-f0-9]{64}$/.test(doc.sha256),'Nedostaje kontrolni otisak originala.');
  const date=new Date(doc.issuedAt);
  demand(typeof doc.issuedAt==='string'&&Number.isFinite(date.getTime())&&date.toISOString()===doc.issuedAt,'Neispravan datum izdavanja.');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Belgrade',year:'numeric',month:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
  demand(/^\d{4}$/.test(parts.year)&&/^\d{2}$/.test(parts.month),'Neispravna godina izdavanja.');
  const order='porudzbina-'+doc.orderId.replace(/[^a-zA-Z0-9_-]/g,'_');
  return path.join(parts.year,parts.month,order,`${doc.kind}-${doc.id}.pdf`);
}

async function boundedBody(response,max) {
  const declared=Number(response.headers.get('content-length')||0);
  demand(Number.isSafeInteger(declared)&&declared>=0&&declared<=max,'Odgovor prelazi dozvoljenu velicinu.');
  demand(response.body,'Prazan odgovor arhive.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try { while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;demand(size<=max,'Odgovor prelazi dozvoljenu velicinu.');chunks.push(value);} }
  finally {await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks);
}

// Refuse junctions/symlinks below the selected root, including a PDF link.
async function safeParent(root,relative) {
  let current=root;
  for(const part of relative.split(path.sep).slice(0,-1)){
    current=path.join(current,part);await fs.mkdir(current).catch(e=>{if(e.code!=='EEXIST')throw e;});
    const stat=await fs.lstat(current);demand(stat.isDirectory()&&!stat.isSymbolicLink(),'Folder arhive je preusmeren.');
  }
}

export async function downloadArchive({root,stateDirectory,token,fetchImpl=fetch,onProgress=()=>{}}) {
  demand(typeof token==='string'&&token.length>=32&&token.length<=512&&!/[\r\n]/.test(token),'Neispravan kljuc za citanje arhive.');
  demand(path.isAbsolute(root)&&path.isAbsolute(stateDirectory),'Odaberite apsolutni folder arhive.');
  await fs.mkdir(root,{recursive:true});await fs.mkdir(stateDirectory,{recursive:true,mode:0o700});
  root=await fs.realpath(root);stateDirectory=await fs.realpath(stateDirectory);
  demand(stateDirectory!==root&&!stateDirectory.startsWith(root+path.sep),'Podesavanja moraju biti izvan foldera racuna.');
  const lockPath=path.join(stateDirectory,'download.lock');
  let lock;try{lock=await fs.open(lockPath,'wx',0o600);}catch{throw Error('Preuzimanje je vec pokrenuto ili je ostala brava prethodnog prekida.');}
  const request=async suffix=>{
    const response=await fetchImpl(API+'/archive/fiscal'+suffix,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(60000)});
    demand(response.ok,response.status===401?'Kljuc arhive nije prihvacen.':'Arhiva trenutno nije dostupna; pokusajte ponovo.');
    return response;
  };
  const result={downloaded:0,verified:0,incomplete:0,legacy:0},seen=new Set(),cursors=new Set();let cursor='';
  try {
    for(let page=0;page<10000;page++){
      const response=await request(cursor?'?after='+encodeURIComponent(cursor):'');
      const data=JSON.parse((await boundedBody(response,256*1024)).toString('utf8'));
      demand(data.ok===true&&data.version===1&&Array.isArray(data.documents)&&data.documents.length<=100,'Neispravan pregled arhive.');
      demand(Number.isSafeInteger(data.incomplete)&&data.incomplete>=0&&Number.isSafeInteger(data.legacy)&&data.legacy>=0,'Nedostaje pregled potpunosti arhive.');
      result.incomplete=Math.max(result.incomplete,data.incomplete);result.legacy=Math.max(result.legacy,data.legacy);
      for(const doc of data.documents){
        demand(!seen.has(doc.id),'Dokument je ponovljen u pregledu arhive.');seen.add(doc.id);
        const relative=documentPath(doc),target=path.join(root,relative);await safeParent(root,relative);
        let existing;try{existing=await fs.lstat(target);}catch(e){if(e.code!=='ENOENT')throw e;}
        if(existing){
          demand(existing.isFile()&&!existing.isSymbolicLink()&&existing.size<=MAX_PDF,'Postojeca kopija nije obican PDF.');
          demand(hash(await fs.readFile(target))===doc.sha256,'Postojeci PDF se razlikuje od originala. Nije prepisan; potrebna je provera.');
          result.verified++;continue;
        }
        const pdfResponse=await request('/'+doc.id);
        demand(pdfResponse.headers.get('content-type')?.split(';')[0]==='application/pdf'&&pdfResponse.headers.get('x-content-sha256')===doc.sha256,'Neispravan odgovor sa PDF dokumentom.');
        const bytes=await boundedBody(pdfResponse,MAX_PDF);
        demand(bytes.subarray(0,5).toString()==='%PDF-'&&hash(bytes)===doc.sha256,'Preuzeti PDF ne odgovara originalu. Nije sacuvan.');
        const file=await fs.open(target,'wx',0o600);let saved=false;
        try{await file.writeFile(bytes);await file.sync();saved=true;}finally{await file.close();if(!saved)await fs.unlink(target).catch(()=>{});}
        result.downloaded++;onProgress(result);
      }
      if(data.next===null){
        const report={...result,completedAt:new Date().toISOString(),cloudSync:'not-verified'};
        await fs.writeFile(path.join(stateDirectory,'last-download.json'),JSON.stringify(report,null,2),{mode:0o600});
        if(!result.incomplete&&!result.legacy)await fs.writeFile(path.join(stateDirectory,'last-success.json'),JSON.stringify(report,null,2),{mode:0o600});
        return report;
      }
      demand(uuid.test(data.next)&&!cursors.has(data.next)&&data.documents.length>0,'Neispravna paginacija arhive.');
      cursors.add(data.next);cursor=data.next;
    }
    throw Error('Arhiva je prevelika za jedno izvrsavanje.');
  }finally{token='';await lock.close();await fs.unlink(lockPath);}
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  try{
    demand(process.argv.length===3,'Nedostaje lokalno podesavanje.');
    const configPath=path.resolve(process.argv[2]);
    const config=JSON.parse(await fs.readFile(configPath,'utf8'));
    let input='';for await(const part of process.stdin){input+=part.toString('utf8');demand(input.length<=4096,'Neispravan unos kljuca.');}
    const result=await downloadArchive({root:config.root,stateDirectory:path.dirname(configPath),token:parseArchiveCredential(input)});input='';
    console.log(`Sacuvano novih PDF: ${result.downloaded}; provereno postojecih: ${result.verified}.`);
    if(result.incomplete||result.legacy){console.error(`POTREBNA DOPUNA: bez originala ${result.incomplete}; raniji dokumenti za povezivanje ${result.legacy}.`);process.exitCode=2;}
    console.log('Preuzimanje je zavrseno. Status OneDrive slanja proverite u OneDrive aplikaciji.');
  }catch{console.error('Preuzimanje nije zavrseno. Proverite kljuc, vezu i folder; postojeci PDF nije prepisan. Za detaljnu proveru koristite testove ili administratora.');process.exitCode=1;}
}
