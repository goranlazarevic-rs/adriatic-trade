import fs from 'node:fs';
import crypto from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';

const MAGIC=Buffer.from('ATBACKUP1\n');
const fingerprint=key=>crypto.createHash('sha256').update(crypto.createPublicKey(key).export({type:'spki',format:'der'})).digest('hex');
export async function seal(input,output,publicKey) {
  if(fs.existsSync(output))throw Error('Output already exists');
  const key=crypto.randomBytes(32),iv=crypto.randomBytes(12);
  const header=Buffer.from(JSON.stringify({v:1,cipher:'aes-256-gcm',wrapping:'rsa-oaep-sha256',fingerprint:fingerprint(publicKey),iv:iv.toString('base64'),key:crypto.publicEncrypt({key:publicKey,oaepHash:'sha256'},key).toString('base64')}));
  const length=Buffer.alloc(4);length.writeUInt32BE(header.length);
  const tmp=output+'.partial';
  try {
    fs.writeFileSync(tmp,Buffer.concat([MAGIC,length,header]),{mode:0o600,flag:'wx'});
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(header);
    await pipeline(fs.createReadStream(input),cipher,fs.createWriteStream(tmp,{flags:'a',mode:0o600}));
    fs.appendFileSync(tmp,cipher.getAuthTag());fs.renameSync(tmp,output);
  } catch(e){fs.rmSync(tmp,{force:true});throw e;} finally {key.fill(0);}
}
export async function unseal(input,output,privateKey) {
  if(fs.existsSync(output))throw Error('Output already exists');
  const fd=fs.openSync(input,'r'),prefix=Buffer.alloc(MAGIC.length+4);
  let raw,header,start,size;
  try {
    if(fs.readSync(fd,prefix)!==prefix.length||!prefix.subarray(0,MAGIC.length).equals(MAGIC))throw Error('Invalid backup');
    const n=prefix.readUInt32BE(MAGIC.length);if(n<32||n>16384)throw Error('Invalid header length');
    raw=Buffer.alloc(n);if(fs.readSync(fd,raw)!==n)throw Error('Truncated header');
    header=JSON.parse(raw);start=prefix.length+n;size=fs.fstatSync(fd).size;
    if(header.v!==1||header.cipher!=='aes-256-gcm'||header.wrapping!=='rsa-oaep-sha256'||header.fingerprint!==fingerprint(privateKey)||size<start+16)throw Error('Wrong key or backup format');
  } finally {fs.closeSync(fd);}
  const key=crypto.privateDecrypt({key:privateKey,oaepHash:'sha256'},Buffer.from(header.key,'base64'));
  const iv=Buffer.from(header.iv,'base64');if(key.length!==32||iv.length!==12)throw Error('Invalid key parameters');
  const tag=Buffer.alloc(16),tagFd=fs.openSync(input,'r');try{fs.readSync(tagFd,tag,0,16,size-16);}finally{fs.closeSync(tagFd);}
  const tmp=output+'.partial';
  try {
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(raw);decipher.setAuthTag(tag);
    await pipeline(size===start+16 ? (await import('node:stream')).Readable.from([]) : fs.createReadStream(input,{start,end:size-17}),decipher,fs.createWriteStream(tmp,{flags:'wx',mode:0o600}));
    fs.renameSync(tmp,output);
  } catch(e){fs.rmSync(tmp,{force:true});throw e;} finally {key.fill(0);}
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
  const [mode,input,output,keyPath]=process.argv.slice(2);
  if(!['seal','unseal'].includes(mode)||!input||!output||!keyPath)throw Error('Usage: seal.mjs seal|unseal INPUT OUTPUT KEY_FILE');
  await (mode==='seal'?seal:unseal)(input,output,fs.readFileSync(keyPath));
  console.log(mode==='seal'?'Encrypted backup created':'Authenticated backup decrypted');
}
