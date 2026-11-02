# Probni obračun rezervacija — 4.11.0

Nastavak objedinjene probe #19 posle uspešnog čitanja pet Minimax količina u 4.10.3. Razvojna izmena; zahteva novu staging objavu. Produkcija i postojeće kvote se ne menjaju.

## Šta radi

Na istom probnom hostu novo dugme **Proveri probni obračun rezervacija** šalje autentifikovani GET `/admin/minimax-availability`. Nema automatskog poziva pri prijavi, pozadinskog uvoza ili promene prodajnog prijema. Osnovno dugme za pregled zaliha ostaje dostupno.

Obračun uzima postojeće `checkout_admissions`, a ne broj prikazanih porudžbina ili istorijskih nacrta. Uključuje samo četiri poznata sintetička FLOW scenarija; tri stara seed naloga bez prijema/rezervacije se ne oduzimaju. Novo i potvrđeno stanje porudžbine zadržavaju rezervaciju. Otkazivanje, odbijanje ili slanje ne oslobađaju komade automatski: obračun zahteva usaglašavanje.

Količine komponenti dolaze iz sačuvanog `items_json` / `bundleComponents` / `packageVersion`, i moraju se tačno složiti sa sačuvanim `requirements_json`. Promena aktuelnog sastava paketa ne menja već rezervisane jedinice. Potrebni su poznati fizički SKU, cele pozitivne količine i neduplikovan sastav. Nema nagađanja sastava kada snapshot nedostaje.

Postojeći journal sme biti `created` ili `verified`, sa jedinstvenim pozitivnim Minimax ID-jem i neizmenjenim hash-om plana. Veza referencom i zbir fizičkih redova plana moraju odgovarati rezervaciji. Journal u stanju `sending`, `attention`, bez ID-ja ili sa neusklađenim planom blokira obračun pre spoljnog poziva. Rezervacija bez pokušaja prenosa ostaje u obračunu, bez pravljenja novog nacrta.

Minimax prijava i organizacija se proveravaju jednom. Svi povezani postojeći FLOW nacrti sveže se čitaju pre i posle pet stock poziva. Svaki mora i dalje biti nacrt O sa odgovarajućim zaglavljem, redovima, količinama, cenama, ukupnim iznosom, skladištem i načinom probnog plaćanja. Izdati ili izmenjeni dokument blokira ceo obračun. Ovo ne izdaje, menja ili ponovo kreira dokument. Svaki dokument/stock GET ide redom uz pauzu 500 ms, bez retry-ja. Sa četiri vezana nacrta jedan obračun koristi 14 API GET poziva (organizacija + 8 provera nacrta + 5 zaliha) i jednu OAuth prijavu; nije namenjeno čestom osvežavanju ili sinhronizaciji po svakom kupcu.

Lokalni ulazi čitaju se u jednom SELECT-u pre početka i ponovo nakon spoljnih poziva. Potpis obuhvata reviziju, režim i sve rezervacije, odgovarajuće porudžbine i journals. Promena kvote, prijema, porudžbine, rezervacije ili povezanog plana poništava ceo rezultat. Detektuje se i direktno dodat prijem bez promene revizije. Stock API sam po sebi nije atomski presek svih artikala: vremena `startedAt` i `readAt` omeđuju interval; ovim se ne zaključava Minimax.

## Formula i granice

`Probni ostatak = max(0, očitano Minimax stanje − probno rezervisano)`

Ako rezultat pre ograničenja pada ispod nule, prikazuje se manjak; ne prikazuje se negativna raspoloživost. Nepoznata količina ostaje nepoznata i u paketu koji je koristi. Kapacitet paketa je minimum ostataka komponenti podeljenih brojem jedinica po paketu. Kapaciteti paketa se **ne sabiraju** jer dele komade.

Ovo je **simulacija na sintetičkim porudžbinama i očitanom Minimax stanju**, ne stvarna raspoloživost za prodaju. API izričito vraća `salesReady:false`, `quotaWrite:false` i `scope:synthetic-reservation-preview`. Nema upisa, migracije ili DDL-a u novoj ruti, kopiranja u `checkout_stock`, resetovanja kvota/pauze, oslobađanja rezervacije, fakturisanja, email-a ili kurira. Jedini POST prema Minimax-u je OAuth. SQL test adapter odbija svaki upis, uključujući lazy kreiranje šeme.

Status izdatog računa I sam po sebi nije dokaz da je razduženje uključeno u stock odgovor. Pre automatskog prenošenja u prodajne kvote potreban je trajan model veze **porudžbina → potvrđen promet zaliha/razduženje → odgovarajući stock presek**, uz obradu otkaza, povrata, neizvesnih ishoda i drugih prodajnih kanala. Ako je Minimax već oduzeo robu, lokalna rezervacija se ne sme oduzeti drugi put; ako nije, ne sme se osloboditi samo zato što postoji račun. Ovaj dodatak takvo usaglašavanje ne pretpostavlja i blokira računanje kada povezani nacrt izađe iz proverenog probnog stanja.

Zvanični izvori:
- https://moj.minimax.rs/RS/API/Help/Api/GET-api-orgs-organisationId-issuedinvoices-issuedInvoiceId — O nacrt / I izdat račun, sadržaj dokumenta.
- https://help.minimax.rs/help/stockentry-promet-zaliha — poseban promet zaliha, vrsta I izdavanje i status P potvrđen.
- https://moj.minimax.rs/RS/API/Help/Api/GET-api-orgs-organisationId-stocks — pregled stanja, ne identitet porudžbine koja ga je promenila.

## Očekivana korisnička proba

Ostaviti probni prijem pauziran. Ne menjati kvote i ne praviti nove porudžbine/nacrte radi ove probe. Kliknuti novo dugme i proveriti da su uključena četiri postojeća FLOW prijema i da nacrti zadržavaju postojeće ID-jeve.

Ako se od slike od 2.11.2026. u 22:07 CET količine i četiri FLOW rezervacije nisu promenile, očekivana aritmetika je:

| SKU | Prethodno očitano | Probno rezervisano | Očekivani probni ostatak |
| --- | ---: | ---: | ---: |
| 10012 | 300 | 3 | 297 |
| 10086 | 780 | 7 | 773 |
| 10240 | 120 | 6 | 114 |
| 10306 | 1728 | 5 | 1723 |
| 10307 | 576 | 5 | 571 |

To su očekivanja, ne novo živo očitavanje. Ako je neki nacrt izdat/izmenjen ili evidencija nije usklađena, očekuje se blokada i objašnjenje. Ne menjati dokument u Minimax-u da bi se forsirao prolaz probe. Stvarno čitanje novog obračuna čeka staging objavu i potvrdu vlasnika.

## Validacija

`tests/minimax-reservations.mjs` proverava četiri prijema, stare seed porudžbine, ponavljanja, sačuvane sastave, unknown/0/negativno/manjak, neizvesne journals, izdat/izmenjen/nestao dokument, promene tokom čitanja i zaštite nove rute. Svi Minimax odgovori su simulirani; nema stvarnog izdavanja.

Pravi workerd/D1 proverava kombinovani tok, zatim obračun četiri rezervacije i blokadu nakon promene statusa spoljnog nacrta, uz nepromenjene kvote, journals i broj invoice POST-ova. Browser 1440/390/320 px proverava prikaz formule i kapaciteta, brisanje prethodnog rezultata nakon blokade i kasni odgovor posle odjave.

## Tabelarni prikaz

Na zahtev vlasnika, posle uspešne žive probe 4.11.0, kartice su zamenjene tabelama. Artikli prikazuju šifru, naziv, Minimax stanje, rezervisano i probni ostatak u istom redu; osnovno očitavanje prikazuje prve tri kolone. Paketi su u zasebnoj tabeli naziv/kapacitet. Količine su desno poravnate, sa tabularnim ciframa. Na telefonu se šira tabela pomera horizontalno u svom okviru, uz stalno vidljivu šifru; nema vertikalnog skrola unutar tabele. Nepoznato, negativno stanje i manjak ostaju vidljivi. Menjaju se samo prikaz, CSS i verzije asset-a; Worker/API, formula i kvote ostaju isti.

## Nastavak: prelaz na robno razduženje

Vlasnik je potvrdio uključeno automatsko razduženje po izdatom računu. Razvojni model prelaza i granice povezivanja opisani su u `docs/MINIMAX-RESERVATION-HANDOFF.md`. Model je odvojen, offline i nije pozvan iz Workera. Aktivni probni obračun i dalje blokira izdat dokument; nema automatskog oslobađanja rezervacija.
