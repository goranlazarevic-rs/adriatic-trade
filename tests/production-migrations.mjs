import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
// Exercise the approved SQL against real SQLite, including existing orders,
// quotas and admissions. No Cloudflare access or production data is used.
const result=spawnSync('python3',['-c',String.raw`
import sqlite3,pathlib,json
db=sqlite3.connect(':memory:')
def sql(path): db.executescript(pathlib.Path(path).read_text())
def migrate():
 sql('cloudflare-d1-checkout-availability-v1.sql')
 sql('cloudflare-d1-admin-availability-v1.sql')
 db.execute("UPDATE checkout_intake SET mode='paused',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),reason='Owner-approved production release 4.12.0; awaiting goods clearance and courier; do not open intake' WHERE id=1 AND mode!='paused'")
def rows(table): return db.execute('SELECT * FROM '+table+' ORDER BY 1').fetchall()
sql('cloudflare-d1-schema-v1.sql')
db.execute("INSERT INTO orders(id,submission_id,created_at,updated_at,customer_first_name,customer_last_name,customer_email,customer_phone,delivery_method,postal_code,city,items_json,goods_total,shipping,total) VALUES('synthetic','synthetic','2026-11-03','2026-11-03','Test','Test','test@example.invalid','060000000','Test','21000','Test','[]',0,0,0)")
db.execute("INSERT INTO order_events(order_id,event_type,note,created_at) VALUES('synthetic','created','synthetic','2026-11-03')")
baseline={t:rows(t) for t in ['orders','order_events','notification_outbox']}
migrate()
assert db.execute('SELECT mode FROM checkout_intake').fetchone()==('paused',)
assert db.execute('SELECT count(*) FROM checkout_stock').fetchone()==(0,)
assert {t:rows(t) for t in baseline}==baseline
db.execute("INSERT INTO checkout_stock VALUES('10306','available',7,'2026-11-03','synthetic')")
db.execute("INSERT INTO checkout_admissions VALUES('existing','[]','2026-11-03',1)")
db.execute("UPDATE checkout_intake SET mode='open' WHERE id=1")
preserve={t:rows(t) for t in [*baseline,'checkout_stock','checkout_admissions','checkout_control_events']}
revision=db.execute('SELECT revision FROM checkout_control').fetchone()[0]
migrate()
assert db.execute('SELECT mode FROM checkout_intake').fetchone()==('paused',)
assert db.execute('SELECT revision FROM checkout_control').fetchone()[0]==revision+1
assert {t:rows(t) for t in preserve}==preserve
stable={t:rows(t) for t in [*preserve,'checkout_intake','checkout_control']}
migrate()
assert {t:rows(t) for t in stable}==stable
print('PASS production SQL: empty installation pauses without seeding quotas; existing orders, events, quotas and admissions preserved; open intake paused; repeated migration idempotent; revision invalidates stale admin view')
`],{encoding:'utf8'});
assert.equal(result.status,0,result.stderr||result.stdout);
console.log(result.stdout.trim());
