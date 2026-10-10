# Lična dostava Novi Sad — uplata na račun (Worker 4.7.1)

Odobrena lična dostava ostaje besplatna. Način plaćanja je `ips` (NBS IPS QR) ili `bank_transfer` (običan transfer), oba na postojeći račun firme. Gotovina se više ne bira u administratoru i serverski zahtev `method: cash` se odbija.

## Tok i rezervno plaćanje

1. Odobriti lokalnu dostavu na novoj porudžbini: dostava 0 RSD, konačan iznos je vrednost robe; podrazumevano IPS.
2. Potvrditi porudžbinu. Email uvek sadrži primaoca, račun, iznos, šifru plaćanja, model, poziv na broj i svrhu iz istih podataka kao QR. PNG se prilaže samo ako NBS vrati ispravan odgovor. NBS zahtev ima rok od 5 sekundi; nedostupnost, neispravan odgovor i prekid veze prelaze na bankarske instrukcije. Neuspešno slanje emaila i dalje ne potvrđuje porudžbinu.
3. Dogovoriti datum, vreme i mesto isporuke; email ponavlja bankarske instrukcije.
4. Proveriti evidentiranu uplatu na računu firme. Za novu evidenciju naplate obavezni su potvrda provere, važeći datum uplate i referenca sa bankarskog izvoda. Isti uslov važi i kroz Operativnu evidenciju i kroz završetak lične isporuke. Generisanje QR ili potvrda porudžbine ne označavaju porudžbinu kao naplaćenu.
5. Završiti ličnu isporuku. Evidentiraju se datum/referenca, `paymentMethod: bank_transfer`, vreme administratorske provere, isporuka i istorijski događaj. Ovo je ručna provera, bez automatske veze sa bankom. Već proverena važeća uplata ne traži ponovni unos. Refundirana uplata ne omogućava isporuku.

Lične porudžbine ne ulaze u novi izvoz za kurira i ne mogu se završiti kroz Predaju kuriru. Za bankarske porudžbine iznos pouzeća na nalepnici i CSV-u je nula. Kurirsko pouzeće, postojeća dostava 420 RSD i prag 3.500 RSD ostaju u svom toku.

## Postojeće porudžbine

Nema migracije ili grupnog prepisivanja postojećih cena, plaćanja, događaja, računa ili izvoznih snimaka. Završene stare gotovinske porudžbine ostaju dostupne, sa originalnim načinom plaćanja. Ponovljeni zahtev za već završenu isporuku ne dodaje novu naplatu.

Otvorena, nenaplaćena stara porudžbina sa gotovinom zahteva izričit izbor IPS ili transfera. Ako je već potvrđena, kupcu se šalju nove instrukcije; promena ne uspeva ako email ne uspe. Događaj čuva prethodni i novi način plaćanja. Postojeća oznaka plaćeno uz gotovinu ne pretvara se u bankarsku uplatu. Pogrešno evidentirana naplata ispravlja se kroz Operativnu evidenciju uz razlog, a zatim se izabere uplata na račun; stvarno primljena gotovina se ne prepisuje u bankarsku uplatu.

## Validacija i pregled pre puštanja

Node 24 (ugrađeni SQLite):

```sh
node --check assets/js/admin.js
node --check worker/adriatic-trade-worker-v4.5.0.js
node tests/admin-operations.mjs
node tests/local-delivery.mjs
```

Nova regresija proverava IPS i transfer, pet tipova QR greške, priloge i bankarske instrukcije, blokadu gotovine, očuvanje istorije, proveru bankarske uplate, refundacije, ponovljene zahteve, konflikt konkurentnih izmena, kurirsko pouzeće i administratorski prikaz. GitHub release gate pokreće obe grupe testova na PR-u; PR grana ne pokreće deploy job.

Pre produkcionog puštanja proveriti na testnom okruženju stvarni NBS PNG i izgled emaila u klijentu, skeniranje/uvoz u bankarsku aplikaciju i čitljivost PDF fiskalnog računa. Automatizovani testovi koriste sintetičke servise i SQLite; ne šalju emailove kupcima i ne pristupaju produkcionoj bazi. Produkciona promocija zahteva zaseban pregled/spajanje; ova razvojna grana sama ne menja produkciju.
