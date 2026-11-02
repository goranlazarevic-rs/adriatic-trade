# Prelaz rezervacije na Minimax razduženje — razvojni model

## Potvrđena poslovna odluka

Vlasnik je 2.11.2026. potvrdio da je u Minimax podešavanju organizacije označeno **Smanjivanje zaliha neposredno računom**. To je korisnička potvrda podešavanja, bez nezavisne autentifikovane provere agenta. Planirani tok je prijem porudžbine → rezervacija komponenti → izdavanje računa i automatsko razduženje u Minimax-u → prestanak ponovnog odbitka iste rezervacije.

Zvanično uputstvo opisuje automatsko razduženje pri izdavanju uz ovu opciju:
https://help.minimax.rs/help/--rad-u-zalihama-veleprodaje--objasnjenje-kompletnog-postupka--

## Šta je implementirano

`tools/minimax-reconciliation/model.mjs` je čist, deterministički obračun jednog preseka. Nema mreže, pristupa bazi, tajni, izdavanja dokumenata, kopiranja kvota ili promene istorije. Trenutno prihvata samo četiri sintetička FLOW scenarija, pet fizičkih SKU i organizaciju 81179 / skladište 40999. **Worker ga još ne poziva. Ne postoji nova ruta ili aktivacija u adminu.** Worker ostaje 4.11.0; postojeće čitanje zaliha i rezervacija ostaje isto.

| Korak u modelu | Minimax stanje | Ukupna rezervacija | Već uključeno u stanje | Preostali odbitak | Probni ostatak |
| --- | ---: | ---: | ---: | ---: | ---: |
| Prijem / nacrt | 100 | 2 | 0 | 2 | 98 |
| Izdat račun, uključivanje razduženja još nedokazano | — | 2 | Nepotvrđeno | Obračun blokiran | Nepotvrđeno |
| Potvrđeno razduženje obuhvaćeno očitanjem | 98 | 2 | 2 | 0 | 98 |
| Ponovljen isti obračun | 98 | 2 | 2 | 0 | 98 |

Istorijska rezervacija ostaje evidentirana. Računa se `max(0, Minimax količina − još neobuhvaćene rezervacije)`. Ne dodaje se roba nazad u Minimax i ne briše se prijem. Nepoznato stanje ostaje nepoznato; manjak i negativno stanje ostaju konzervativni. Paketi koriste sačuvane fizičke komponente iz rezervacije, bez ponovnog obračuna po aktuelnom sastavu ili ceni. Dostava nije fizička zaliha.

## Ugovor sa budućim adapterom

Ulazne strukture u modelu su **naš interni ugovor**, ne dokumentovana Minimax API polja. Posebno, `includedMovements`, `planHash`, `localSnapshotBefore/After` i `previousHandoffs` nisu polja koja vraća Minimax stock GET. Testni fixture ih namerno konstruiše. Prolaz testa ne dokazuje postojanje živog izvora tih podataka.

Adapter mora da obezbedi:

1. Nepromenjen potpis svih lokalnih prijema, sačuvanih sastava, journals i kontrolnih podataka pre i posle čitanja. Sam broj revizije nije dovoljan.
2. Jedinstvenu vezu porudžbine sa već poznatim računom, uz proveru sačuvanog plana, vrste računa, reference, fizičkih količina i skladišta. Avans, storno, neizvestan ishod ili izmenjen dokument blokiraju prelaz.
3. Jedinstvenu, pouzdanu vezu tog računa sa potvrđenim robnim izlazom. Isti izlaz ne sme pokriti dve porudžbine. Delimična isporuka ili povrat nisu podržani ovim modelom i zahtevaju zasebno usaglašavanje.
4. Dokaz da je konkretan izlaz, u istoj verziji, već uključen u konkretno očitano stanje. Raniji timestamp GET-a i pad količine nisu dokaz uključivanja. Verzije i statusi dokumenata proveravaju se pre i posle intervala očitavanja; promena blokira ceo rezultat.
5. Trajno sačuvanu istoriju prethodnih prelaza. Model vraća `proposedHandoffs`; ništa ne upisuje. Budući adapter mora učitati ceo prethodni ledger i atomski sačuvati predlog uz nepromenjen lokalni potpis, pre objavljivanja operativne raspoloživosti. Povratak računa u nacrt, brisanje istorijskog prijema ili promena ranije razduženih komponenti/izlaza ne oslobađaju robu automatski.

Rezultat izričito nosi `scope: synthetic-handoff-model`, `modelOnly:true`, `salesReady:false`, `quotaWrite:false`. To nije dokaz spremnosti za prodaju ili proizvodni adapter. Čak i ispravno izračunat model zahteva rešene poslovne preduslove i kontrolisano objavljivanje.

## Šta još sprečava živo povezivanje

Pregledani dokumentovani modeli `GetIssuedInvoice`, `GetStockEntry` i njihovih redova ne prikazuju direktan ID veze račun–robni izlaz. `GetStocks` ne vraća listu izlaza uključenih u odgovor niti zajednički atomski presek. To je granica pregledane dokumentacije, ne tvrdnja da Minimax nema nikakav drugi način povezivanja.

- https://moj.minimax.rs/RS/API/Help/Api/GET-api-orgs-organisationId-issuedinvoices-issuedInvoiceId
- https://moj.minimax.rs/RS/API/Help/Api/GET-api-orgs-organisationId-stockentry-stockEntryId
- https://moj.minimax.rs/RS/API/Help/Api/GET-api-orgs-organisationId-stocks
- https://moj.minimax.rs/RS/API/Home/ChangeLog — 1.2022 opisuje AssociationWithStock / AssociationWithIssuedInvoice kao oznake za pregled nepovezanih dokumenata; ne koristimo ih kao identitet robnog izlaza ili dokaz njegovog uključivanja u stanje.
- https://help.minimax.rs/help/da-li-mozemo-naknadno-povezati-izdavanje-i-izdati-racun — račun i robni izlaz mogu postojati odvojeno.

Precizno pitanje za Minimax tehničku podršku (pripremljeno, **nije poslato**):

> Uz uključeno Smanjivanje zaliha neposredno računom, kojim dokumentovanim read-only API poljem ili metodom za poznati IssuedInvoiceId dobijamo ID automatski nastalog potvrđenog StockEntry? Da li uspešan issue i naknadni Status=I garantuju da GetStocks za isti magacin već obuhvata taj izlaz; postoji li odlaganje ili način potvrde završenog robnog knjiženja? Kako preko API-ja pratimo naknadno storniranje, vraćanje u nacrt i povrat robe?

Bez tog odgovora ili odgovarajućeg dokaza iz odobrenog izolovanog okruženja, ne povezujemo ovaj model sa automatskim prestankom odbitka rezervacije. Ne nagađamo vezu po datumu, stranci, opisu ili istim količinama. Ako dokumentovani ugovor garantuje atomsko automatsko razduženje uz izdavanje, adapter se može osloniti na taj potvrđeni ugovor umesto na izmišljeno API polje.

## Provera bez izdavanja

Pokretanje: `node --test tests/minimax-handoff.mjs`.

Testovi proveravaju 100→98, ponavljanje sa i bez već sačuvanog prelaza, mešavinu četiri stvarne strukture FLOW prijema iz izolovane SQLite fixture baze, sačuvani drugačiji sastav paketa, zastarele/promenjene dokaze, nepoznato/negativno stanje, pogrešnu vezu/skladište/organizaciju, avans, neizvestan ishod, storno, delimičan izlaz, povrat, duplikate i istorijske promene. Svi dokazi su simulirani; koristi se stvarni lokalni `mmReservationSnapshot` za četiri prijema. Poziva stvarnog Minimax-a nema.

Postojeći unit, workerd/D1 i browser testovi i dalje proveravaju prethodni aktivni tok. Postojećih sedam probnih nacrta ne treba izdavati, brisati ili ponovo kreirati za ovu razvojnu proveru. Nema potrebe za staging objavom samo zbog ovog odvojenog modela. Produkcija, pauza, kvote i zalihe nisu promenjeni.
