# Provera pre produkcije — 10.10.2026.

Razvojna grana: `fix/local-delivery-bank-only`, Worker 4.7.1, [draft PR #8](https://github.com/goranlazarevic-rs/adriatic-trade/pull/8).

Automatizovane i lokalne vizuelne provere su uspešne. Stvarna integracija sa bankarskom aplikacijom, Resend isporukom i Cloudflare testnim resursima još nije potvrđena. Ovaj rezultat nije odobrenje za produkciono puštanje; main, produkcioni Worker i podaci kupaca nisu menjani.

## Rezultati

| Provera | Rezultat i granica provere |
| --- | --- |
| Regresija lične dostave | 34/34 uspešno: zabrana gotovine, IPS i transfer, pet QR grešaka, provera uplate, istorija, refundacije, ponovljeni i konkurentni zahtevi, PDF i kurirski tok. |
| Postojeća operativna regresija | Sve četiri grupe uspešne: stanja, naplata, evidencija, verzionisanje, izvoz, filteri i administratorski prikaz. |
| Pregledač — računar | Chromium 153, 1440 × 1000: odobrenje → IPS nedostupan → potvrda sa bankarskim instrukcijama → termin → obavezna provera uplate → isporuka → PDF preuzimanje. |
| Pregledač — telefon | Chromium 153, 390 × 844: eksplicitni bankarski transfer, isti kompletan tok. Nema dugmeta Gotovina, JavaScript grešaka ili horizontalnog prelivanja. Ovo je mobilna širina desktop Chromium-a, nije fizički telefon/Safari. |
| Kupčevi emailovi | Šest prikaza (tri emaila na obe širine) provereno vizuelno; logo, bankarski podaci, rok/mesto i PDF obaveštenje čitljivi. Sadržaj i prilozi potvrđeni u uhvaćenim Resend zahtevima. Stvarna isporuka i Gmail/Outlook prikaz nisu testirani. |
| PDF obaveštenje | Sve tri strane renderovane i pregledane. Plaćanje usklađeno sa IPS/računom za ličnu dostavu; uklonjena pretpostavka isključivog pouzeća iz pasusa o povraćaju. Ostali sadržaj sačuvan, verzija 10.10.2026. Obrazac za odustanak nije menjan. |
| PDF uz isporuku | Upload, čuvanje, ponovno prilaganje postojećeg PDF-a i download uspešni. Greška emaila briše samo novi prilog; povezani istorijski prilog ostaje. Nije korišćen stvarni fiskalni dokument kupca. |
| NBS javni primer — stvarni servis | HTTP 200, `image/png`, 500 × 500; QR dekodiran i račun/iznos odgovaraju zvaničnom javnom primeru. Zahtev nije sadržao podatke Adriatic Trade. |
| Podaci Adriatic Trade — lokalno | Račun ima 18 cifara i ispravnu mod-97 kontrolu. QR lokalno kodiran i dekodiran bez razlike u sadržaju. Ovo ne dokazuje prihvatanje konkretnog naloga u NBS-u ili bankarskoj aplikaciji. |
| Sintaksa i verzije | JavaScript sintaksa, `git diff --check` i usklađenost Worker/deploy/health verzije 4.7.1 uspešni. |
| PR release gate | Node 24 pokreće obe regresije i proveru sintakse/verzija. Deploy se preskače za `pull_request`; promena ostaje u draft PR-u. Konačan status CI vidljiv na PR-u za poslednji commit. |

Testovi pregledača koriste stvarni repo kod uz SQLite adapter za D1, Map zamenu za R2, uhvaćene emailove i kontrolisane NBS odgovore. Spoljni zahtevi pregledača su blokirani; logo se čita lokalno. Nema produkcionih porudžbina, uplata ili slanja emailova kupcima.

## Nalazi ispravljeni tokom provere

- Email više ne tvrdi da je povezani fiskalni PDF priložen ako ga Worker nije učitao. Nedostajući povezani PDF zaustavlja završetak isporuke, a istorijski dokument se ne briše nakon neuspeha.
- Datum termina mora postojati u kalendaru. Promena mesta dobija novu Resend oznaku zahteva; isti datum i vreme više ne potiskuju izmenjenu lokaciju.
- Čuvanje termina ne prepisuje uplatu evidentiranu dok se email šalje. Potvrda ne vraća istovremeno odbijenu porudžbinu u potvrđene niti prepisuje promenjen izbor plaćanja. Konflikt vraća 409 bez događaja o uspešnoj promeni.
- PDF prilog potvrdi kupovine više ne navodi isključivo pouzeće. CI prati i promene u `dokumenti/**`.

## Preostalo pre produkcionog odobrenja

1. Generisati QR na stvarnom NBS servisu sa računom/nazivom/adresom Adriatic Trade i sintetičkom porudžbinom, pa ga uvesti u bankarsku aplikaciju bez izvršenja uplate. Poziv sa podacima firme blokiran je automatskom proverom odobrenja i zahteva izričito odobrenje korisnika. Bezbednija provera javnog NBS primera je izvršena.
2. Na odvojenom Cloudflare testnom Worker-u proveriti stvarne D1 transakcije, R2 prilog i Resend slanje na kontrolisani testni email, uključujući dostupnost oba javna PDF priloga. Takvo okruženje i pristupni podaci nisu obezbeđeni u ovoj sesiji. Ne slati testove kupcima.
3. Potvrditi sa operaterom proveru izvoda i referencu, uz stvarni fiskalni PDF. Evidencija naplate je ručna; QR generisanje nije dokaz izvršene uplate.

Preostala arhitektonska granica: slanje emaila prethodi D1 transakciji. Proverena zaštita sprečava prepisivanje statusa/naplate, ali ako drugi administrator promeni porudžbinu tokom slanja, kupac može primiti email iako zahtev završi konfliktom 409. Nema transakcionog reda za emailove. Za probu i rad koristiti jednu aktivnu akciju nad istom porudžbinom i razrešiti svaki konflikt pregledom istorije; ne pretpostavljati da 409 opoziva već poslat email.

Zvanični NBS primer i ugovor API-ja: [Smernice Generator/Validator](https://ips.nbs.rs/PDF/Smernice_Generator_Validator_latinica_feb2023.pdf).

## Ponovljiva provera

```sh
node tests/admin-operations.mjs
node tests/local-delivery.mjs
node --check assets/js/admin.js
node --check worker/adriatic-trade-worker-v4.5.0.js
git diff --check
# Uz prethodno instaliran Playwright/Chromium:
node tests/local-delivery-browser.mjs
```

Detalji opcionalnog pregledača i promenljivih okruženja su u [operativnom uputstvu](LOCAL-DELIVERY-BANK-ONLY.md). Provera NBS javnog primera i lokalnog QR kodiranja bila je zasebna ručna provera, nije deo CI testova.
