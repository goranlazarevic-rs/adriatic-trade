import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

// This module is an offline laboratory, NOT a Minimax/courier API adapter.
// No network client, production configuration, credentials or fiscal SDK is loaded.
export class LabError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now = () => new Date().toISOString();
const fixtures = [
  ['TEST-COD-001', 'Pouzeće', 'courier', 2, '10306', 20],
  ['TEST-LOCAL-002', 'Uplata na račun', 'local', 2, '10306', 20],
  ['TEST-STOCK-003', 'Pouzeće', 'courier', 2, '10306', 0],
  ['TEST-SKU-004', 'Pouzeće', 'courier', 2, 'UNKNOWN-TEST', 20],
  ['TEST-TIMEOUT-005', 'Pouzeće', 'courier', 2, '10306', 20],
];

export class IntegrationLab {
  constructor({ filename = ':memory:', mode = 'simulation' } = {}) {
    if (mode !== 'simulation') throw new LabError('Dozvoljena je isključivo lokalna simulacija.', 400);
    // Refuse an existing non-lab file BEFORE executing any schema writes.
    if (filename !== ':memory:' && existsSync(filename)) {
      let probe;
      try {
        probe=new DatabaseSync(filename,{readOnly:true});
        if(probe.prepare('SELECT mode FROM lab_meta WHERE id=1').get()?.mode!=='offline-simulation-v1') throw new Error('Not a lab');
      } catch { throw new LabError('Izabrana datoteka nije postojeća TEST baza. Izaberite NOV naziv datoteke.',400); }
      finally { probe?.close(); }
    }
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS lab_meta (id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT NOT NULL);
      INSERT OR IGNORE INTO lab_meta VALUES(1,'offline-simulation-v1');
    `);
    if (this.db.prepare('SELECT mode FROM lab_meta WHERE id=1').get().mode !== 'offline-simulation-v1') {
      this.db.close(); throw new LabError('Ovo nije baza lokalne simulacije.', 400);
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lab_orders (
        id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
        stock_checked INTEGER NOT NULL DEFAULT 0, fulfillment TEXT NOT NULL DEFAULT 'pending',
        payment TEXT NOT NULL DEFAULT 'unpaid', remittance TEXT NOT NULL DEFAULT 'pending');
      CREATE TABLE IF NOT EXISTS lab_jobs (
        operation_key TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES lab_orders(id),
        kind TEXT NOT NULL, payload TEXT NOT NULL, payload_hash TEXT NOT NULL,
        status TEXT NOT NULL, external_id TEXT, attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT, UNIQUE(order_id,kind));
      CREATE TABLE IF NOT EXISTS lab_provider (
        operation_key TEXT PRIMARY KEY, external_id TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS lab_receipts (
        order_id TEXT PRIMARY KEY REFERENCES lab_orders(id), external_id TEXT NOT NULL UNIQUE,
        number TEXT NOT NULL UNIQUE, total INTEGER NOT NULL, pdf BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS lab_events (
        id INTEGER PRIMARY KEY, order_id TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
    `);
    this.tx(() => {
      for (const [id, paymentMethod, delivery, qty, sku, available] of fixtures) {
        const shipping = delivery === 'courier' ? 42000 : 0;
        // Integer para amounts; no live prices or live orders are fetched.
        const snapshot = {id, synthetic:true, customer:{name:'TEST Kupac',email:`${id.toLowerCase()}@example.invalid`,phone:'TEST',address:'TEST adresa'},
          paymentMethod, delivery, items:[{sku,name:'TEST So',qty,unitPrice:29900}], goodsTotal:59800,shipping,total:59800+shipping,
          mapping:sku === '10306' ? {itemId:'SIM-ITEM-10306',unit:'kom',taxCode:'SIM-TAX-UNCONFIRMED'} : null, available};
        this.db.prepare('INSERT OR IGNORE INTO lab_orders(id,snapshot) VALUES(?,?)').run(id,JSON.stringify(snapshot));
      }
    });
  }
  close() { this.db.close(); }
  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value=fn(); this.db.exec('COMMIT'); return value; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  event(id, action, detail) {
    this.db.prepare('INSERT INTO lab_events(order_id,action,detail,created_at) VALUES(?,?,?,?)').run(id,action,detail,now());
  }
  row(id) {
    const row=this.db.prepare('SELECT * FROM lab_orders WHERE id=?').get(id);
    if (!row) throw new LabError('Izaberite postojeću sintetičku porudžbinu.',404);
    return {...row,snapshot:JSON.parse(row.snapshot)};
  }
  job(id,kind) { return this.db.prepare('SELECT * FROM lab_jobs WHERE order_id=? AND kind=?').get(id,kind); }
  receipt(id) { return this.db.prepare('SELECT * FROM lab_receipts WHERE order_id=?').get(id); }
  state() {
    return {mode:'simulation', network:'disabled', orders:this.db.prepare('SELECT id FROM lab_orders ORDER BY id').all().map(({id})=>{
      const row=this.row(id), receipt=this.receipt(id);
      return {...row,receipt:receipt?{externalId:receipt.external_id,number:receipt.number,total:receipt.total}:null,
        jobs:this.db.prepare('SELECT operation_key,kind,status,external_id,attempts,error FROM lab_jobs WHERE order_id=? ORDER BY kind').all(id),
        events:this.db.prepare('SELECT action,detail,created_at FROM lab_events WHERE order_id=? ORDER BY id').all(id)};
    }),providerCounts:this.db.prepare('SELECT kind,COUNT(*) AS count FROM lab_provider GROUP BY kind').all()};
  }
  action(id, action, scenario = 'ok') {
    if (!['ok','timeout','email-failure'].includes(scenario)) throw new LabError('Nepoznat scenario.',400);
    const o=this.row(id);
    switch (action) {
      case 'confirm':
        if (o.status === 'new') this.tx(()=>{
          this.db.prepare("UPDATE lab_orders SET status='confirmed' WHERE id=?").run(id);
          this.event(id,action,'Potvrđena samo u laboratoriji. Nema fiskalizacije, poruke ni naplate.');
        });
        // Confirmation automatically queues/transfers a received order, not an invoice.
        return this.transfer(id,scenario);
      case 'transfer': return this.transfer(id,scenario);
      case 'reconcile-transfer': return this.reconcile(id,'received-order');
      case 'stock':
        this.requireTransfer(id);
        if (!o.snapshot.mapping) throw new LabError('Nema mapiranja šifre artikla. Nije otvoren novi artikal.');
        if (o.snapshot.items.some(item=>item.qty>o.snapshot.available)) throw new LabError('Nema dovoljne TEST zalihe. Izdavanje je blokirano.');
        this.tx(()=>{this.db.prepare('UPDATE lab_orders SET stock_checked=1 WHERE id=?').run(id); this.event(id,action,'TEST raspoloživost proverena; bez rezervacije, robnog izdavanja i knjiženja.');});
        break;
      case 'mock-invoice':
        this.requireTransfer(id);
        if (!o.stock_checked) throw new LabError('Prvo proverite TEST zalihe.');
        if (this.receipt(id)) break;
        // Emulates an operator completing a document elsewhere. NO issue API exists.
        this.tx(()=>{
          const number=`SIM-NOT-FISCAL-${id}`, externalId=`SIM-DOC-${id}`;
          const pdf=syntheticPdf(id,o.snapshot.total);
          this.db.prepare('INSERT INTO lab_receipts VALUES(?,?,?,?,?)').run(id,externalId,number,o.snapshot.total,pdf);
          this.event(id,action,'Primljen sintetički dokument: '+number+'. Ovo nije fiskalni račun.');
        });
        break;
      case 'email':
        if (!this.receipt(id)) throw new LabError('Prvo povežite sintetički PDF.');
        return this.perform(id,'receipt-email',{to:o.snapshot.customer.email,receiptId:this.receipt(id).external_id,
          pdfHash:createHash('sha256').update(this.receipt(id).pdf).digest('hex')},scenario);
      case 'reconcile-email': return this.reconcile(id,'receipt-email');
      case 'shipment':
        this.requireTransfer(id);
        if (o.snapshot.delivery !== 'courier') throw new LabError('Lična dostava nema kurirski nalog.');
        if (!this.receipt(id)) throw new LabError('Prvo povežite sintetički PDF.');
        return this.perform(id,'shipment',{orderId:id,customer:o.snapshot.customer,packages:1,
          cod:o.snapshot.paymentMethod==='Pouzeće' && o.payment==='unpaid'?o.snapshot.total:0},scenario);
      case 'reconcile-shipment': return this.reconcile(id,'shipment');
      case 'handoff':
        if (o.snapshot.delivery !== 'courier' || this.job(id,'shipment')?.status!=='succeeded') throw new LabError('Prvo razrešite kreiranje TEST pošiljke.');
        if (!this.receipt(id) || this.job(id,'receipt-email')?.status!=='succeeded') throw new LabError('Za ovu probu obavezan je PDF i uspešno hvatanje poruke u simulatoru.');
        if (o.fulfillment==='pending') this.tx(()=>{
          this.db.prepare("UPDATE lab_orders SET fulfillment='handed_over' WHERE id=?").run(id);
          this.event(id,action,'Simulirana fizička predaja. Pošiljka nije označena kao isporučena ili plaćena.');
        });
        break;
      case 'delivered':
        if (['delivered','returned'].includes(o.fulfillment)) break;
        if (o.snapshot.delivery === 'courier' && o.fulfillment !== 'handed_over') throw new LabError('Prvo evidentirajte TEST predaju kuriru.');
        if (o.snapshot.delivery === 'local' && (!this.receipt(id) || o.payment!=='paid' || this.job(id,'receipt-email')?.status!=='succeeded')) throw new LabError('Za ličnu dostavu potrebni su TEST uplata, PDF i poruka u simulatoru.');
        this.tx(()=>{this.db.prepare("UPDATE lab_orders SET fulfillment='delivered' WHERE id=?").run(id);this.event(id,action,'Simulirana isporuka; nema automatske naplate.');});
        break;
      case 'payment':
        if (o.snapshot.delivery==='courier' && o.fulfillment!=='delivered') throw new LabError('Pouzeće se u ovoj probi beleži posle TEST isporuke.');
        if (o.snapshot.delivery==='local' && o.status!=='confirmed') throw new LabError('Prvo potvrdite TEST porudžbinu.');
        if (o.payment==='unpaid') this.tx(()=>{this.db.prepare("UPDATE lab_orders SET payment='paid' WHERE id=?").run(id);
          this.event(id,action,'Simulirana potvrda naplate; nema bankarske transakcije ni fiskalnog izdavanja.');});
        break;
      case 'remittance':
        if (o.snapshot.delivery !== 'courier' || o.payment!=='paid') throw new LabError('Prvo evidentirajte TEST naplatu kurira.');
        if (o.remittance==='pending') this.tx(()=>{this.db.prepare("UPDATE lab_orders SET remittance='received' WHERE id=?").run(id);this.event(id,action,'Simulirano usklađivanje prenosa otkupnine; bez novog računa.');});
        break;
      case 'returned':
        if (o.fulfillment==='returned') break;
        if (o.fulfillment!=='handed_over' || o.payment!=='unpaid') throw new LabError('Ovaj scenario je samo za neuručenu i nenaplaćenu pošiljku.');
        this.tx(()=>{this.db.prepare("UPDATE lab_orders SET fulfillment='returned' WHERE id=?").run(id);
          this.event(id,action,'TEST povrat. Fiskalna korekcija je zaseban budući korak; nije automatski izdata refundacija.');});
        break;
      default: throw new LabError('Radnja nije podržana u lokalnoj simulaciji.',400);
    }
    return this.state();
  }
  requireTransfer(id) {
    if (this.row(id).status!=='confirmed' || this.job(id,'received-order')?.status!=='succeeded') throw new LabError('Prvo potvrdite porudžbinu i razrešite TEST prenos.');
  }
  transfer(id, scenario) {
    const o=this.row(id);
    if (o.status!=='confirmed') throw new LabError('Prvo potvrdite porudžbinu.');
    if (!o.snapshot.mapping) throw new LabError('Nepoznata šifra: prenos zaustavljen, bez automatskog otvaranja artikla.');
    return this.perform(id,'received-order',{reference:id,customer:o.snapshot.customer,items:o.snapshot.items,
      mapping:o.snapshot.mapping,shipping:o.snapshot.shipping,total:o.snapshot.total},scenario);
  }
  perform(id, kind, payload, scenario) {
    const serialized=JSON.stringify(payload), fingerprint=hash(payload), key=`SIM:${id}:${kind}:v1`;
    // Commit intent BEFORE the simulated provider operation. After a crash the
    // durable in_flight/uncertain state permits only reconciliation, never replay.
    const run=this.tx(()=>{
      const existing=this.job(id,kind);
      if (existing) {
        if (existing.payload_hash!==fingerprint) throw new LabError('Podaci su promenjeni. Potrebna je ručna provera prethodne operacije.');
        if (['in_flight','uncertain'].includes(existing.status)) throw new LabError('Ishod je neizvestan. Koristite „Proveri ishod”; ne ponavljajte kreiranje.');
        if (existing.status==='succeeded') return false;
        if (existing.status!=='retryable') throw new LabError('Operacija zahteva proveru.');
        this.db.prepare("UPDATE lab_jobs SET status='in_flight', attempts=attempts+1,error=NULL WHERE operation_key=?").run(key);
      } else {
        this.db.prepare("INSERT INTO lab_jobs(operation_key,order_id,kind,payload,payload_hash,status,attempts) VALUES(?,?,?,?,?,'in_flight',1)").run(key,id,kind,serialized,fingerprint);
      }
      this.event(id,kind,'Sačuvana namera: '+key); return true;
    });
    if (!run) return this.state();
    if (kind==='receipt-email' && scenario==='email-failure') {
      this.tx(()=>{this.db.prepare("UPDATE lab_jobs SET status='retryable',error='SIM: odbijeno pre prihvatanja poruke' WHERE operation_key=?").run(key);
        this.event(id,kind,'TEST email nije prihvaćen; ponavlja se ista poruka, bez novog dokumenta.');});
      return this.state();
    }
    try {
      const externalId=`SIM-${kind}-${id}`;
      // The simulated provider ledger has its own durable record, distinct from
      // our job table. Real provider idempotency is NOT implied by this ledger.
      this.db.prepare('INSERT OR IGNORE INTO lab_provider VALUES(?,?,?,?)').run(key,externalId,kind,serialized);
      const provider=this.db.prepare('SELECT * FROM lab_provider WHERE operation_key=?').get(key);
      if (provider.payload!==serialized) throw new LabError('Konflikt simuliranog provajdera.');
      if (scenario==='timeout') {
        this.tx(()=>{this.db.prepare("UPDATE lab_jobs SET status='uncertain',error='SIM: izgubljen odgovor' WHERE operation_key=?").run(key);
          this.event(id,kind,'TEST odgovor izgubljen posle nastanka zapisa. Obavezna provera ishoda.');});
      } else this.complete(id,kind,provider);
    } catch (error) {
      this.db.prepare("UPDATE lab_jobs SET status='uncertain',error='SIM: potrebna provera ishoda' WHERE operation_key=?").run(key);
      throw error;
    }
    return this.state();
  }
  complete(id,kind,provider) {
    this.tx(()=>{
      this.db.prepare("UPDATE lab_jobs SET status='succeeded',external_id=?,error=NULL WHERE order_id=? AND kind=?").run(provider.external_id,id,kind);
      this.event(id,kind,'Potvrđen ishod simulatora: '+provider.external_id);
    });
  }
  reconcile(id,kind) {
    const job=this.job(id,kind);
    if (!job) throw new LabError('Nema operacije za proveru.');
    if (job.status==='succeeded') return this.state();
    if (!['uncertain','in_flight'].includes(job.status)) throw new LabError('Operacija nije neizvesna.');
    const provider=this.db.prepare('SELECT * FROM lab_provider WHERE operation_key=?').get(job.operation_key);
    if (!provider || hash(JSON.parse(provider.payload))!==job.payload_hash) throw new LabError('Ishod nije potvrđen. Operacija ostaje blokirana; nema automatskog ponavljanja.');
    this.complete(id,kind,provider);
    return this.state();
  }
}

export function syntheticPdf(id,total) {
  if (!/^TEST-[A-Z0-9-]+$/.test(id) || !Number.isSafeInteger(total)) throw new LabError('Dozvoljeni su samo TEST podaci.',400);
  const text=['SIMULATION - NOT A FISCAL RECEIPT','NO MINIMAX / TAX AUTHORITY TRANSMISSION',`Order: ${id}`,`Synthetic amount: ${(total/100).toFixed(2)} RSD`];
  const stream=`BT /F1 16 Tf 40 780 Td ${text.map((line,i)=>`${i?'0 -28 Td ':''}(${line}) Tj`).join('\n')} ET`;
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let result='%PDF-1.4\n'; const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(result));result+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(result);
  result+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}
