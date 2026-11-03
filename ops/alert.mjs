// GitHub is outside Cloudflare; alerts survive a Cloudflare outage. No customer
// data, response bodies, signed URLs or credentials are included in issues.
const repo=process.env.GITHUB_REPOSITORY;
if(repo!=='goranlazarevic-rs/adriatic-trade')throw Error('Unexpected alert destination');
const token=process.env.GITHUB_TOKEN,kind=process.env.ALERT_KIND,state=process.env.ALERT_STATE;
if(!['monitor','backup','hosting'].includes(kind)||!['failure','success'].includes(state))throw Error('Invalid alert input');
const request=async(path,method='GET',body)=>{
  const r=await fetch('https://api.github.com/repos/'+repo+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.ok)throw Error('GitHub alert operation failed: '+r.status);return r.status===204?null:r.json();
};
const title='[Operations] Adriatic Trade: '+kind+' failure';
const items=await request('/issues?state=open&creator=github-actions%5Bbot%5D&per_page=100');
const issue=items.find(i=>i.title===title&&!i.pull_request);
const run='https://github.com/'+repo+'/actions/runs/'+process.env.GITHUB_RUN_ID;
if(state==='failure'&&!issue){
 await request('/issues','POST',{title,assignees:['goranlazarevic-rs'],body:'Automatska provera nije uspela.\n\nVrsta: '+kind+'\nIzvršavanje: '+run+'\n\nProveriti korak koji nije prošao. Monitoring ne pravi porudžbine; namerna pauza prodaje nije kvar. Backup se smatra uspešnim tek nakon šifrovanja i uspešnog čuvanja artefakta. Ne objavljivati lične podatke ili tajne u ovom issue-u.'});
 console.log('Alert opened and assigned to repository owner');
}else if(state==='success'&&issue){
 await request('/issues/'+issue.number+'/comments','POST',{body:'Provera je ponovo uspešna: '+run});
 await request('/issues/'+issue.number,'PATCH',{state:'closed',state_reason:'completed'});console.log('Recovery recorded; alert closed');
}else console.log('No duplicate alert or unnecessary recovery message');
