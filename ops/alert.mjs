// Keep only issue IDs locally between steps. GitHub's list endpoint can lag
// behind a successful creation, so a repeated signal must also check the ID.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const repo=process.env.GITHUB_REPOSITORY;
if(repo!=='goranlazarevic-rs/adriatic-trade')throw Error('Unexpected alert destination');
const token=process.env.GITHUB_TOKEN,kind=process.env.ALERT_KIND,state=process.env.ALERT_STATE;
if(!['monitor','backup','hosting','test'].includes(kind)||!['failure','success'].includes(state))throw Error('Invalid alert input');
const runId=process.env.GITHUB_RUN_ID;
if(!/^\d+$/.test(runId||''))throw Error('Invalid workflow run ID');
const stateFile=process.env.ALERT_STATE_FILE||path.join(process.env.RUNNER_TEMP||os.tmpdir(),'adriatic-alert-'+runId+'-'+kind+'.json');
const request=async(endpoint,method='GET',body)=>{
  const r=await fetch('https://api.github.com/repos/'+repo+endpoint,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','Cache-Control':'no-cache'},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.ok)throw Error('GitHub alert operation failed: '+r.status);return r.status===204?null:r.json();
};
const title=kind==='test'?'[Operations TEST] Adriatic Trade: proba alarma':'[Operations] Adriatic Trade: '+kind+' failure';
const ours=i=>i?.title===title&&!i.pull_request&&i.user?.login==='github-actions[bot]';
const matches=new Map();
for(let page=1;page<=20;page++){
  const items=await request('/issues?state=open&per_page=100&page='+page);
  for(const i of items)if(ours(i)&&i.state==='open')matches.set(i.number,i);
  if(items.length<100)break;
  if(page===20)throw Error('Alert lookup pagination limit');
}
if(fs.existsSync(stateFile)){
  const saved=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  if(!Number.isSafeInteger(saved.number)||saved.number<1)throw Error('Invalid saved alert identity');
  const current=await request('/issues/'+saved.number);
  if(!ours(current))throw Error('Saved alert identity mismatch');
  if(current.state==='open')matches.set(current.number,current);
}
const run='https://github.com/'+repo+'/actions/runs/'+runId;
if(state==='failure'){
  let issue=matches.values().next().value;
  if(!issue){
    issue=await request('/issues','POST',{title,assignees:['goranlazarevic-rs'],body:(kind==='test'?'PROBA ALARMA — kontrolisano testiranje obaveštenja i zatvaranja; ovo nije prijava stvarnog kvara.':'Automatska provera nije uspela.')+'\n\nVrsta: '+kind+'\nIzvršavanje: '+run+'\n\nMonitoring ne pravi porudžbine; namerna pauza prodaje nije kvar. Backup se smatra uspešnim tek nakon šifrovanja i uspešnog čuvanja artefakta. Ne objavljivati lične podatke ili tajne u ovom issue-u.'});
    if(!ours(issue)||!Number.isSafeInteger(issue.number))throw Error('Created alert identity not confirmed');
    console.log('Alert opened and assigned to repository owner');
  }else console.log('Existing alert retained; no duplicate');
  fs.writeFileSync(stateFile,JSON.stringify({number:issue.number}),{mode:0o600});
}else{
  for(const issue of matches.values()){
    await request('/issues/'+issue.number+'/comments','POST',{body:'Provera je ponovo uspešna: '+run});
    const closed=await request('/issues/'+issue.number,'PATCH',{state:'closed',state_reason:'completed'});
    if(closed.state!=='closed')throw Error('Alert closure not confirmed');
  }
  fs.rmSync(stateFile,{force:true});
  console.log(matches.size?'Recovery recorded; matching alerts closed':'No unnecessary recovery message');
}
