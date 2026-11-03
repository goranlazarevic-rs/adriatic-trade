import argparse,hashlib,http.client,json,pathlib,re,socket,ssl,time,urllib.parse,urllib.request
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
    owned={d['hostname'] for d in domains if d['hostname'] in HOSTS and d['service']==SERVICE}
    for r in records:
        # Cloudflare owns DNS for an existing Custom Domain. Never delete it
        # while resuming a partially completed migration of the same Worker.
        if r['name'] in owned:continue
        if r['content'] not in GITHUB_IPS and not (r['type']=='CNAME' and r['content'].rstrip('.') in ['goranlazarevic-rs.github.io','adriatictrade.rs']):raise RuntimeError('Unexpected web DNS origin; review required')
    records=[r for r in records if r['name'] not in owned]
    data={'zone':zone,'web_records':records,'protected_dns_hash':protected,'attached':[],'previous_worker_hostnames':sorted(owned)}
    path=pathlib.Path(snapshot);path.write_text(json.dumps(data));path.chmod(0o600)
    try:
        # Only the two website hostnames change. MX, TXT, nameservers, DNSSEC,
        # API subdomains, email and other Workers are deliberately untouched.
        for r in records:cf.request('/zones/'+zone+'/dns_records/'+r['id'],'DELETE')
        for host in HOSTS:
            if host in owned:continue
            domain=cf.request('/accounts/'+cf.account+'/workers/domains','PUT',{'hostname':host,'service':SERVICE,'zone_id':zone,'enabled':True})['result']
            data['attached'].append(domain['id']);path.write_text(json.dumps(data))
        _,_,after=current(cf)
        if protected!=after:raise RuntimeError('Unrelated DNS records changed; review required')
    except Exception:
        rollback(cf,snapshot);raise
    print(json.dumps({'hosting':'attached','hostnames':HOSTS,'protected_dns_unchanged':True}))

def status_matches(value,revision):
    return isinstance(value,dict) and value.get('service')==SERVICE and value.get('revision')==revision and value.get('hosting')=='cloudflare-workers-assets'

def edge_status(host,address):
    # Connect to an address resolved for the deployed workers.dev preview while
    # retaining the real domain's Host header, TLS SNI and certificate validation.
    # A runner can retain the pre-cutover DNS answer for several minutes.
    connection=http.client.HTTPSConnection(host,timeout=10,context=ssl.create_default_context())
    connection._create_connection=lambda target,timeout,source_address=None:socket.create_connection((address,443),timeout,source_address)
    try:
        connection.request('GET','/hosting-status.json',headers={'User-Agent':'AdriaticTradeHostingCheck/1.0'})
        response=connection.getresponse()
        if response.status!=200:return None
        return json.loads(response.read(16384))
    finally:connection.close()

def verify(cf,revision):
    if not re.fullmatch('[0-9a-f]{40}',revision or ''):raise RuntimeError('Exact approved revision required')
    zone,_,_=current(cf)
    domains=cf.request('/accounts/'+cf.account+'/workers/domains')['result']
    for host in HOSTS:
        matches=[d for d in domains if d['hostname']==host]
        if len(matches)!=1 or matches[0]['service']!=SERVICE or matches[0]['zone_id']!=zone:raise RuntimeError('Expected Worker domain binding missing')
    preview_host=urllib.parse.urlsplit(preview(cf)).hostname
    addresses=sorted({r[4][0] for r in socket.getaddrinfo(preview_host,443,family=socket.AF_INET,type=socket.SOCK_STREAM)})
    if not addresses:raise RuntimeError('Cloudflare edge DNS unavailable')
    remaining=set(HOSTS)
    for attempt in range(24):
        for host in tuple(remaining):
            for address in addresses:
                try:
                    if status_matches(edge_status(host,address),revision):
                        remaining.remove(host);print(json.dumps({'hostname':host,'https_certificate':'verified','revision':revision,'route':'cloudflare-edge'}));break
                except (OSError,ValueError,http.client.HTTPException):pass
        if not remaining:return
        if attempt<23:time.sleep(5)
    raise RuntimeError('Custom domain HTTPS revision verification failed')
def rollback(cf,snapshot):
    data=json.loads(pathlib.Path(snapshot).read_text());zone=data['zone']
    for domain in data['attached']:cf.request('/accounts/'+cf.account+'/workers/domains/'+domain,'DELETE')
    existing=cf.request('/zones/'+zone+'/dns_records?per_page=500')['result']
    for old in data['web_records']:
        if not any(r['name']==old['name'] and r['type']==old['type'] and r['content']==old['content'] for r in existing):
            cf.request('/zones/'+zone+'/dns_records','POST',{k:old[k] for k in ['type','name','content','ttl','proxied'] if k in old})
    print('Previous website DNS restored; database and Minimax untouched')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['preview-url','cutover','rollback','verify']);p.add_argument('--snapshot',default='web-dns-before.json');p.add_argument('--revision');a=p.parse_args();cf=Cloudflare()
    if a.action=='preview-url':print(preview(cf))
    elif a.action=='cutover':cutover(cf,a.snapshot)
    elif a.action=='verify':verify(cf,a.revision)
    else:rollback(cf,a.snapshot)
