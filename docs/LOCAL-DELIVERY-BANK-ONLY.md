# Lična dostava Novi Sad — uplata na račun (Worker 4.7.2)

Odobrena lična dostava ostaje besplatna. Način plaćanja je `ips` (NBS IPS QR) ili `bank_transfer` (običan transfer), oba na postojeći račun firme. Gotovina se više ne bira u administratoru i serverski zahtev `method: cash` se odbija.

## Tok i rezervno plaćanje

1. Odobriti lokalnu dostavu na novoj porudžbini: dostava 0 RSD, konačan iznos je vrednost robe; podrazumevano IPS.
2. Potvrditi porudžbinu. Email uvek sadrži primaoca, račun, iznos, šifru plaćanja, model, poziv na broj i svrhu iz istih podataka kao QR. PNG se prilaže samo ako NBS vrati ispravan odgovor. NBS zahtev ima rok od 5 sekundi; nedostupnost, neispravan odgovor i prekid veze prelaze na bankarske instrukcije. Status, istorija i email zahtev sada se čuvaju u jednoj D1 transakciji, pre slanja. Neuspeh emaila ostavlja sačuvanu potvrdu i vidljivo obaveštenje za ponovni pokušaj.
3. Dogovoriti datum, vreme i mesto isporuke; email ponavlja bankarske instrukcije.
4. Proveriti evidentiranu uplatu na računu firme. Za novu evidenciju naplate obavezni su potvrda provere, važeći datum uplate i referenca sa bankarskog izvoda. Isti uslov važi i kroz Operativnu evidenciju i kroz završetak lične isporuke. Generisanje QR ili potvrda porudžbine ne označavaju porudžbinu kao naplaćenu.
5. Završiti ličnu isporuku. Evidentiraju se datum/referenca, `paymentMethod: bank_transfer`, vreme administratorske provere, isporuka i istorijski događaj. Ovo je ručna provera, bez automatske veze sa bankom. Već proverena važeća uplata ne traži ponovni unos. Refundirana uplata ne omogućava isporuku.

Lične porudžbine ne ulaze u novi izvoz za kurira i ne mogu se završiti kroz Predaju kuriru. Za bankarske porudžbine iznos pouzeća na nalepnici i CSV-u je nula. Kurirsko pouzeće, postojeća dostava 420 RSD i prag 3.500 RSD ostaju u svom toku.

## Postojeće porudžbine

Nema migracije ili grupnog prepisivanja postojećih cena, plaćanja, događaja, računa ili izvoznih snimaka. Završene stare gotovinske porudžbine ostaju dostupne, sa originalnim načinom plaćanja. Ponovljeni zahtev za već završenu isporuku ne dodaje novu naplatu.

Otvorena, nenaplaćena stara porudžbina sa gotovinom zahteva izričit izbor IPS ili transfera. Ako je već potvrđena, kupcu se šalju nove instrukcije; promena se sačuva atomskim upisom, a neuspešan email ostaje u redu za ponovni pokušaj. Događaj čuva prethodni i novi način plaćanja. Postojeća oznaka plaćeno uz gotovinu ne pretvara se u bankarsku uplatu. Pogrešno evidentirana naplata ispravlja se kroz Operativnu evidenciju uz razlog, a zatim se izabere uplata na račun; stvarno primljena gotovina se ne prepisuje u bankarsku uplatu.

## Validacija i pregled pre puštanja

Node 24 (ugrađeni SQLite):

```sh
node --check assets/js/admin.js
node --check worker/adriatic-trade-worker-v4.5.0.js
node tests/admin-operations.mjs
node tests/local-delivery.mjs
node tests/notification-outbox.mjs
node tests/checkout-security.mjs
```

Nova regresija proverava IPS i transfer, pet tipova QR greške, priloge i bankarske instrukcije, blokadu gotovine, očuvanje istorije, proveru bankarske uplate, refundacije, ponovljene zahteve, konflikt konkurentnih izmena, kurirsko pouzeće i administratorski prikaz. GitHub release gate pokreće sve četiri grupe testova, lokalni workerd/D1/R2 test i browser testove na PR-u; PR grana ne pokreće deploy job.

Opciona integraciona provera koristi Playwright i Chromium (instalirani van repozitorijuma):

```sh
node tests/local-delivery-browser.mjs
```

Ako Playwright nije na standardnoj Node putanji, postaviti `PLAYWRIGHT_MODULE_PATH` na njegov modul. `CHROMIUM_EXECUTABLE` bira lokalni izvršni fajl; `QA_ARTIFACT_DIR` čuva snimke ekrana i HTML emailove. Dva scenarija koriste stvarni admin i Worker kod, izolovanu SQLite bazu i zamene za R2, Resend i NBS: IPS prekid na računaru (1440 × 1000) i bankarski transfer na telefonu (390 × 844). Prolaze od odobrenja do preuzimanja PDF priloga i proveravaju prikaz tri kupčeva emaila. Testni PDF je postojeće obaveštenje, samo kao primer ispravnog formata, a ne stvarni fiskalni račun.

Regresija ima 34 slučaja. Dodatne provere pokrivaju povezani PDF, neuspešno slanje uz očuvanje trajno povezanog priloga i čišćenje novog priloga samo ako DB transakcija ne uspe, promenu lokacije termina, nevažeće datume i zaštitu naplate/statusa od konkurentnih izmena. Obaveštenje u PDF-u takođe razlikuje kurirsko pouzeće od lične dostave uz IPS/račun.

Pre produkcionog puštanja proveriti na testnom okruženju stvarni NBS PNG za podatke firme, izgled emaila u poštanskom klijentu, skeniranje/uvoz u bankarsku aplikaciju i stvarni PDF fiskalnog računa. Automatizovani testovi ne šalju emailove kupcima i ne pristupaju produkcionoj bazi. Detaljan rezultat i preostale provere: [PREPRODUCTION-CHECK-20261010.md](PREPRODUCTION-CHECK-20261010.md). Produkciona promocija zahteva zaseban pregled/spajanje; ova razvojna grana sama ne menja produkciju.


## Red za emailove (4.7.2)

`notification_outbox` čuva neizmenjivu poruku i isti Resend idempotency key uz status i istoriju porudžbine. PDF se čuva samo u R2, u redu je njegov ključ. Worker šalje tek posle uspešne transakcije. Konflikt 409 ne šalje email i ne dodaje novi posao. Admin jasno razlikuje sačuvanu izmenu od potvrđenog prijema poruke u email servisu; servisni prijem nije dokaz isporuke u inbox.

Cron na svakih pet minuta obrađuje do deset obaveštenja, sa rastućim razmakom posle greške. Zaključavanje sprečava paralelno slanje, a obaveštenja iste porudžbine čuvaju redosled. Posle osam neuspeha, ili 23 sata od prvog pokušaja, posao prelazi u `attention`: operator proverava Resend, ne ponavlja poslovnu izmenu. Resend idempotency traje 24 sata, pa se neizvesna poruka automatski ne šalje posle tog roka. Dugme za retry može ponoviti posao unutar bezbednog roka; posao stariji od njega ostaje blokiran za ručnu proveru.

Ograničenje 5/IP/60 min rezerviše mesto jednim SQL upisom; paralelni zahtevi ne prelaze pet. Ponovljen identifikator iste porudžbine ne troši dodatno mesto. Pri nedostupnoj D1 proveri ostaje postojeći degradirani režim uz obavezni Turnstile; ova verzija ne menja tu politiku dostupnosti.

Za izolovani stvarni workerd runtime (bez Cloudflare naloga i produkcionih podataka):

```sh
npm install --prefix /tmp/adriatic-qa miniflare@5.20261006.1-alpha
MINIFLARE_MODULE_PATH=/tmp/adriatic-qa/node_modules/miniflare node tests/cloudflare-runtime.mjs
```

Miniflare test koristi tačno kompatibilnost `2026-10-02`. Email, Turnstile i NBS su kontrolisane zamene; D1/R2 su lokalni Cloudflare runtime servisi. Testna zavisnost ne ulazi u produkcioni Worker. Browser i runtime testovi sada su obavezni u CI.
