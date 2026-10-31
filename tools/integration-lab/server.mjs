import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { IntegrationLab, LabError } from './flow.mjs';

export function createLabServer({filename=':memory:'}={}) {
  const lab=new IntegrationLab({filename}), token=randomBytes(32).toString('hex');
  const page=readFileSync(new URL('./index.html',import.meta.url),'utf8').replace('__LAB_TOKEN__',token);
  const js=readFileSync(new URL('./panel.js',import.meta.url));
  const css=readFileSync(new URL('./style.css',import.meta.url));
  const server=http.createServer(async(req,res)=>{
    const origin=`http://127.0.0.1:${server.address().port}`;
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Cache-Control','no-store');
    const send=(status,data,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type});res.end(type.startsWith('application/json')?JSON.stringify(data):data);};
    try {
      // DNS rebinding/CSRF: only exact loopback Host, same-origin API + random token.
      if (req.headers.host!==new URL(origin).host) throw new LabError('Dozvoljen je samo lokalni pristup.',403);
      if (req.headers.origin && req.headers.origin!==origin) throw new LabError('Poreklo zahteva nije dozvoljeno.',403);
      if (req.headers['sec-fetch-site']==='cross-site') throw new LabError('Poreklo zahteva nije dozvoljeno.',403);
      if (req.method==='GET' && req.url==='/') return send(200,page,'text/html; charset=utf-8');
      if (req.method==='GET' && req.url==='/panel.js') return send(200,js,'text/javascript; charset=utf-8');
      if (req.method==='GET' && req.url==='/style.css') return send(200,css,'text/css; charset=utf-8');
      if (req.headers['x-lab-token']!==token) throw new LabError('Nedostaje lokalni pristupni token.',403);
      if (req.method==='GET' && req.url==='/api/state') return send(200,lab.state());
      const pdf=req.url.match(/^\/api\/receipt\/(TEST-[A-Z0-9-]+)$/);
      if (req.method==='GET' && pdf) {
        const receipt=lab.receipt(pdf[1]); if(!receipt) throw new LabError('Nema TEST PDF-a.',404);
        res.setHeader('Content-Disposition',`attachment; filename="${pdf[1]}-SIMULATION.pdf"`);
        return send(200,Buffer.from(receipt.pdf),'application/pdf');
      }
      if (req.method==='POST' && req.url==='/api/action') {
        if(req.headers.origin!==origin) throw new LabError('Obavezno lokalno poreklo zahteva.',403);
        if(req.headers['content-type']!=='application/json') throw new LabError('Potreban je JSON.',415);
        let body=''; for await (const chunk of req) { body+=chunk.toString(); if(Buffer.byteLength(body)>2048) throw new LabError('Zahtev je prevelik.',413); }
        let payload; try { payload=JSON.parse(body); } catch {throw new LabError('Neispravan JSON.',400);}
        if(!payload || Array.isArray(payload) || typeof payload!=='object' || Object.keys(payload).some(k=>!['id','action','scenario'].includes(k))) throw new LabError('Prihvataju se samo TEST ID, radnja i scenario.',400);
        return send(200,lab.action(payload.id,payload.action,payload.scenario));
      }
      throw new LabError('Putanja ne postoji.',404);
    } catch(error) { send(error instanceof LabError?error.status:500,{error:error instanceof LabError?error.message:'Lokalna greška; proverite konzolu.'}); if(!(error instanceof LabError)) console.error(error); }
  });
  server.on('close',()=>lab.close());
  return {server,lab};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if (args.some((arg,i)=>arg!=='--db' && args[i-1]!=='--db') || args.filter(arg=>arg==='--db').length>1 || (args.includes('--db') && !args[args.indexOf('--db')+1])) {
    throw new Error('Upotreba: node tools/integration-lab/server.mjs [--db putanja-nove-test-baze.sqlite]');
  }
  const filename=args.includes('--db')?args[args.indexOf('--db')+1]:':memory:';
  const {server}=createLabServer({filename});
  server.listen(4317,'127.0.0.1',()=>console.log('TEST SIMULACIJA: http://127.0.0.1:4317\nBez spoljnog slanja i stvarnih računa. Ctrl+C za kraj.\n'+(filename===':memory:'?'Podaci se brišu pri gašenju.':'Koristi se izabrana lokalna TEST baza.')));
}
