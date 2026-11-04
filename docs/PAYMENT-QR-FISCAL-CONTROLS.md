# Platni QR i provera originalnog fiskalnog dokumenta — 4.13.0

Ovo izdanje priprema početak prodaje uz postojeću pauzu prijema. Izmena koda sama ne otvara prodaju, ne izdaje fiskalni račun i ne izvršava uplatu. Objava zahteva postojeći release postupak i odobreni commit.

Organizacija novih originala po godini/mesecu i dodatna OneDrive kopija opisani su u [uputstvu za arhivu](../tools/fiscal-archive/UPUTSTVO.md). Za preuzimanje postoji poseban ključ samo za čitanje. Aktivacija ovog toka, Windows provera i stvarna OneDrive sinhronizacija odvojeni su koraci od lokalnih testova.

## Uplata na račun

NBS IPS QR (`K:PR`) popunjava nalog za prenos na račun firme. Nije fiskalni QR niti ugovoreno IPS prihvatanje na internet prodajnom mestu (`EK`) ili fizičkom prodajnom mestu (`PT`). Za ugovoreno prihvatanje potrebna je banka prihvatilac; ovaj kod ne uvodi takvu integraciju.

- Nove maloprodajne instrukcije koriste šifru **221**, isti fiksni račun `265-2010310011358-31`, naziv primaoca i iznos iz sačuvane porudžbine. `289` je dozvoljen za naloge građana, ali nije univerzalna šifra za pravna lica. Veleprodajni tok nije uveden ovom izmenom.
- Generator i dalje koristi isključivo zvanični HTTPS NBS API. Podaci platioca i broj njegovog računa ne šalju se generatoru. Nema proizvoljnog primaoca, URL-a servisa ili iznosa iz korisničkog obrasca.
- Iznos mora biti pozitivan, u tačnim parama i do 300.000 RSD. To je više od dozvoljenog iznosa aktuelnih webshop porudžbina. Nije uvedeno zaokruživanje neispravnog iznosa.
- Za sadašnje oznake `AT-YYYYMMDD-NNNNNN` numerički poziv ostaje isti. Za ostale podržane alfanumeričke oznake čuva se cela oznaka (do 23 znaka), bez izbacivanja slova ili skraćivanja. Model ostaje **00**.
- Pri potvrdi nove lokalne porudžbine ista polja QR-a i običnih instrukcija zamrzavaju se u istoriji `payment_instructions`, u istoj transakciji kao potvrda i outbox. Kasnije se ne preračunavaju drugačije; promena iznosa blokira generisanje iz sačuvane instrukcije.
- Ranije potvrđene porudžbine bez tog zapisa zadržavaju prethodni poziv i šifru 289. Ranije saopštene instrukcije ne menjaju se prećutno. Kod starih alfanumeričkih oznaka poziv nije jedinstven; uplatu obavezno usaglasiti i po iznosu, platiocu i svrsi. Njihova naplata se ne automatizuje.
- QR ne znači da je novac primljen. Banka kupca može omogućiti promenu iznosa pri plaćanju. Operater poredi stvarni priliv, iznos i referencu sa porudžbinom, a zatim evidentira datum i referencu izvoda.

## Originalni fiskalni dokument

Fiskalni QR / verifikacioni link nastaje isključivo u Minimax ESIR/PFR postupku. Originalni PDF se ne rekonstruiše, ne spaja sa drugim dokumentom i u njega se ne dodaje platni QR. Platne instrukcije su u posebnom email bloku i PNG prilogu.

Za novu prodaju i punu refundaciju server zahteva:

1. Originalni PDF do 5 MB, uključujući opciju da je dokument već poslat iz Minimax-a. Taj izbor arhivira original i evidentira prethodno slanje; ne šalje ga ponovo.
2. Potvrdu da je priložen neizmenjen originalni PDF. Za lokalnu uplatu traži se i potvrda postupanja sa eventualnim avansom i konačnim računom u Minimax-u; to ne zahteva otvaranje portala Poreske uprave.
3. Postojeće provere jedinstvenosti PFR broja, iznosa i primaoca, izvornog sastava/cena porudžbine, revizije i dostave emaila ostaju obavezne. Isti PDF ne može biti povezan sa drugim PFR brojem; jedinstveni indeks nad hashom dokumenta čuva ovu kontrolu i kada provera na portalu nije evidentirana.

### Provera na portalu je opciona

**Ručna provera na portalu Poreske uprave nije uslov za čuvanje/slanje računa, predaju kuriru ili ličnu isporuku.** U obrascu je podrazumevano isključena i njena polja su skrivena i onemogućena. Operater može uključiti „Želim da evidentiram proveru na portalu Poreske uprave (opciono)“, ili dodati proveru naknadno uz postojeći račun, bez ponovnog izdavanja i slanja. Preskakanje se prikazuje kao „Nije evidentirana (opciono)“, bez pripisivanja uspešne provere.

Ako operater izabere evidenciju provere, potrebni su produkcioni verifikacioni link kopiran iz originala (HTTPS, tačan host `suf.purs.gov.rs`, putanja `/v/` ili `/v`, jedan `vl` parametar), PIB izdavaoca **115051176**, odgovarajuća vrsta Promet–prodaja / Promet–refundacija i potvrde poređenja podataka sa zvaničnim portalom. Delimična ili neispravna provera se odbija; operater može da je dovrši ili isključi pre slanja obrasca. Sandbox i druga odredišta se odbijaju. Link se ne otvara serverskim pozivom.

Izabrana provera se upisuje u `fiscal_reviews`: PFR, SHA-256 originala, verifikacioni link, PIB, vrsta, vreme, potvrđene kontrole, beleška i verzija `manual-portal-v1`. Dokument, opciona provera, CAS zaštita, audit i email se upisuju transakciono. Kod neuspeha briše se samo novi neuspešno povezani R2 objekat; postojeći original se ne prepisuje.

**Evidencija označava ručnu proveru, ne automatsku potvrdu autentičnosti.** Server proverava odredište i oblik linka i prisustvo izjava samo kada se provera evidentira. Ne tumači PDF, ne dekodira njegov fiskalni QR, ne proverava digitalni potpis niti da URL zaista pripada priloženom dokumentu. HTTP uspeh NBS generatora ne dokazuje fiskalnu ispravnost. Potvrde u testovima su isključivo sintetičke.

Preporučuje se detaljna portalska provera prvih stvarnih računa, nakon promena fiskalnog toka, kod sumnjivih slučajeva i povremeno na uzorku. Ovo je interna kontrola; ne predstavlja tvrdnju da zakon nalaže ručno otvaranje svakog računa na portalu.

Raniji zapis bez provere ne dobija automatski status proverenog. Ako nedostaje originalni PDF, zahtev za arhivom ostaje; obrazac za dopunu omogućava prilaganje istog originala bez obavezne portalske provere. Ranije izvršena isporuka se ne poništava.

## Pre prve stvarne prodaje

U Minimax-u isključiti Obuku tek po završetku testova i odobrenju početka prodaje. Za prvo stvarno izdavanje proveriti originalni verifikacioni link, produkcioni status, PIB, PFR, datum/vreme, sve stavke, porez, način plaćanja i iznos. Uporediti račun firme sa bankarskim izvodom/JRR. Uplata unapred zahteva odgovarajući avansni/konačni postupak u Minimax-u; panel ga ne izdaje niti ga zamenjuje.

## Izvori provereni 3.11.2026.

- [Izmena Zakona o fiskalizaciji, Sl. glasnik RS 80/2026](https://www.parlament.gov.rs/upload/archive/files/cir/pdf/zakoni/14_saziv/2591-26.pdf): član 12, st. 5–6, neispravni/lažni fiskalni QR i naknadno izmenjeni dokumenti.
- [NBS smernice Generator/Validator API](https://ips.nbs.rs/PDF/Smernice_Generator_Validator_latinica.pdf): generator, validator, oznaka NBS IPS QR, razlika između PR i ugovorenog IPS prihvatanja.
- [NBS preporuke za pripremu zapisa](https://ips.nbs.rs/PDF/pdfPreporukeValidacija.pdf): polja, šifra 221/289 i model 00.
- [Minimax — Promet prodaja i promet refundacija](https://help.minimax.rs/help/promet-prodaja-i-promet-refundacija): originalni PDF, QR i verifikacioni link, izdavanje i slanje.
- [Poreska uprava — Verify Invoice](https://tap.suf.purs.gov.rs/help/Home/ExportToPdf?file=Verify-Invoice&hash=1438916668): dokumentovani API zahteva odgovarajući TaxCore autentifikacioni token. Taj pristup nije deo postojeće integracije.
