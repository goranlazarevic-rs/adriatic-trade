# Provera pre produkcije — 10.10.2026.

Razvojna grana: `fix/local-delivery-bank-only`, Worker 4.7.2, [PR #8](https://github.com/goranlazarevic-rs/adriatic-trade/pull/8).

Automatizovane i lokalne vizuelne provere su uspešne. Korisnik je potvrdio uvoz QR slike u bankarsku aplikaciju i podudaranje prikazanih podataka. Stvarna Resend isporuka i Cloudflare testni resursi još nisu provereni. Korisnik je naknadno odobrio ispravke, testove i produkciono puštanje. Ovaj izveštaj beleži testove pre spajanja; dokaz stvarnog deploy-a je GitHub Actions i javni health.

## Rezultati

| Provera | Rezultat i granica provere |
| --- | --- |
| Regresija lične dostave | 34/34 uspešno: zabrana gotovine, IPS i transfer, pet QR grešaka, provera uplate, istorija, refundacije, ponovljeni i konkurentni zahtevi, PDF i kurirski tok. |
| Postojeća operativna regresija | Sve četiri grupe uspešne: stanja, naplata, evidencija, verzionisanje, izvoz, filteri i administratorski prikaz. |
| Pregledač — računar | Chromium 153, 1440 × 1000: odobrenje → IPS nedostupan → potvrda sa bankarskim instrukcijama → termin → obavezna provera uplate → isporuka → PDF preuzimanje. |
| Pregledač — telefon | Chromium 153, 390 × 844: eksplicitni bankarski transfer, isti kompletan tok. Nema dugmeta Gotovina, JavaScript grešaka ili horizontalnog prelivanja. Ovo je mobilna širina desktop Chromium-a, nije fizički telefon/Safari. |
| Kupčevi emailovi | Šest prikaza (tri emaila na obe širine) provereno vizuelno; logo, bankarski podaci, rok/mesto i PDF obaveštenje čitljivi. Sadržaj i prilozi potvrđeni u uhvaćenim Resend zahtevima. Stvarna isporuka i Gmail/Outlook prikaz nisu testirani. |
| PDF obaveštenje | Sve tri strane renderovane i pregledane. Plaćanje usklađeno sa IPS/računom za ličnu dostavu; uklonjena pretpostavka isključivog pouzeća iz pasusa o povraćaju. Ostali sadržaj sačuvan, verzija 10.10.2026. Obrazac za odustanak nije menjan. |
| PDF uz isporuku | Upload, čuvanje, ponovno prilaganje postojećeg PDF-a i download uspešni. Greška emaila čuva uspešno sačuvan PDF za retry. Samo neuspešna DB transakcija uklanja nov upload; istorijski prilog ostaje. Nije korišćen stvarni fiskalni dokument kupca. |
| NBS javni primer — stvarni servis | HTTP 200, `image/png`, 500 × 500; QR dekodiran i račun/iznos odgovaraju zvaničnom javnom primeru. Zahtev nije sadržao podatke Adriatic Trade. |
| NBS Adriatic Trade — stvarni servis | Nakon izričitog odobrenja korisnika isključivo za test: HTTP 200, `image/png`, 500 × 500, 1.297 bajtova. QR dekodiran; svih devet polja odgovara zahtevu: račun/primalac, 598 RSD, šifra 289, model 00, poziv `20261010654321`, svrha za sintetičku porudžbinu `AT-20261010-654321`. Generisanje ne izvršava uplatu. |
| Bankarska aplikacija — uvoz slike | Korisnik 10.10.2026. u 18:52 (Europe/Belgrade) potvrdio uvoz PNG slike i podudaranje prikazanog primaoca ADRIATIC TRADE DOO, računa `265201031001135831`, iznosa 598,00 RSD, modela 00 i poziva `20261010654321`. Ručna korisnička potvrda; naziv/verzija aplikacije nisu navedeni. Izvršenje uplate nije predmet testa. |
| Worker i stvarni NBS odgovor | Vraćeni PNG prihvaćen kroz stvarni Worker kod i priložen bez izmene bajtova uhvaćenoj potvrdi u izolovanom okruženju. Porudžbina ostaje nenaplaćena; obične bankarske instrukcije su prisutne. |
| Worker — stvarni NBS zahtev i rok | Zaseban direktan zahtev trajao je 5,901 s. Poziv stvarnog NBS-a kroz lokalni Worker kod prekinut je posle 5,002 s; potvrda ipak uspeva uz instrukcije bez QR-a, naplata ostaje `unpaid`. Ovo proverava stvarni prekid/fallback iz lokalnog okruženja, ne meri Cloudflare produkcionu latenciju. Resend i baza ostaju izolovani. |
| Podaci Adriatic Trade — lokalno | Račun ima 18 cifara i ispravnu mod-97 kontrolu. QR lokalno kodiran i dekodiran bez razlike u sadržaju. Provera ne uključuje bankarsku aplikaciju ili uplatu. |
| Sintaksa i verzije | JavaScript sintaksa, `git diff --check` i usklađenost Worker/deploy/health verzije 4.7.2 uspešni. |
| PR release gate | Node 24 pokreće četiri regresije, workerd/D1/R2 i Chromium testove, sintaksu i verzije. Deploy se preskače za `pull_request`. Konačan status CI vidljiv na PR-u za poslednji commit. |

Testovi pregledača koriste stvarni repo kod uz SQLite adapter za D1, Map zamenu za R2, uhvaćene emailove i kontrolisane NBS odgovore. Spoljni zahtevi pregledača su blokirani; logo se čita lokalno. Nema produkcionih porudžbina, uplata ili slanja emailova kupcima.

## Nalazi ispravljeni tokom provere

- Email više ne tvrdi da je povezani fiskalni PDF priložen ako ga Worker nije učitao. Nedostajući povezani PDF zaustavlja završetak isporuke, a istorijski dokument se ne briše nakon neuspeha.
- Datum termina mora postojati u kalendaru. Promena mesta dobija novu Resend oznaku zahteva; isti datum i vreme više ne potiskuju izmenjenu lokaciju.
- Čuvanje termina ne prepisuje uplatu evidentiranu dok se email šalje. Potvrda ne vraća istovremeno odbijenu porudžbinu u potvrđene niti prepisuje promenjen izbor plaćanja. Konflikt vraća 409 bez događaja o uspešnoj promeni.
- PDF prilog potvrdi kupovine više ne navodi isključivo pouzeće. CI prati i promene u `dokumenti/**`.

## Granice provere

1. Na odvojenom Cloudflare testnom Worker-u proveriti stvarne D1 transakcije, R2 prilog i Resend slanje na kontrolisani testni email, uključujući dostupnost oba javna PDF priloga. Remote testno okruženje i Resend pristupni podaci nisu dostupni u sesiji. Lokalni workerd test zasebno potvrđuje D1 transakcije i R2 priloge; ne predstavlja test udaljenog Cloudflare naloga. Ne slati testove kupcima.
2. Potvrditi sa operaterom proveru izvoda i referencu, uz stvarni fiskalni PDF. Evidencija naplate je ručna; QR generisanje i uvoz slike nisu dokaz izvršene uplate.

Arhitektonska slabost ispravljena u 4.7.2: poslovna promena, događaj i trajni email zahtev sada se upisuju jednom D1 transakcijom pre slanja. Konflikt ili rollback ne šalju poruku. PDF ostaje u R2 za retry, a Resend key i telo su neizmenjivi. Testirani su izgubljena potvrda prijema, paralelni radnici, redosled poruka, istekao lease, stop posle osam pokušaja i 23 sata, te blokirani red bez zastoja drugih porudžbina.

Dodatno uspešno: 16 testova outbox-a; 6 grupa cena/bezbednosti sa promocijom na vremenskoj granici u Beogradu, dostavom ispod/na/iznad 3500 RSD, Turnstile/honeypot i atomskim rate limitom. Lokalni workerd potvrđuje JSON merge, PDF bajtove u R2, rollback i osam istovremenih checkout zahteva: pet prihvaćenih, tri 429. Kurirsko pouzeće ostaje dozvoljeno.

Zvanični NBS primer i ugovor API-ja: [Smernice Generator/Validator](https://ips.nbs.rs/PDF/Smernice_Generator_Validator_latinica_feb2023.pdf).

## Ponovljiva provera

```sh
node tests/admin-operations.mjs
node tests/local-delivery.mjs
node tests/notification-outbox.mjs
node tests/checkout-security.mjs
node --check assets/js/admin.js
node --check worker/adriatic-trade-worker-v4.5.0.js
git diff --check
# Uz prethodno instaliran Playwright/Chromium:
node tests/local-delivery-browser.mjs
```

Detalji opcionalnog pregledača i promenljivih okruženja su u [operativnom uputstvu](LOCAL-DELIVERY-BANK-ONLY.md). Stvarni NBS pozivi, dekodiranje i lokalno QR kodiranje bili su zasebne ručne provere, nisu deo CI testova. Testni NBS PNG: SHA-256 `aa59e65178a3d5b25f88cabe0a00a2fbcd78e825619d0819bab92981b8e18099`. Nisu izvršene uplate, spoljno slanje emailova ili produkcione izmene.
