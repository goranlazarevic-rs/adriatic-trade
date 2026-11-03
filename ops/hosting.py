import argparse,hashlib,json,pathlib,time,urllib.parse,urllib.request
from cloudflare import Cloudflare

HOSTS=['adriatictrade.rs','www.adriatictrade.rs'];SERVICE='adriatic-trade-web'
GITHUB_IPS={f'185.199.{n}.153' for n in range(108,112)}|{f'2606:50c0:800{n}::153' for n in range(4)}
def current(cf):
    zones=cf.request('/zones?name=adriatictrade.rs')['result']
    if len(zones)!=1 or zones[0]['status']!='active':raise RuntimeError('Active Cloudflare zone required')
    zone=zones[0]['id'];records=cf.request('/zones/'+zone+'/dns_records?per_page=500')['result']
    if len(records)>=500:raise RuntimeError('DNS pagination requires review')
    web=[r for r in records if r['name'] in HOSTS and r['type'] in ['A','AAAA','CNAME']]
    protected=sorted((r['id'],r['type'],r['name'],r['content']) for r in records if r not in web)
    return zone,web,hashlib.sha256(json.dumps(protected).encode()).hexdigest()
def preview(cf):
    sub=cf.request('/accounts/'+cf.account+'/workers/subdomain')['result']['subdomain']
    return 'https://'+SERVICE+'.'+sub+'.workers.dev'
def cutover(cf,snapshot):
    zone,records,protected=current(cf)
    domains=cf.request('/accounts/'+cf.account+'/workers/domains')['result']
    if any(d['hostname'] in HOSTS and d['service']!=SERVICE for d in domains):raise RuntimeError('A hostname already belongs to a different Worker')
    for r in records:
        if r['content'] not in GITHUB_IPS and not (r['type']=='CNAME' and r['content'].rstrip('.') in ['goranlazarevic-rs.github.io','adriatictrade.rs']):raise RuntimeError('Unexpected web DNS origin; review required')
    data={'zone':zone,'web_records':records,'protected_dns_hash':protected,'attached':[]}
    path=pathlib.Path(snapshot);path.write_text(json.dumps(data));path.chmod(0o600)
    try:
        # Only the two website hostnames change. MX, TXT, nameservers, DNSSEC,
        # API subdomains, email and other Workers are deliberately untouched.
        for r in records:cf.request('/zones/'+zone+'/dns_records/'+r['id'],'DELETE')
        for host in HOSTS:
            domain=cf.request('/accounts/'+cf.account+'/workers/domains','PUT',{'hostname':host,'service':SERVICE,'zone_id':zone,'enabled':True})['result']
            data['attached'].append(domain['id']);path.write_text(json.dumps(data))
        _,_,after=current(cf)
        if protected!=after:raise RuntimeError('Unrelated DNS records changed; review required')
    except Exception:
        rollback(cf,snapshot);raise
    print(json.dumps({'hosting':'attached','hostnames':HOSTS,'protected_dns_unchanged':True}))
def rollback(cf,snapshot):
    data=json.loads(pathlib.Path(snapshot).read_text());zone=data['zone']
    for domain in data['attached']:cf.request('/accounts/'+cf.account+'/workers/domains/'+domain,'DELETE')
    existing=cf.request('/zones/'+zone+'/dns_records?per_page=500')['result']
    for old in data['web_records']:
        if not any(r['name']==old['name'] and r['type']==old['type'] and r['content']==old['content'] for r in existing):
            cf.request('/zones/'+zone+'/dns_records','POST',{k:old[k] for k in ['type','name','content','ttl','proxied'] if k in old})
    print('Previous website DNS restored; database and Minimax untouched')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['preview-url','cutover','rollback']);p.add_argument('--snapshot',default='web-dns-before.json');a=p.parse_args();cf=Cloudflare()
    if a.action=='preview-url':print(preview(cf))
    elif a.action=='cutover':cutover(cf,a.snapshot)
    else:rollback(cf,a.snapshot)
