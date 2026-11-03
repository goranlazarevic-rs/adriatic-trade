import json,os,urllib.request,urllib.error

class Cloudflare:
    def __init__(self):
        self.account=os.environ['CLOUDFLARE_ACCOUNT_ID']
        self.token=os.environ['CLOUDFLARE_API_TOKEN']
        if not self.account or not self.token: raise RuntimeError('Cloudflare configuration missing')
    def request(self,path,method='GET',data=None,raw=False):
        req=urllib.request.Request('https://api.cloudflare.com/client/v4'+path,method=method,
            data=None if data is None else json.dumps(data).encode(),
            headers={'Authorization':'Bearer '+self.token,'Content-Type':'application/json','User-Agent':'AdriaticTradeOperations/1.0'})
        try:
            with urllib.request.urlopen(req,timeout=60) as r:
                body=r.read(128*1024*1024+1)
        except urllib.error.HTTPError as e:
            # Do not print response bodies, signed URLs, tokens or record contents.
            raise RuntimeError('Cloudflare API HTTP '+str(e.code)+' for '+('R2 object' if '/objects/' in path else path.split('?')[0])) from None
        if len(body)>128*1024*1024:raise RuntimeError('Cloudflare response exceeds backup limit')
        if raw:return body
        value=json.loads(body)
        if value.get('success') is not True:raise RuntimeError('Cloudflare API unsuccessful for '+('R2 object' if '/objects/' in path else path.split('?')[0]))
        return value
    def database(self):
        rows=self.request('/accounts/'+self.account+'/d1/database')['result']
        found=[r for r in rows if r.get('name')=='adriatic-trade-orders-db']
        if len(found)!=1:raise RuntimeError('Expected exactly one production database')
        return found[0].get('uuid') or found[0]['id']
    def query(self,database,sql):
        data=self.request('/accounts/'+self.account+'/d1/database/'+database+'/query','POST',{'sql':sql})['result']
        if len(data)!=1 or not data[0].get('success'):raise RuntimeError('D1 read check failed')
        return data[0]['results']
