import json
from cloudflare import Cloudflare
cf=Cloudflare();out={}
for key,path in [('r2','/accounts/'+cf.account+'/r2/buckets/adriatic-trade-receipts/objects?per_page=1'),('zone','/zones?name=adriatictrade.rs'),('subdomain','/accounts/'+cf.account+'/workers/subdomain')]:
    try:
        data=cf.request(path)
        if key=='zone':out[key]=[{'id':r['id'],'name':r['name'],'status':r['status']} for r in data['result']]
        elif key=='subdomain':out[key]=data['result']
        else:out[key]='read available'
    except Exception as e:out[key]=str(e)
try:out['d1']='read available' if cf.query(cf.database(),'SELECT count(*) count FROM orders') else 'unexpected'
except Exception as e:out['d1']=str(e)
print(json.dumps(out))
