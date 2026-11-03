import datetime,hashlib,io,json,pathlib,sqlite3,sys,tarfile,tempfile,unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'ops'))
import backup,monitor,hosting

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

if __name__=='__main__':unittest.main()
