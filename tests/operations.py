import datetime,hashlib,io,json,pathlib,sqlite3,sys,tarfile,tempfile,unittest
from unittest.mock import patch,MagicMock
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'ops'))
import backup,monitor,hosting,cloudflare

class Recovery(unittest.TestCase):
    def fixture(self,root):
        root.mkdir();(root/'objects').mkdir()
        (root/'database.sql').write_text("CREATE TABLE orders(id TEXT PRIMARY KEY,receipt_key TEXT);INSERT INTO orders VALUES('private-order','pdf/a');CREATE TABLE fiscal_documents(pdf_key TEXT);INSERT INTO fiscal_documents VALUES('pdf/a');")
        (root/'objects/pdf').write_bytes(b'%PDF-1.7 synthetic test')
        files=[{'path':p,'sha256':backup.digest(root/p)} for p in ['database.sql','objects/pdf']]
        m={'version':1,'files':files,'objects':[{'key':'pdf/a','path':'objects/pdf'}],'table_counts':{'orders':1,'fiscal_documents':1}}
        (root/'manifest.json').write_text(json.dumps(m));return m
    def test_real_restore_and_pdf_integrity(self):
        with tempfile.TemporaryDirectory() as d:
            d=pathlib.Path(d);self.fixture(d/'source')
            with tarfile.open(d/'a.tar.gz','w:gz') as t:
                for p in (d/'source').rglob('*'):
                    if p.is_file():t.add(p,arcname=str(p.relative_to(d/'source')))
            self.assertEqual(backup.restore(d/'a.tar.gz',d/'isolated'),{'tables':2,'orders':1,'objects':1,'integrity':'ok'})
            db=sqlite3.connect(d/'isolated/restored.sqlite');self.assertEqual(db.execute('SELECT receipt_key FROM orders').fetchone()[0],'pdf/a');db.close()
            self.assertEqual((d/'isolated/objects/pdf').read_bytes(),b'%PDF-1.7 synthetic test')
            with self.assertRaisesRegex(RuntimeError,'isolated'):backup.restore(d/'a.tar.gz',d/'isolated')
    def test_tampered_file_and_missing_reference_fail(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d)/'a';m=self.fixture(root)
            (root/'objects/pdf').write_bytes(b'changed')
            with self.assertRaisesRegex(RuntimeError,'integrity'):backup.verify(root)
            m['files'][1]['sha256']=backup.digest(root/'objects/pdf');m['objects']=[];(root/'manifest.json').write_text(json.dumps(m))
            with self.assertRaisesRegex(RuntimeError,'missing'):backup.verify(root)
    def test_archive_traversal_and_symlink_rejected(self):
        for name,kind in [('../outside',tarfile.REGTYPE),('link',tarfile.SYMTYPE)]:
            with tempfile.TemporaryDirectory() as d:
                d=pathlib.Path(d)
                with tarfile.open(d/'a.tar.gz','w:gz') as t:
                    item=tarfile.TarInfo(name);item.type=kind;item.size=1 if kind==tarfile.REGTYPE else 0;item.linkname='/etc/passwd';t.addfile(item,io.BytesIO(b'x') if item.size else None)
                with self.assertRaisesRegex(RuntimeError,'Unsafe'):backup.restore(d/'a.tar.gz',d/'new')
                self.assertFalse((d/'outside').exists())

class MockCloudflare:
    def database(self):return 'isolated-test'
    def query(self,db,sql):
        assert sql.startswith('SELECT ') # Monitoring may never mutate the database.
        return [{'mode':'paused','revision':4}]
class FreshArtifact:
    def __enter__(self):return io.StringIO(json.dumps({'artifacts':[{'name':'encrypted-backup-test','expired':False,'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}]}))
    def __exit__(self,*args):pass
def healthy(url):
    if url==monitor.API+'/':return 200,json.dumps({k:True for k in ['ok','database','receipts','inquiries','security','firstSaleFiscal']})
    if url.endswith('/admin/orders'):return 401,''
    if url.endswith('/security/config'):return 200,json.dumps({'turnstileSiteKey':'public-key'})
    if url.endswith('/order'):return 405,''
    if url.endswith('/admin.html'):return 200,'data-admin-login-form'
    if url.endswith('/checkout.html'):return 200,'checkout'
    return 200,'Adriatic'
class Monitoring(unittest.TestCase):
    @patch.dict('os.environ',{'GITHUB_TOKEN':'synthetic'})
    @patch.object(monitor.urllib.request,'urlopen',return_value=FreshArtifact())
    @patch.object(monitor,'Cloudflare',MockCloudflare)
    @patch.object(monitor,'fetch',side_effect=healthy)
    def test_deliberate_pause_is_healthy(self,*args):
        self.assertEqual(monitor.check(),{'ok':True,'intake_mode':'paused','errors':[]})
    @patch.dict('os.environ',{'GITHUB_TOKEN':'synthetic'})
    @patch.object(monitor.urllib.request,'urlopen',return_value=FreshArtifact())
    @patch.object(monitor,'Cloudflare',MockCloudflare)
    def test_frontend_failure_alerts(self,*args):
        with patch.object(monitor,'fetch',side_effect=lambda url:(503,'') if url==monitor.SITE+'/' else healthy(url)):
            self.assertFalse(monitor.check()['ok'])
    @patch.dict('os.environ',{'GITHUB_TOKEN':'synthetic'})
    @patch.object(monitor.urllib.request,'urlopen',side_effect=TimeoutError)
    @patch.object(monitor,'Cloudflare',MockCloudflare)
    @patch.object(monitor,'fetch',side_effect=healthy)
    def test_backup_unverifiable_alerts(self,*args):
        self.assertIn('Backup freshness check unavailable',monitor.check()['errors'])

class HostingCloudflare:
    account='isolated-account'
    def __init__(self):
        self.records=[{'id':'mail','type':'MX','name':'adriatictrade.rs','content':'mail.example.test'},
                      {'id':'worker-www','type':'AAAA','name':'www.adriatictrade.rs','content':'100::','proxied':True}]
        self.domains=[{'id':'www','hostname':'www.adriatictrade.rs','service':hosting.SERVICE,'zone_id':'zone'}]
        self.writes=[]
    def request(self,path,method='GET',data=None):
        if method!='GET':self.writes.append((path,method,data))
        if path.startswith('/zones?'):return {'result':[{'id':'zone','status':'active'}]}
        if '/dns_records' in path and method=='GET':return {'result':self.records.copy()}
        if path.endswith('/workers/subdomain'):return {'result':{'subdomain':'isolated'}}
        if path.endswith('/workers/domains') and method=='GET':return {'result':self.domains.copy()}
        if path.endswith('/workers/domains') and method=='PUT':
            domain={'id':'new-apex',**data};self.domains.append(domain)
            self.records.append({'id':'worker-apex','type':'AAAA','name':data['hostname'],'content':'100::','proxied':True})
            return {'result':domain}
        if method=='DELETE' and path.endswith('/new-apex'):
            self.domains=[d for d in self.domains if d['id']!='new-apex']
            self.records=[r for r in self.records if r['id']!='worker-apex']
            return {'success':True,'result':None}
        raise AssertionError((path,method))

class HostingRecovery(unittest.TestCase):
    def test_resume_partial_cutover_and_rollback_preserves_existing_worker(self):
        cf=HostingCloudflare()
        with tempfile.TemporaryDirectory() as directory:
            snapshot=pathlib.Path(directory)/'dns.json'
            hosting.cutover(cf,snapshot)
            self.assertEqual({d['hostname'] for d in cf.domains},set(hosting.HOSTS))
            self.assertEqual(len(cf.writes),1)
            self.assertEqual(json.loads(snapshot.read_text())['previous_worker_hostnames'],['www.adriatictrade.rs'])
            hosting.rollback(cf,snapshot)
            self.assertEqual([d['id'] for d in cf.domains],['www'])
            self.assertEqual(cf.records[0]['id'],'mail')
            self.assertEqual(cf.records[1]['id'],'worker-www')
    def test_different_worker_is_rejected_before_mutation(self):
        cf=HostingCloudflare();cf.domains[0]['service']='different-worker'
        with self.assertRaisesRegex(RuntimeError,'different Worker'):hosting.cutover(cf,'unused.json')
        self.assertEqual(cf.writes,[])
    def test_empty_204_delete_is_success_but_empty_200_is_not(self):
        response=MagicMock();response.__enter__.return_value=response;response.status=204;response.read.return_value=b''
        cf=cloudflare.Cloudflare.__new__(cloudflare.Cloudflare);cf.token='synthetic'
        with patch.object(cloudflare.urllib.request,'urlopen',return_value=response):
            self.assertTrue(cf.request('/accounts/test/workers/domains/test','DELETE')['success'])
            response.status=200
            with self.assertRaises(ValueError):cf.request('/zones/test','GET')
    @patch.object(hosting.socket,'getaddrinfo',return_value=[(2,1,6,'',('192.0.2.1',443))])
    def test_edge_verification_handles_stale_public_dns_and_rejects_wrong_revision(self,*args):
        cf=HostingCloudflare();cf.request('/accounts/isolated-account/workers/domains','PUT',{'hostname':hosting.HOSTS[0],'service':hosting.SERVICE,'zone_id':'zone'})
        revision='a'*40
        with patch.object(hosting,'edge_status',return_value={'service':hosting.SERVICE,'revision':revision,'hosting':'cloudflare-workers-assets'}) as fetch:
            hosting.verify(cf,revision)
            self.assertEqual({call.args[0] for call in fetch.call_args_list},set(hosting.HOSTS))
        with patch.object(hosting,'edge_status',return_value={'service':hosting.SERVICE,'revision':'b'*40,'hosting':'cloudflare-workers-assets'}),patch.object(hosting.time,'sleep'):
            with self.assertRaisesRegex(RuntimeError,'verification failed'):hosting.verify(cf,revision)
        with patch.object(hosting,'edge_status',side_effect=hosting.ssl.SSLCertVerificationError('invalid certificate')),patch.object(hosting.time,'sleep'):
            with self.assertRaisesRegex(RuntimeError,'verification failed'):hosting.verify(cf,revision)
    def test_edge_connection_keeps_real_host_and_certificate_validation(self):
        connection=MagicMock();response=connection.getresponse.return_value;response.status=200;response.read.return_value=b'{}'
        with patch.object(hosting.http.client,'HTTPSConnection',return_value=connection) as factory,patch.object(hosting.socket,'create_connection') as connect:
            hosting.edge_status(hosting.HOSTS[0],'192.0.2.1')
            self.assertEqual(factory.call_args.args[0],hosting.HOSTS[0])
            context=factory.call_args.kwargs['context'];self.assertTrue(context.check_hostname);self.assertEqual(context.verify_mode,hosting.ssl.CERT_REQUIRED)
            connection._create_connection(('ignored',443),10)
            connect.assert_called_once_with(('192.0.2.1',443),10,None)

if __name__=='__main__':unittest.main()
