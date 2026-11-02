# Minimax nacrt iz administratorskog panela — izolovana proba

Ovaj korak povezuje administratorski panel sa serverskim pravljenjem **nacrta**.
Nije uključen na produkciji. Ne izdaje niti fiskalizuje račune, ne šalje kupcima
email/PDF i nema kurirsku API vezu. Lokalna proba nacrta 24994201 ostaje zasebna,
proverena evidencija; ne pokretati je ponovo radi ovog panela.

## Šta je pripremljeno

- Poseban Worker i D1 baza `adriatic-trade-minimax-staging`; bez produkcionih D1/R2,
  email ili Turnstile tajni, bez cron zadataka i bez javnog checkout-a.
- Isti admin interfejs, ali iz sopstvenog probnog porekla i sa odvojenim ključem.
  U probnom detalju nema kontrola za isporuku ili izmenu porudžbine.
- Tri sintetičke, unapred potvrđene porudžbine, bez podataka stvarnih kupaca:

| Porudžbina | Sadržaj | Ukupno sa dostavom |
| --- | --- | ---: |
| AT-MMTEST-STANDARD | Pet pojedinačnih artikala + dostava | 2.968,00 RSD |
| AT-MMTEST-PAKET | Dva paketa Probaj + sačuvana akcijska cena 499 + dostava | 3.219,00 RSD |
| AT-MMTEST-BESPLATNA | Dva paketa Premium, besplatna dostava | 3.600,00 RSD |

Proba koristi **stvarnu Minimax organizaciju 81179**, istu kao lokalni alat.
Odvojena je baza webshop-a, ne Minimax organizacija. Nastaju stvarni sačuvani
probni nacrti; ne pritiskati „Izdaj“. Režim obuke numeracije se proverava u
Minimax-u pre probe i ne menja se automatski.

## Objavljivanje probnog panela

Ovo je zaseban ručni korak posle pregleda razvojnog commita. Nema automatskog
objavljivanja na push/PR, niti spajanja na main.

1. GitHub → Actions → **Adriatic Trade Release Gate** → **Run workflow**.
2. Izabrati granu `feat/minimax-admin-drafts-20261102`.
3. `deploy_production` ostaviti **false**. `deploy_minimax_staging` postaviti **true**.
4. U `approved_staging_sha` upisati puni SHA pregledanog commita te grane.
   `approved_sha` za produkciju ostaviti prazno.
5. Pokrenuti. Sve provere moraju proći pre zasebnog staging posla.

Ako GitHub interfejs ne prikaže ulazna polja iz izabrane grane, isti postojeći
registrovani workflow može se pozvati preko prijavljenog GitHub CLI-ja:

```sh
gh workflow run deploy-worker.yml --repo goranlazarevic-rs/adriatic-trade --ref feat/minimax-admin-drafts-20261102 -f deploy_production=false -f deploy_minimax_staging=true -f approved_staging_sha=FULL_REVIEWED_COMMIT_SHA
```

Workflow koristi postojeće GitHub Cloudflare tajne. Kreira ili pronalazi samo
imenovanu probnu bazu. Ponovno pokretanje ne briše porudžbine, nacrte ili journal.
Nedostatak Cloudflare prava za kreiranje D1 baze zaustavlja posao; ne menjati vezu
na produkcionu bazu kao zaobilazno rešenje. Konfiguracija je u privremenom direktorijumu,
ne prenosi se kao javni statički fajl/artifact i ne sadrži Minimax tajne.

## Jednokratni privatni unos pristupa

Cloudflare → Workers & Pages → **adriatic-trade-minimax-staging** → Settings →
Variables and Secrets → Add. Svaku vrednost dodati kao **Secret**, pa Deploy:

| Naziv tajne | Privatno uneti |
| --- | --- |
| ADMIN_TOKEN | Novi probni ključ, najmanje 24 znaka; sačuvati privatno |
| MINIMAX_CLIENT_ID | Identifikacioni kod iz poruke podrške; nije naziv adriatictrade |
| MINIMAX_CLIENT_SECRET | Client lozinka iz poruke podrške |
| MINIMAX_USERNAME | adriatic-webshop |
| MINIMAX_PASSWORD | User lozinka za spoljnu aplikaciju iz Minimax profila |

Ne slati ove vrednosti kroz chat, PR, screenshot, GitHub Actions inputs ili fajl u
repozitorijumu. Pre unosa tajni panel radi samo za pregled.

## Provera u pregledaču

1. Otvoriti `https://adriatic-trade-minimax-staging.lakifinance.workers.dev/admin.html`.
2. Uneti **probni ADMIN_TOKEN**. Jelena može otvoriti ovaj isti link sa drugog računara;
   Node.js joj ne treba. Ne unosi četiri Minimax tajne u pregledač.
3. Otvoriti STANDARD. Pregledati šest stavki i zbir 2.968 RSD.
4. Kliknuti **Napravi probni nacrt**, potvrditi prikazani iznos. Sačekati
   **Nacrt je pročitan i proveren** i otvoriti ponuđeni link u Minimax-u.
5. Osvežiti panel. Mora ostati isti ID, bez drugog dugmeta za kreiranje.
6. Proveriti PAKET (po dve fizičke jedinice svake komponente Probaj, artikal
   10240 po 499 RSD; ukupno 3.219 RSD) i BESPLATNA (bez reda DOSTAVA; 3.600 RSD).
7. Zabeležiti samo tri ID-a nacrta i rezultate, bez pristupnih podataka.

Ako je ishod neizvestan, panel ne ponavlja POST. Pronaći postojeći nacrt u Minimax-u
po osnovu `WEBSHOP:AT-MMTEST-...`, uneti njegov ID u panel i izabrati
**Proveri postojeći nacrt**. Bez brisanja journala/baze ili promene ID-a radi ponavljanja.
Ako nacrt nije pronađen, zaustaviti tu porudžbinu i proveriti ishod sa podrškom.

## Pravila podataka i zaštita od dupliranja

Autoritet je sačuvana porudžbina u D1, ne telo admin zahteva. Pregled nema spoljne
pozive. Create zahteva svež SHA-256 pregleda i novu proveru API pristupa/priceliste
za kupca 9775669. Osnovne cene bez kupca nisu rezervna opcija.

Sastav novoprihvaćenog paketa se čuva na serveru uz porudžbinu (`v1`, komponente,
referentne cene). Stari paket bez ovog snimka ne može automatski da se prenese.
Sačuvana cena paketa deli se proporcionalno na fizičke artikle metodom najvećih
ostataka u parama. Akcijska cena i besplatna dostava ostaju iz prihvaćene porudžbine.
Efektivne cene su na stavkama; ne preračunava se popust iz današnjeg cenovnika.

D1 jedinstveni ključ `minimax:draft:<orderId>` se atomski upisuje pre POST-a,
uz proveru revizije i stanja porudžbine i događaj u istoriji. Konkurentni klikovi
imaju jednog pobednika. ID se čuva pre čitanja nacrta. Svaki neizvestan POST,
uključujući HTTP grešku, ostaje zaključan za ponovno kreiranje. Provera koristi
samo GET i zahteva odgovarajući osnov, datum, status O, stavke, količine, iznose,
PDV, skladište i način plaćanja. `InvoiceValue=0` na nacrtu nije iznos porudžbine.

## Šta još nije završeno za stvarnu prodaju

- Potvrda mapiranja pouzeća; pilot koristi samo TEST_BANK_TRANSFER / Tekući račun.
- Pristup produkcionom serveru, privatne tajne, pregled i posebno odobrenje za
  puštanje stvarnih porudžbina; integracija ostaje isključena podrazumevano.
- Potvrda knjigovođe za vrednovanje prijema, zalihe/VP-MP i fiskalni tok.
- Inspekcijsko odobrenje robe i status registracije objekta, prema dokumentima firme.
- Izbor/ugovor i API pristup kurirskoj službi. Postojeći CSV je ručni izvoz, ne API.
- Posebno odobrenje i provera stvarnog izdavanja/fiskalizacije, PDF-a i povratnih tokova.

## Validacija

`node --test tests/minimax-admin.mjs` proverava cene, sastav paketa, konkurentnost,
stari pregled, CAS reviziju, tajne/DB marker, neizvestan ishod, rekoncilijaciju i
čitanje ID-a pre povratne provere. `tests/minimax-admin-runtime.mjs` izvršava stvarni
Worker wrapper i D1 u workerd-u sa osam konkurentnih zahteva i presretnutim spoljnim
pozivima. `tests/minimax-admin-browser.mjs` proverava pravi admin JS na 1440/390 px,
ponovno učitavanje, proveru istog nacrta i neizvestan ishod. Policy test proverava
izolovano punjenje baze i ručno odobreni staging SHA. Sve spoljne usluge u testovima
su sintetičke; testovi nisu potvrda novog stvarnog Minimax prenosa.
