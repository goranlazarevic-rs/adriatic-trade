import fs from 'node:fs';
import path from 'node:path';
const output=path.resolve('.web-dist');
fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output);
const files=fs.readdirSync('.').filter(p=>p.endsWith('.html')&&p!=='preview-index.html');
files.push('robots.txt','sitemap.xml');
for(const file of files)fs.copyFileSync(file,path.join(output,file));
for(const dir of ['assets','dokumenti','proizvodi'])fs.cpSync(dir,path.join(output,dir),{recursive:true,filter:p=>{if(fs.lstatSync(p).isSymbolicLink())throw Error('Symlink in public assets');if(/(?:^|\/)(?:\.env[^/]*|[^/]*\.(?:pem|p12|pfx|sql|sqlite|atbak))$/i.test(p))throw Error('Private file in public assets');return true;}});
const headers=`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
/admin.html
  Cache-Control: no-store
  X-Robots-Tag: noindex, nofollow, noarchive
`;
fs.writeFileSync(path.join(output,'_headers'),headers);
const revision=process.env.GITHUB_SHA||'local';
fs.writeFileSync(path.join(output,'hosting-status.json'),JSON.stringify({service:'adriatic-trade-web',revision,hosting:'cloudflare-workers-assets'}));
for(const excluded of ['ops','tests','worker','scripts','.github','.git','CNAME','LAUNCH-CHECKLIST.md'])if(fs.existsSync(path.join(output,excluded)))throw Error('Non-public file in asset output');
console.log('Public site assets prepared; source, SQL and backup keys excluded');
