# Kontakt i B2B forme — predlog izdanja 4.8.0 (28.10.2026.)

Status: razvojna grana / pregled. Nema produkcionog deploy-a, stvarnih test poruka ni izmena DNS/MX/SPF/DKIM/DMARC zapisa. Osnova: `main` b9408295752c5f9d9748ece040653b3e5f8d62c3, Worker 4.7.2. Putanja Worker fajla ostaje postojeća zbog release workflow-a.

## Odluka i poređenje

| Rešenje | Šta obezbeđuje | Ograničenje / održavanje |
| --- | --- | --- |
| Postojeći FormSubmit.co AJAX + `_captcha=false` + `_honey` | Jednostavan prijem bez našeg servera; honeypot; dobavljač navodi dodatni inteligentni spam filter | reCAPTCHA je isključen. Nema dokumentovane kontrole našeg serverskog limita i idempotentnog prijema u ovom toku. Zavisi od aktivacije forme i email isporuke. Ne tvrdimo da FormSubmit nema druge zaštite. |
| Ponovo uključiti FormSubmit reCAPTCHA | Najmanja izmena za osnovnu zaštitu | I dalje nema našeg atomskog ograničenja, trajne evidencije prijema i kontrolisanog retry-a; dokumentacija ne potvrđuje da samo dodavanje Turnstile polja na ovaj `.co` AJAX endpoint nameće serversku proveru. |
| **Postojeći Worker + Turnstile + D1 + Resend** | Serverska validacija, proverljiv limit, idempotentni prijem, trajni red sa retry-em | Malo dodatnog koda u postojećem Worker-u; dve automatski kreirane D1 tabele, bez novog naloga, servisa, tajne, baze ili cron rasporeda. Izabrano. |

FormSubmit.co i FormSubmit.app nisu izjednačeni u ovoj proceni. Ne dodajemo FormSubmit proxy: javni stari endpoint bi ostao put koji zaobilazi našu zaštitu, uz još jednog posrednika koji dobija podatke.

Izvori (provereni 28.10.2026.):

- https://formsubmit.co/documentation — `_captcha`, `_honey`, `_blacklist`.
- https://formsubmit.co/ajax-documentation — postojeći AJAX protokol.
- https://formsubmit.co/help — dodatni spam filter, aktivacija, spam sanduče i obavezni `name` atributi.
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ — obavezni Siteverify, jednokratni token važi 300 sekundi, hostname/action.
- https://resend.com/changelog/idempotency-keys — isti ključ i isti payload, rok 24 sata.

## Tok i zaštite

`kontakt.html` i `saradnja.html` koriste zajednički `assets/js/inquiry-forms.js` i POST `/inquiry`. Nema automatskog povratka na nezaštićen FormSubmit. Izostanak JavaScript-a ili zaštite ostavlja vidljivu email alternativu. Native POST nije JSON i server ga odbija.

- Obe saglasnosti su `name="Saglasnost" value="Da" required`; server zahteva baš `Da`. Saglasnost ide u poslovni email, nije marketinška pretplata.
- Ime, validan email i neprazna poruka su obavezni; B2B dodatno kompanija i dozvoljen tip saradnje. Server odbija razmake umesto sadržaja, pogrešne tipove, prekoračene dužine, kontrolne znakove i dodatna polja. Ograničenja: ime 120, email/kompanija 160, telefon 60, poruka 5000 znakova. Ograničenje stvarno pročitanog tela je 20.000 bajtova i bez `Content-Length`.
- CORS/Origin dozvoljavaju samo dve postojeće produkcione adrese. Origin nije zamena za bot zaštitu. Nedostupna konfiguracija, D1 ili pouzdan Cloudflare IP daju grešku, bez slanja.
- `/inquiry/config` izdaje vremenski ticket potpisan HMAC-om: najmanje 800 ms od izdavanja, najviše 24 h. To je dodatni signal protiv prostih botova, ne dokaz da je korisnik čovek.
- Turnstile se obavezno proverava na serveru. Samo `success: true`, dozvoljen hostname i action `inquiry_contact` odnosno `inquiry_b2b` prolaze; checkout token nije dovoljan. Siteverify ima ukupni timeout 8 s. Honeypot mora ostati prazan.
- Pre Siteverify-a: najviše 20 pokušaja po IP-u u fiksnom prozoru od 10 minuta. Posle provere: najviše pet novih upita po IP-u u kliznom satu, zajednički za obe forme. D1 upsert/insert je atomski; konkurentni zahtevi ne preskaču limit. HTTP 429 ima `Retry-After` (600 ili 3600 s).
- Nasumični submission UUID se zadržava pri retry-u neizmenjenog sadržaja u otvorenoj stranici. UNIQUE ograničenja sprečavaju duplikate istog ID-a i potpuno istog normalizovanog sadržaja i tokom konkurentnih zahteva. Isti sadržaj sa novim ID-em se ne šalje ponovo u roku do 24 sata; izmenjeni sadržaj sa već korišćenim ID-em daje 409. Za ID-eve se čuva tehnički zapis do sedam dana. Posle tog roka novi upit može biti nova poruka.
- Prihvaćen upit znači da je **trajno sačuvan**, ne da je već u inbox-u. Samo eksplicitni JSON `ok:true, accepted:true, delivery:pending|sent` vodi na stranicu potvrde. HTTP 200 sa praznim/neispravnim JSON-om nije uspeh.
- Dugme je zaključano tokom slanja. Greške, timeout 12 s, kvar zaštite i 429 čuvaju unete podatke u DOM-u, bez automatskog ponovnog slanja. Ponovna provera zaštite je dostupna bez gubitka podataka. Osvežavanje stranice briše sadržaj jer se ne skladišti u pregledaču.

## Dostava i nadzor

`inquiry_outbox` je odvojen od porudžbina, njihovih stanja i `notification_outbox` tabele. Prijem upita pokreće početni pokušaj u `waitUntil`; postojeći cron na pet minuta nastavlja neuspele pokušaje. Pri prekinutom odgovoru ili restartu Worker-a red ostaje u D1.

Slanje ima lease od 90 s i Resend ključ `inquiry/<id>`, uz nepromenjen email payload tokom retry-a. Timeout email poziva je 20 s. Backoff raste do jednog sata. Posle 23 sata od prvog pokušaja nema automatskog slanja zbog Resend roka idempotentnosti od 24 sata. `attention` zahteva proveru u Resend-u pre bilo kog ručnog prosleđivanja. Sadržaj reda briše se po isteku 24 sata i kada slanje nije uspelo: ovo je nameran kompromis privatnosti, pa produžen kvar zahteva operativnu proveru, ne beskonačno čuvanje i retry.

Autentifikovani `GET /admin/inquiries` koristi postojeći administratorski pristup i vraća poslednjih 100 ID-eva, vremena, broja pokušaja i statusa, bez sadržaja i podataka pošiljaoca. Prikaz nije dodat u admin UI. Primer provere u postojećem administratorskom alatu: pozvati ovu putanju sa postojećim Bearer tokenom; ne stavljati token u URL ili dokumente. U Resend-u pronaći ID iz subject-a/ključa. `pending` se proverava ako traje duže od uobičajenog backoff-a; `attention` zahteva ručnu proveru. Nema novog sistema alarmiranja.

Email ide samo na `info@adriatictrade.rs`, iz postojećeg verifikovanog `FROM_EMAIL`; adresa pošiljaoca je samo `reply_to`. Nema autoresponder-a ka proizvoljnoj adresi. Poruka je plain text, bez izvršavanja HTML-a iz korisničkog sadržaja. Prihvatanje od Resend-a nije potvrda isporuke u inbox; stvarna dostava i spam pravila sandučeta ostaju zasebna provera.

## Privatnost i rokovi

U D1 nema sirovih IP adresa: heševi za limit i sadržaj koriste postojeći tajni pepper. Zahtevi i tokeni se ne loguju, a statusni API ne vraća PII. Sadržaj email payload-a se uklanja odmah po potvrdi Resend-a; ostatak sadržaja, IP i content heš uklanjaju se posle 24 h pri sledećem cron-u/zahtevu. Submission heš/ID/status se uklanjaju posle sedam dana pri sledećoj obradi. Ako se Worker/cron potpuno zaustavi, čišćenje se nastavlja tek kada obrada proradi. Ovo nisu rokovi za D1 backup, Cloudflare/Resend interne logove ili poslovni inbox. Politika privatnosti opisuje novi tok i ovo razgraničenje.

Nema sadržaja upita u URL-u, browser skladištu ili analytics događajima. Turnstile dobija tehničke podatke i token, ne polja upita.

## Aktiviranje — samo uz odobrenje

**Ne spajati kao rutinsku izmenu sajta.** GitHub Pages objavljuje HTML pri merge-u, dok Worker zahteva zaseban ručno odobren deploy. Ako se novi frontend pojavi pre Worker-a 4.8.0, slanje je privremeno onemogućeno uz email alternativu. Stari frontend bi i posle deploy-a Worker-a nastavio da koristi FormSubmit dok se Pages/cache ne osveže.

Za aktiviranje je potreban unapred odobren zajednički release prozor: obezbediti da novi Pages sadržaj ne ode pre spremnog Worker-a (privremeno zadržavanje Pages objave), spojiti pregledani kod, sačekati validaciju tačnog `main` SHA, izvršiti postojeći ručni Worker release uz `worker-production` odobrenje i taj SHA, proveriti health 4.8.0 + `inquiries:true`, pa pustiti Pages. Alternativa je izričito odobren kratak period nedostupnosti formi između Pages objave i ručnog Worker deploy-a. Ova grana ne menja Pages/Cloudflare podešavanja niti izvršava te korake.

Postojeći `DB`, `RESEND_API_KEY`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` i `SECURITY_PEPPER` moraju biti dostupni; nema novih tajni. Potvrditi da postojeći Turnstile widget dozvoljava oba produkciona hostname-a. Dve tabele se kreiraju u Worker-u; nema destruktivne migracije niti pristupa starim redovima porudžbina.

Stari FormSubmit.co endpoint je ranije javno objavljen. Uklanjanje sa stranica ga ne deaktivira: posle odobrene migracije vlasnik treba kroz FormSubmit postupak da deaktivira stare forme i potvrdi da više ne prosleđuju direktne POST-ove. To zahteva vlasničku email potvrdu i nije urađeno u ovom radu. Bez toga stari poznati endpoint i dalje može nezavisno slati na inbox.

Rollback se planira za oba dela: vratiti prethodni Pages frontend i, samo uz odobrenje, poznati Worker 4.7.2. Ne brisati upite iz reda; prvo proveriti status i Resend zbog mogućeg već prihvaćenog emaila. Povratak starog frontenda vraća i ranija FormSubmit ograničenja. Nema automatskog deploy-a na push/PR; release gate ostaje na snazi.

## Automatizovana provera

- `node tests/inquiry-security.mjs`: validacija, saglasnost, injection, stream limit, configuration/D1 fail-closed, potpis/vreme ticketa, Turnstile action/hostname/expiry/replay odgovor, oba limita i konkurentnost, deduplikacija, lease/retry, rokovi i privatni statusni API.
- `MINIFLARE_MODULE_PATH=<miniflare> node tests/inquiry-runtime.mjs`: stvarni lokalni workerd/D1, konkurentni limit 5/8, Siteverify kvar, trajni red, cron retry, isti email ključevi i brisanje sadržaja.
- `PLAYWRIGHT_MODULE_PATH=<playwright> node tests/inquiry-browser.mjs`: desktop/mobilni obe forme, HTML validacija i saglasnost, greške i neispravan JSON, 429, izgubljena potvrda, retry, kvar zaštite, JavaScript isključen. Svi HTTP pozivi se presreću lokalno.
- Postojeći admin, naplata, porudžbine, outbox, Cloudflare runtime, browser i release-gate testovi ostaju u CI-u.

Nijedan test ne šalje stvarne poruke. Produkcioni Turnstile i stvarna inbox dostava nisu testirani ovim sintetičkim testovima.

Lokalni rezultat 28.10.2026.: svih 14 novih Node regresija prolazi; novi workerd/D1 test prolazi; kontakt i B2B browser tokovi prolaze na 1440 px i 390 px, uključujući dvostruki submit, whitespace polja, timeout odgovora i offline retry. Prolaze i postojeći admin, 34 naplata/isporuka, 16 outbox i šest checkout testova, postojeći Cloudflare runtime, oba admin browser toka i release-gate regresije. Lokalni Chromium 153 je korišćen sa Playwright-om; CI instalira sopstveni Chromium. Nisu slati stvarni emailovi.
