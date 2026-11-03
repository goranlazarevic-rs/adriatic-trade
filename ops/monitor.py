import datetime,json,os,urllib.request,urllib.error
from cloudflare import Cloudflare

SITE='https://adriatictrade.rs';API='https://adriatic-trade-orders.lakifinance.workers.dev'
def fetch(url):
    req=urllib.request.Request(url,headers={'Origin':SITE,'Cache-Control':'no-cache','User-Agent':'AdriaticTradeMonitor/1.0'})
    try:
        with urllib.request.urlopen(req,timeout=20) as r:return r.status,r.read(1024*1024).decode('utf8')
    except urllib.error.HTTPError as e:return e.code,''
def check():
    errors=[]
    for path,marker in [('/','Adriatic'),('/admin.html','data-admin-login-form'),('/checkout.html','checkout')]:
        try:
            status,body=fetch(SITE+path)
            if status!=200 or marker.lower() not in body.lower():errors.append('Web page unavailable: '+path+' HTTP '+str(status))
        except Exception:errors.append('Web page timeout/network: '+path)
    try:
        status,body=fetch(API+'/');health=json.loads(body)
        if status!=200 or not all(health.get(k) is True for k in ['ok','database','receipts','inquiries','security','firstSaleFiscal']):errors.append('Worker health failed')
    except Exception:errors.append('Worker unavailable or invalid health response')
    try:
        status,body=fetch(API+'/security/config')
        if status!=200 or not json.loads(body).get('turnstileSiteKey'):errors.append('Checkout security configuration unavailable')
        status,_=fetch(API+'/order')
        if status!=405:errors.append('Order route unavailable')
    except Exception:errors.append('Checkout route/security probe failed')
    try:
        cf=Cloudflare();rows=cf.query(cf.database(),"SELECT i.mode,c.revision FROM checkout_intake i JOIN checkout_control c ON c.id=i.id WHERE i.id=1")
        if len(rows)!=1 or rows[0].get('mode') not in ['paused','open'] or not isinstance(rows[0].get('revision'),int):errors.append('Order intake database/control is not ready')
        mode=rows[0].get('mode') if rows else 'unknown'
        # A deliberate business pause is healthy, not an outage. No test orders,
        # quota writes, emails, Minimax or courier requests are sent by monitoring.
    except Exception:mode='unknown';errors.append('Order intake database read failed')
    try:
        status,_=fetch(API+'/admin/orders')
        if status!=401:errors.append('Admin authorization probe unexpected HTTP '+str(status))
    except Exception:errors.append('Admin authorization probe unavailable')
    try:
        newest=None
        for page in range(1,11):
            req=urllib.request.Request('https://api.github.com/repos/goranlazarevic-rs/adriatic-trade/actions/artifacts?per_page=100&page='+str(page),headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json'})
            with urllib.request.urlopen(req,timeout=20) as r:items=json.load(r)['artifacts']
            valid=[a for a in items if a['name'].startswith('encrypted-backup-') and not a['expired']]
            if valid:newest=max(datetime.datetime.fromisoformat(a['created_at'].replace('Z','+00:00')) for a in valid);break
            if len(items)<100:break
        if newest is None or (datetime.datetime.now(datetime.timezone.utc)-newest).total_seconds()>36*3600:errors.append('No encrypted backup newer than 36 hours')
    except Exception:errors.append('Backup freshness check unavailable')
    return {'ok':not errors,'intake_mode':mode,'errors':errors}
if __name__=='__main__':
    result=check();print(json.dumps(result));raise SystemExit(0 if result['ok'] else 1)
