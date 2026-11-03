# Privremena serverska kontrola prijema porudžbina

Predlog od 1.11.2026. Worker 4.9.0, grana `feat/checkout-availability-20261101`. Ovaj dokument i PR nisu odobrenje za produkcionu objavu, migraciju ili unos stvarnih količina.

## Izbor rešenja

Postojeći Worker 4.8.0 proverava katalog, količine, cene, dostavu i Turnstile, ali ne raspoloživost robe. Kod greške D1 dozvoljava email-only prijem. PR #14 ima proveru zaliha isključivo u izolovanom simulatoru. Administrativna spremnost za prodaju, carinjenje i stvarno raspoložive količine nisu potvrđeni ovim tehničkim pregledom.

Najmanje prelazno rešenje koje ograničava i paralelne porudžbine je postojeća D1 baza sa:

- Jednim serverskim prekidačem `checkout_intake.mode`: `paused` ili `open`. Nova instalacija ostaje `paused`.
- Ručno izdvojenom prodajnom kvotom za pet fizičkih SKU oznaka. `available` i dovoljna `remaining` količina dozvoljavaju prijem; `unavailable`, `unknown`, NULL ili nedostajući red ga blokiraju.
- Trajnom evidencijom prihvaćenih zahteva `checkout_admissions` i atomskim smanjenjem kvote u istoj D1 transakciji sa porudžbinom i događajem u istoriji.

Ovo je **posebno izdvojena webshop kvota**, ne knjigovodstvena zaliha, robno izdavanje ili sinhronizacija sa Minimaxom. Ne menja Minimax niti stvarni saldo skladišta. Kvota mora biti pokrivena operativno raspoloživom robom i izuzeta iz drugih prodajnih kanala. Sam prekidač „dostupno” bez količine ne bi sprečio da dva kupca istovremeno naruče poslednji komad.

U verziji 4.9.0 upravljanje radi kroz Cloudflare D1 konzolu uz postojeća administratorska prava. Razvojni predlog 4.10.0 dodaje pregled i zaštićen API u postojeći panel: [Administratorsko upravljanje webshop kvotama](ADMIN-AVAILABILITY.md). Novi panel i migracija još zahtevaju zasebnu odobrenu aktivaciju. SQL primeri ispod predstavljaju postupak za 4.9.0 i vanrednu intervenciju ovlašćenog D1 administratora; redovan rad posle aktivacije 4.10.0 sprovoditi kroz panel radi potvrda i revizijskog traga.

## Prihvatanje i ponavljanje

Turnstile, honeypot, validacija kataloga i postojeći rate limit ostaju. Cena i dostava i dalje dolaze iz serverskog kataloga. Običan frontend checkout već prikazuje serversku poruku o odbijanju i čuva korpu.

Autoritativna kontrola je u `D1.batch()`: SQL guard mora potvrditi otvorenu prodaju i dovoljne kvote za sve komponente, pa u istom batch-u slede umanjenje, porudžbina i audit zapis. `CHECK(admitted=1)` namerno prekida transakciju kad uslovi nisu ispunjeni. UNIQUE ključ zahteva sprečava ponovno trošenje pri konkurentnom ponavljanju. Ne čita se saldo u JS pa naknadno bezuslovno prihvata. Cloudflare dokumentuje rollback celog batch-a pri grešci: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch.

| Situacija | Odgovor i efekat |
|---|---|
| Nova porudžbina, otvoreno i dovoljno kvote | 201, jedan prijem i jedno trošenje kvote |
| Pauza ili nedostajući kontrolni red | 503 `SALES_PAUSED`, bez porudžbine/mejla/trošenja |
| Nepoznato stanje ili NULL/nedostajuća količina | 503 `STOCK_UNKNOWN`, bez prijema |
| Nedostupan proizvod ili nedovoljna količina | 409 `PRODUCT_UNAVAILABLE`, odbijena cela korpa |
| Nema baze, migracije ili je upis neuspešan | 503 `INTAKE_UNAVAILABLE`; nema email-only zaobilaženja |
| Isti prihvaćen ID i isti podaci | 200 sa originalnim ID-em i iznosima, bez novog trošenja, uključujući tokom pauze |
| Isti prihvaćen ID, drugi artikli/kupac/dostava | 409 `SUBMISSION_CONFLICT`, bez promene postojeće porudžbine |
| Prvi zahtev odbijen pa dostupnost uspostavljena | Isti ID može biti prihvaćen jer prethodno nije nastala porudžbina |
| Mejlovima nedostaje potvrda nakon upisa | Kvota ostaje izdvojena; retry koristi originalnu porudžbinu i iste Resend ključeve |

HTTP 502 pri neuspelom poslovnom mejlu može značiti da je porudžbina već upisana. Ne slati nov ID i ne vraćati kvotu: prvo ponoviti originalni zahtev ili proveriti panel. Isti ID zahteva svež Turnstile token pri novom pokušaju. Resend idempotency ključevi ostaju postojeća zaštita slanja; ne garantujemo novu provajdersku funkciju.

Kontakt i B2B koriste `/inquiry/config` i `/inquiry`, sopstveni red i kontrole. Ne čitaju prekidač ili kvote. Pauza prodaje ili odsustvo checkout migracije ih ne blokira. Opšti kvar njihovih zajedničkih servisa (D1, Turnstile ili Resend) ostaje zasebno ograničenje. Health `status: ready` označava servis, ne poslovno odobrenje prodaje.

## Paketi

Kvota se vodi u komadima fizičkog proizvoda; paketi nemaju zaseban fiktivni saldo.

| Paket | Umanjenje po jednom paketu |
|---|---|
| PKT-PROBA | 10086 × 1, 10306 × 1, 10307 × 1 |
| PKT-GURMAN | 10240 × 1, 10306 × 1, 10307 × 1, 10086 × 1 |
| PKT-KOMPLET | 10240 × 1, 10012 × 1, 10086 × 1 |

Sastojci se sabiraju i sa pojedinačnim artiklima i sa drugim paketima u korpi. Sastav se uzima isključivo iz serverskog koda i odgovara aktuelnim opisima kataloga. Paket je dostupan samo kada su sve komponente dostupne i ima dovoljno svake. Promenu sastava prvo uskladiti u kodu i testovima. Zasebno isključivanje samo jednog paketa nije deo ove male prelazne verzije.

## Koraci za zasebno odobrenu aktivaciju

1. Pregledati PR i rezultate testova. Prvo proveriti u izdvojenom testnom Worker/D1 okruženju sa sintetičkim podacima.
2. Posebno odobriti migraciju `cloudflare-d1-checkout-availability-v1.sql` i Worker 4.9.0. CI samo proverava kod; nema automatskog izvršavanja ove migracije. Primeniti je na postojeću orders bazu bez brisanja podataka; nova tabela ostaje pauzirana, bez unetih količina. Ponovno izvršavanje migracije ne resetuje postojeći režim ili kvote.
3. Odobreni Worker objaviti u skladu sa postojećim zaštićenim release postupkom. Ako se Worker objavi pre migracije, nove porudžbine će biti blokirane. Sam merge/deploy ne otvara prodaju.
4. Dok je prodaja pauzirana, operater potvrđuje operativnu spremnost i robu stvarno dostupnu za prodaju. Pri početnoj kvoti odbiti već prihvaćene neisporučene porudžbine, oštećenu/blokiranu robu i obaveze drugih kanala. Prethodne porudžbine nisu retroaktivno zadužene ovom promenom.
5. Uneti samo odobrene kvote, proveriti upitom i zabeležiti osnov. Nepotvrđene SKU oznake ostaviti bez reda ili `unknown`.
6. Tek uz odobrenje za početak prodaje prebaciti režim u `open`. Proveriti da panel i forme rade; stvarna testna porudžbina zahteva zasebno odobrenje.

### Pauziranje i pregled u D1 konzoli

Sledeće komande su uputstvo za kasniji odobreni rad; nisu izvršene nad produkcijom.

```sql
UPDATE checkout_intake
SET mode='paused', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    reason='Operater: privremena obustava prijema'
WHERE id=1;

SELECT * FROM checkout_intake;
SELECT sku,state,remaining,updated_at,reason FROM checkout_stock ORDER BY sku;
```

Pauza važi za sve nove transakcije koje slede posle njenog upisa. Već završena transakcija ostaje prihvaćena; pauza ne otkazuje postojeće porudžbine.

### Početni unos i dopuna kvote

Ne unositi procenjene ili neocarinjene količine kao raspoložive. Za bezbedan obrazac koji **ne otvara prodaju** i označava nepotvrđeni SKU:

```sql
INSERT INTO checkout_stock(sku,state,remaining,updated_at,reason)
VALUES('10306','unknown',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Operater: provera u toku')
ON CONFLICT(sku) DO UPDATE SET state='unknown',remaining=NULL,
  updated_at=excluded.updated_at,reason=excluded.reason;
```

Za poznatu količinu, pod pauzom zameniti `NULL` odobrenim celim brojem komada i obe vrednosti `unknown` sa `available`, pa navesti dokument/osnov i operatera u `reason`. Ponoviti po potrebnim fizičkim SKU oznakama. Ne unosi se broj paketa ili kilogrami umesto komada. `remaining=0` ne dopušta porudžbinu.

Kod dopune razlikovati **novododeljene komade** od ukupne skladišne količine: dodavati samo novu, prethodno neizdvojenu kvotu. Ne prepisivati preostalu kvotu ukupnim fizičkim stanjem dok postoje prihvaćene porudžbine. Za potpuno usaglašavanje prvo pauzirati prijem, proveriti sve prihvaćene porudžbine i ostale kanale, izračunati stvarno slobodan saldo, pa pod pauzom uneti novi odobreni ostatak. Evidencija `checkout_admissions` čuva šta je već izdvojeno po zahtevu.

Za pojedinačnu privremenu zabranu koristiti `UPDATE checkout_stock SET state='unavailable', updated_at=..., reason=... WHERE sku=...` sa konkretnim podacima u konzoli. To blokira i pakete koji koriste taj SKU.

Posle provere svih redova i odobrene spremnosti:

```sql
UPDATE checkout_intake
SET mode='open', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    reason='Operater: spremnost i odobrene kvote potvrđene'
WHERE id=1;
```

## Ograničenja i oporavak

- Kvota se umanjuje pri prijemu, pre mejla/fiskalizacije; nema automatskog povećanja pri odbijanju, otkazivanju, refundaciji ili brisanju. To je konzervativno: operater sme da vrati konkretne komade tek posle provere da nisu isporučeni i da vraćanje već nije izvršeno, uz razlog/referencu i proveru pod pauzom. Ne ponavljati istu ručnu dopunu.
- Nema automatskog isteka rezervacije. Neuspešno slanje mejla nije osnov za oslobađanje robe. Stvarno izvršene porudžbine ne vraćaju kvotu jer je roba potrošena.
- Zaliha drugih kanala, lom, promenjen carinski status i povrat ne dolaze automatski: operater mora odmah pauzirati ili smanjiti kvotu/označiti stanje nepoznatim. Kod sumnje ostaviti pauzu.
- Ne brisati `checkout_admissions` ili istorijske porudžbine radi ponavljanja. Baza ostaje jedini autoritet; nema dozvole za nastavak samo mejlom.
- Povratak na Worker 4.8.0 uklanja kontrolu, pa ga ne koristiti kao bezbedan rollback prodaje. Prvo zatvoriti javni prijem/ostaviti 4.9.0 sa pauzom i popraviti unapred. Stariji Worker ne poštuje ovu tabelu.
- Naknadne poslovne korekcije i vanwebshop obaveze moraju se ručno usaglasiti sa kvotom.

## Validacija

```bash
node tests/checkout-availability.mjs
MINIFLARE_MODULE_PATH=/path/to/miniflare node tests/checkout-availability-runtime.mjs
```

12 novih regresionih testova proverava dostupno/nedostupno/nepoznato stanje, pakete i zbir komponenti, falsifikovane podatke, pauzu/nedostajući schema/binding, rollback, izgubljen odgovor, email grešku, retry i konflikt sadržaja. Dodatna workerd/Miniflare provera koristi stvarni lokalni D1 batch: konkurentne porudžbine za poslednji komad, paralelne duplikate, rollback kasnijeg upisa i rad obe forme dok je prodaja pauzirana ili checkout migracija nedostaje. Spoljni pozivi su presretnuti i sintetički. Postojeće checkout, admin, lokalna dostava, outbox, inquiry, browser i release-gate regresije ostaju u CI.
