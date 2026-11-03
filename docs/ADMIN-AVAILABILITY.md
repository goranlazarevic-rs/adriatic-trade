# Administratorsko upravljanje webshop kvotama

Razvojni predlog od 2.11.2026, Worker 4.10.0. Nije odobrenje za merge, produkcionu objavu, D1 migraciju, unos stvarnih kvota ili otvaranje prodaje. Produkciona verzija nije proveravana ovom izmenom. Minimax se ne poziva.

## Rad operatera

Na vrhu postojećeg admin panela nalazi se „Dostupnost za webshop“: status prodaje, pet fizičkih SKU kartica, pregled paketa i poslednjih 20 administrativnih promena. Pregled se učitava nakon prijave i dugmetom za osvežavanje. Ne obećava prikaz u realnom vremenu.

1. Kliknuti „Osveži dostupnost“ pre korekcije. Kvota predstavlja **preostale slobodne komade za webshop posle već primljenih porudžbina**, ne ukupno fizičko/knjigovodstveno stanje. U ostalim kanalima ne prodavati iste izdvojene komade.
2. „Izmeni kvotu“ otvara unos nove preostale kvote i obaveznog razloga (5–500 znakova). Navesti osnov provere ili referencu dokumenta, bez ličnih podataka kupaca. „Pregledaj promenu“ ne šalje zahtev za upis.
3. Pregled pokazuje staru i novu vrednost i promenu raspoloživih komada. Svaka izmena zahteva potvrdu. Povećanje dodatno zahteva proveru slobodne robe i tačan unos, npr. `10306 15`. Broj 15 znači novu preostalu kvotu, a ne dodavanje 15 komada. Nula blokira proizvod i pakete koji ga koriste. Pozitivan broj potvrđuje raspoloživost tog proizvoda; ne otvara globalnu prodaju.
4. „Pauziraj prodaju“ → razlog → pregled/potvrda zaustavlja samo nove porudžbine. Postojeće se dalje obrađuju. Za veću proveru i usaglašavanje preporučena je pauza pre korekcija.
5. Otvaranje je odvojena radnja: svih pet kvota mora biti potvrđeno (dozvoljene su nule), bar jedan proizvod raspoloživ, razlog obavezan, tekst `OTVORI PRODAJU` i potvrda operativne spremnosti. Panel ne proverava carinske, laboratorijske i druge poslovne preduslove; njih potvrđuje operater sa odgovarajućim ovlašćenjem.

Paketi imaju izveden broj raspoloživih paketa, računat iz istih komponenti kao u checkoutu. Njihovi prikazani maksimumi važe pojedinačno i **ne sabiraju se**. Ne postoji unos posebnog paketskog salda.

### Granice i neizvestan ishod

- Serverski limit nove kvote je 10.000 komada, a povećanja raspoloživosti 100 komada po izričitoj potvrdi. To su konzervativni tehnički pragovi za početak rada, ne procena stvarne zalihe. Veća izdvajanja zahtevaju operativnu proveru i zasebnu izmenu odobrenih granica u kodu. Nema masovnog povećanja jednim klikom. Ponovno omogućavanje `unknown`/`unavailable` reda računa celu ponovo dostupnu količinu kao povećanje.
- Ako porudžbina ili drugi operater promeni kvote dok je forma otvorena, server vraća 409; pregled se osvežava, a korekcija se ne primenjuje automatski. Proveriti novu količinu pre novog pokušaja.
- Ako veza pukne pri čuvanju, kontrola ostaje zaključana za nove promene. „Proveri i ponovi isti zahtev“ koristi isti identifikator i isti sadržaj. Uspešan prethodni upis se potvrđuje bez nove korekcije. Posle zatvaranja taba proveriti pregled i istoriju pre bilo kakve nove radnje; panel ne nastavlja stari zahtev automatski.
- Odbijanje/otkazivanje porudžbine, refundacija i neuspešan mejl ne vraćaju kvotu. Ručno vraćanje zahteva proveru da roba nije isporučena i da ista poslovna korekcija nije već izvršena; navesti referencu u razlogu. Idempotency štiti isti tehnički zahtev, ne prepoznaje samostalno dva različita poslovna zahteva za isti povrat.

## Serverski ugovor i revizijski trag

`GET /admin/availability` i `POST /admin/availability` prolaze postojeću proveru dozvoljenog Origin-a, Bearer ključa (najmanje 24 znaka, constant-time poređenje) i D1 bindinga. Nema novih korisnika, lozinki, dozvoljenih origin-a ili javnih kontrola. Odgovori su `no-store`; token ostaje u postojećem sessionStorage mehanizmu jednog taba.

GET jednim SQL statement-om vraća koherentan prikaz: `revision`, `mode`, `products`, `bundles`, `canOpen`, `limits`, `history`. Ne inicijalizuje šemu. Bez kontrolne šeme ili validnog intake reda vraća 503 i UI nema dugmad za promenu.

POST prima samo sledeća polja:

| Polje | Pravilo |
|---|---|
| `operationId` | UUID, jedinstven za jednu potvrđenu radnju; isti pri ponavljanju |
| `revision` | Nenegativan ceo broj iz prikaza koji je operater pregledao |
| `action` | `quantity`, `pause` ili `open` |
| `sku`, `quantity` | Samo za `quantity`; jedan od pet fizičkih SKU, ceo broj 0–10.000 |
| `reason`, `confirmed` | Razlog 5–500 znakova i boolean `true` |
| `confirmation`, `increaseConfirmed` | Za povećanje: tačan `SKU nova_kvota` i boolean `true` |
| `confirmation`, `readinessConfirmed` | Za otvaranje: `OTVORI PRODAJU` i boolean `true` |

Prijem je ograničen na 4.096 stvarno pročitanih bajtova, uključujući zahteve bez Content-Length. Neispravan tip, nepoznata polja, paketske šifre, negativne/decimalne/string količine, izostale potvrde i prekoračenja odbijaju se pre promene.

Nova migracija dodaje `checkout_control` i `checkout_control_events`. Trigger-i povećavaju globalnu reviziju pri svakom INSERT/UPDATE/DELETE nad kvotama ili režimom, uključujući postojeće atomsko umanjenje pri novoj porudžbini i ručne SQL izmene. Provera revizije je u guard INSERT-u, u istom D1.batch-u sa promenom. Neuspeh guard-a, revizijskog zapisa ili izmene vraća ceo batch. Nema vraćanja već potrošenih komada preko zastarelog apsolutnog salda.

Revizijski zapis čuva operation ID, hash kanonskog zahteva, akciju, SKU, prethodnu reviziju, stanje pre/posle, razlog, vreme i identifikator administratorskog ključa. Ključ se ne upisuje u istoriju. **Zajednički ključ ne dokazuje identitet pojedinca**; to je ograničenje postojećeg pristupa. API nema rutu za brisanje ili menjanje istorije. D1 administratorska prava i dalje mogu menjati bazu; ovo nije neizmenjivi eksterni audit log. Istorija svih promena ostaje u tabeli; panel prikazuje poslednjih 20.

UNIQUE operation ID i hash sprečavaju dvostruki upis pri duplom kliku, paralelnom ponavljanju i izgubljenom odgovoru. Isti ID sa drugim sadržajem vraća 409. Novi ID sa starom revizijom takođe vraća 409. Cene, dostava, Turnstile, honeypot, rate limit, atomski prijem porudžbine i postojeća obrada mejlova ostaju postojeći mehanizmi.

## Kasnija aktivacija, samo uz zasebno odobrenje

1. Pregledati razvojni PR i Release Gate. Testirati na izdvojenoj D1 bazi sa sintetičkim podacima.
2. Proveriti stvarnu produkcionu verziju i postojeću checkout šemu. Posle zasebnog odobrenja primeniti `cloudflare-d1-admin-availability-v1.sql` nakon `cloudflare-d1-checkout-availability-v1.sql`. Nova migracija ne menja postojeći režim ili kvote, ne dodaje proizvode i ne izvršava se automatski u Worker-u ili CI. Ne resetovati kontrolnu reviziju ili istoriju.
3. Worker 4.10.0 objaviti postojećim zaštićenim release postupkom sa odobrenim SHA. Frontend objaviti tek kroz zasebno odobreno spajanje/Pages izdanje. Ako frontend stigne pre Workera/migracije, novi pregled prijavljuje grešku i ne nudi promene. Ako samo nova kontrolna migracija nedostaje, postojeći checkout i dalje koristi prethodnu fail-closed dostupnost; admin ne otvara prodaju.
4. Otvaranje prodaje i stvarne kvote ostaju posebne poslovne odluke. Ne testirati stvarnom porudžbinom bez odobrenja.
5. Kod problema prvo pauzirati prijem, zadržati postojeće kvote/istoriju i popraviti unapred. Worker 4.9.0 zadržava checkout kontrolu ako je potreban odobren rollback koda, ali nema novi admin API. Worker 4.8.0 uklanja zaštitu dostupnosti i nije bezbedan rollback za prodaju.

## Provere

```bash
node tests/admin-availability.mjs
MINIFLARE_MODULE_PATH=/path/to/miniflare node tests/admin-availability-runtime.mjs
PLAYWRIGHT_MODULE_PATH=/path/to/playwright node tests/admin-availability-browser.mjs
```

SQLite testovi: autentikacija/origin, nedostajuća šema, izvedeni paketi, striktna validacija, ograničeno povećanje i ponovno omogućavanje robe, uslovi otvaranja, pauza, konkurentni duplikati, drugi operater, promena pri commit-u, rollback i izgubljen odgovor. Workerd/D1 test proverava konkurentne retry zahteve i trku stvarnog prijema paketa sa korekcijom. Browser test na 1440, 390 i 320 px koristi pravi admin JS i izolovani Worker/SQLite API, presreće sve spoljne pozive i proverava potvrde, oporavak, zastarele podatke, otvaranje/pauzu, XSS istorije, offline prikaz i odjavu. CI zadržava sve prethodne regresije i zaštitu od produkcionog deploy-a.
