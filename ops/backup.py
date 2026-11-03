import argparse,datetime,hashlib,json,os,pathlib,sqlite3,tarfile,tempfile,time,urllib.parse,urllib.request
from cloudflare import Cloudflare

MAX_BYTES=1024*1024*1024
def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def verify(directory):
    root=pathlib.Path(directory);manifest=json.loads((root/'manifest.json').read_text())
    if manifest.get('version')!=1:raise RuntimeError('Unsupported backup version')
    listed={item['path'] for item in manifest['files']}
    if 'database.sql' not in listed or any(o['path'] not in listed for o in manifest['objects']):raise RuntimeError('Incomplete backup manifest')
    for item in manifest['files']:
        path=root/item['path']
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()) or digest(path)!=item['sha256']:raise RuntimeError('Backup file integrity failure')
    db=sqlite3.connect(':memory:')
    db.executescript((root/'database.sql').read_text())
    if db.execute('PRAGMA integrity_check').fetchone()!=('ok',):raise RuntimeError('SQLite integrity failure')
    if db.execute('PRAGMA foreign_key_check').fetchall():raise RuntimeError('SQLite foreign key failure')
    counts={name:db.execute('SELECT count(*) FROM "'+name.replace('"','""')+'"').fetchone()[0] for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    if counts!=manifest['table_counts']:raise RuntimeError('Restored table count mismatch')
    keys={x['key'] for x in manifest['objects']}
    for table,column in [('orders','receipt_key'),('fiscal_documents','pdf_key')]:
        if table in counts:
            for (key,) in db.execute('SELECT "'+column+'" FROM "'+table+'" WHERE "'+column+'" IS NOT NULL AND "'+column+'" != \'\''):
                if key not in keys:raise RuntimeError('Referenced PDF is missing from backup')
    return {'tables':len(counts),'orders':counts.get('orders',0),'objects':len(keys),'integrity':'ok'}
def collect(destination):
    cf=Cloudflare();database=cf.database();base='/accounts/'+cf.account
    root=pathlib.Path(destination);root.mkdir(mode=0o700,parents=True,exist_ok=False)
    export_path=base+'/d1/database/'+database+'/export';payload={'output_format':'polling'}
    for _ in range(120):
        task=cf.request(export_path,'POST',payload)['result']
        if task.get('status')=='error':raise RuntimeError('D1 export failed')
        if task.get('status')=='complete':break
        bookmark=task.get('at_bookmark')
        if not bookmark:raise RuntimeError('D1 export returned no polling bookmark')
        payload={'output_format':'polling','current_bookmark':bookmark};time.sleep(1)
    else:raise RuntimeError('D1 export timeout')
    url=task.get('result',{}).get('signed_url','')
    if urllib.parse.urlparse(url).scheme!='https':raise RuntimeError('Unsafe D1 export download')
    with urllib.request.urlopen(url,timeout=120) as r:
        sql=r.read(128*1024*1024+1)
    if len(sql)>128*1024*1024:raise RuntimeError('D1 export exceeds configured limit')
    (root/'database.sql').write_bytes(sql)
    db=sqlite3.connect(':memory:');db.executescript(sql.decode())
    counts={name:db.execute('SELECT count(*) FROM "'+name.replace('"','""')+'"').fetchone()[0] for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    objects=[];files=[{'path':'database.sql','sha256':digest(root/'database.sql')}];seen=set();cursor=None;total=len(sql)
    object_base=base+'/r2/buckets/adriatic-trade-receipts/objects'
    (root/'objects').mkdir()
    def inventory():
        rows=[];cursor=None;cursors=set()
        for _ in range(1000):
            params={'per_page':1000}
            if cursor:params['cursor']=cursor
            page=cf.request(object_base+'?'+urllib.parse.urlencode(params))
            rows.extend(page['result']);meta=page.get('result_info',{})
            if not meta.get('is_truncated'):return rows
            cursor=meta.get('cursor')
            if not cursor or cursor in cursors:raise RuntimeError('R2 pagination incomplete')
            cursors.add(cursor)
        raise RuntimeError('R2 pagination limit')
    initial=inventory()
    for obj in initial:
        key=obj['key']
        if key in seen:raise RuntimeError('Repeated R2 pagination key')
        seen.add(key);size=obj['size'];total+=size
        if size>128*1024*1024 or total>MAX_BYTES:raise RuntimeError('Backup exceeds configured safety limit')
        body=cf.request(object_base+'/'+urllib.parse.quote(key,safe=''),raw=True)
        if len(body)!=size:raise RuntimeError('R2 object changed or incomplete download')
        path='objects/'+hashlib.sha256(key.encode()).hexdigest();(root/path).write_bytes(body)
        info={'key':key,'path':path,'size':size,'sha256':digest(root/path),'http_metadata':obj.get('http_metadata',{}),'custom_metadata':obj.get('custom_metadata',{})}
        objects.append(info);files.append({'path':path,'sha256':info['sha256']})
    signature=lambda rows:sorted((o['key'],o['size'],o.get('etag'),o.get('last_modified')) for o in rows)
    if signature(initial)!=signature(inventory()):raise RuntimeError('R2 inventory changed during backup; retry required')
    manifest={'version':1,'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'database_id':database,'bookmark':task.get('at_bookmark'),'table_counts':counts,'objects':objects,'files':files}
    (root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False))
    report=verify(root)
    archive=root.parent/'backup.tar.gz'
    with tarfile.open(archive,'w:gz') as tar:
        for path in sorted(root.rglob('*')):
            if path.is_file():tar.add(path,arcname=str(path.relative_to(root)),recursive=False)
    return archive,report
def restore(archive,destination):
    root=pathlib.Path(destination)
    if root.exists():raise RuntimeError('Restore target must be new and isolated')
    root.mkdir(mode=0o700,parents=True)
    with tarfile.open(archive,'r:gz') as tar:
        members=tar.getmembers()
        if len(members)>100000 or sum(m.size for m in members)>MAX_BYTES:raise RuntimeError('Archive exceeds restore limit')
        for m in members:
            if not m.isfile() or not (root/m.name).resolve().is_relative_to(root.resolve()):raise RuntimeError('Unsafe archive member')
        tar.extractall(root,members=members,filter='data')
    result=verify(root)
    # Keep an actual restored SQLite database for offline inspection; no production writes.
    db=sqlite3.connect(root/'restored.sqlite');db.executescript((root/'database.sql').read_text());db.close()
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['collect','restore']);p.add_argument('path');p.add_argument('destination',nargs='?');args=p.parse_args()
    if args.mode=='collect':
        archive,report=collect(args.path);print(json.dumps({'archive':str(archive),**report}))
    else:print(json.dumps(restore(args.path,args.destination)))
