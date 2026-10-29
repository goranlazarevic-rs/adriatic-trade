# Fiskalizacija Adriatic Trade webshopa u Minimax ESIRu

Operativno uputstvo za početak internet prodaje posle 1. novembra 2026. Provereno 29. oktobra 2026. Vlasnik postupka je direktor Adriatic Trade; račune izdaje imenovani operater, a računovođa usklađuje poreze, zalihe i naplatu.

**Preporuka:** prve porudžbine fiskalizovati ručno u Minimax-u. U administratorskom panelu povezati PFR broj već izdatog računa i dodati njegov PDF. API nije uslov za početak. Aktivacija ESIR-a i bezbednosnog elementa jeste uslov; njihovo stanje za Adriatic Trade nije potvrđeno. Ovaj dokument ne potvrđuje spremnost konkretne blagajne.

## 1 Priprema pre prve porudžbine

1. U ePorezi proveriti novu PGJO oznaku, adresu i datum početka rada. Pre preuzimanja uplata proveriti da li bezbednosni element pripada tom aktivnom prostoru. Stari sertifikat ne prenositi automatski na novu oznaku.
2. Sa Minimax podrškom proveriti da paket i prava korisnika uključuju napredni ESIR, avanse, konačne račune, refundacije i PDF sa fiskalnim elementima. API ovlašćenja nisu potrebna za početni ručni postupak.
3. U **Šifarnici > Fiskalne blagajne > Nov** uneti oznaku prostora i uređaja. Uvesti sertifikat `.chain.p12`, lozinku i PAK u Minimax i potvrditi blagajnu. Ove tajne ne unositi u GitHub, frontend ili uputstvo. Proveriti fiskalnu numeraciju i kasira. [S3]
4. Prodaja pakovane soli nije ugostiteljska predaja hrane za konzumaciju na licu mesta niti pekara. Ne uključivati poseban režim plaćanja za ugostitelje/pekare samo zato što je proizvod hrana. Računovođa proverava podešavanje. [S3]
5. Uskladiti SKU, nazive, jedinice mere, PDV status i poreske oznake za svaki artikal, avans i dostavu. Proveriti popuste i raspodelu poklon paketa. Cene prepisivati iz sačuvane porudžbine, ne iz današnjeg cenovnika. Ne pretpostavljati istu poresku stopu za sve stavke.
6. Proveriti pravo korišćenja robe i stanje zaliha, račun firme za uplate, ugovoreni način prenosa otkupnine od kurira i pristup izvodu banke. Utvrditi da li kurir prenosi bruto iznos ili odbija naknade.
7. Proveriti da se porudžbine zaključuju preko interneta. Minimax ESIR namenjen je isključivo internet prodaji i zahteva internet. Lična isporuka već zaključene web porudžbine nije razlog da se otvori prodaja na licu mesta kroz ovaj ESIR. Za nove kupovine u lokalu prvo proveriti drugo odgovarajuće rešenje. [S4]
8. Pre produkcionog rada izvesti niže opisane probe u odvojenoj testnoj organizaciji i režimu obuke, uz odobren pristup. Obuka ne zamenjuje račun za stvarnu prodaju. U ovoj proveri nisu pristupani Minimax nalogu niti PFR-u.

Za elektronski račun proveriti PDF sa PFR brojem, vremenom, stavkama i vezom/QR-om za proveru. Kod isključive internet prodaje račun se dostavlja elektronski; ako poslovanje uključuje i druga prodajna mesta, proveriti saglasnost kupca za elektronsku dostavu, a bez nje obezbediti štampani primerak. [S1]

<!-- PAGEBREAK -->

## 2 Kurirsko pouzeće

**Primarni slučaj:** kupac plaća kuriru, a kurir naplaćeni iznos prenosi na poslovni račun Adriatic Trade. Fiskalni način plaćanja je **drugo bezgotovinsko plaćanje**. Promet Prodaja izdaje se u trenutku predaje robe kuriru. Uplata kurira nekoliko dana kasnije zatvara naplatu, bez novog fiskalnog računa. Ovo prati mišljenje MF navedeno u biltenu PU; zaključak se primenjuje na opisani tok prenosa otkupnine. [S2]

1. U panelu proveriti i potvrditi porudžbinu, robu, popust, dostavu i konačan iznos. Potvrda porudžbine nije fiskalni račun.
2. Pre izdavanja pretražiti Minimax i kontrolni registar po punom ID-u porudžbine. Ako postoji račun ili nerešen pokušaj izdavanja, proveriti ga pre novog izdavanja.
3. Pri predaji kuriru u **Poslovanje > Izdati računi > Nov** izabrati fiskalnu numeraciju, kasira i odgovarajuću stranku. Uneti stvarne stavke i PDV podatke, uključujući dostavu koju AT naplaćuje. Izabrati **drugo bezgotovinsko plaćanje** za ceo iznos. Uneti ID porudžbine u opis/dokumentnu referencu. Izdati jedan račun Promet Prodaja. [S5]
4. Proveriti PFR broj i vreme, iznos i validacionu vezu; sačuvati originalni fiskalni PDF. Običan nefiskalni Minimax izdat račun ili predračun nije dovoljan.
5. U **Operativna evidencija > Fiskalizacija** upisati `Minimax ESIR` i pun PFR broj. Sačuvati uz razlog, npr. „PP izdat pri predaji kuriru, iznos 1.018 RSD“. U obrazac **Predaja kuriru** dodati taj PDF, kurira i broj pošiljke. Panel čuva PDF i predaje poruku sa prilogom redu za slanje. [R1–R3]
6. Proveriti slanje poruke i priloga. Ako je poruka na čekanju, ponoviti slanje postojeće poruke; ne izdavati nov račun. Ako se pojavi `attention`, proveriti email servis i po potrebi poslati isti PDF iz Minimax-a uz belešku.
7. Status naplate u panelu ostaje **Nenaplaćena** dok se naplata ne potvrdi. Evidentirati izveštaj kurira, zatim datum i referencu prenosa. Izdavanje računa i status **Poslata** ne dokazuju prijem novca.

**Dostava:** ako je AT ugovara i naplaćuje kroz webshop, iznos iz porudžbine uključiti na AT račun. Ako kupac posebno plaća kuriru njegovu uslugu, kurir izdaje svoj račun za tu uslugu. Isti trošak ne obračunavati dva puta. Kod besplatne dostave AT ne dodaje naplatu kupcu. [S6]

**Primer:** roba 598 RSD + dostava 420 RSD = PP 1.018 RSD i otkupnina 1.018 RSD. Ako kurir prenese 958 RSD i zadrži ugovorenu naknadu 60 RSD, uskladiti 958 + 60 = 1.018 uz dokument kurira. Trošak naknade ne smanjuje fiskalni promet i nije refundacija kupcu. Ovo je sintetički obračun, ne cenovnik kurira.

<!-- PAGEBREAK -->

## 3 Lična dostava uz uplatu na račun

**Preporučeni početni režim:** puna uplata pre dogovorenog termina, provera banke, fiskalizacija avansa ako je primljen pre prometa, zatim konačni račun pri realizaciji web isporuke. U početku ne nuditi delimične uplate kao standard; ipak ih pravilno obraditi ako stignu.

Postojeći Worker generiše NBS QR instrukciju `K:PR` i zahteva ručnu potvrdu izvoda. To nije potvrda ugovorenog IPS prihvata na prodajnom mestu. NBS razlikuje QR za popunjavanje platnog naloga i IPS prihvat trgovca. Za postojeći tok predlaže se fiskalno **prenos na račun**, i kada banka nalog izvrši instant. Ovaj zaključak proizlazi iz koda i pravila za platni nalog. **Instant plaćanje** koristiti ako banka potvrdi ugovoreni IPS prihvat i odgovarajući tok. [S1, S7, R3]

1. U panelu odobriti ličnu dostavu i potvrditi način „IPS na račun“ ili „Uplata na račun“. Proveriti iznos i podatke banke. Besplatna lična dostava u postojećem toku daje iznos dostave nula; sačuvanu porudžbinu ne menjati mimo odobrene funkcije.
2. Dogovoriti termin. Generisan QR, nalog kupca ili screenshot ne označavati kao naplatu. U bankarskoj aplikaciji/izvodu proveriti primaoca, stvarno primljen iznos, datum i referencu.
3. Ako novac stigne pre prometa, izdati **Avans Prodaja** za stvarno primljeni iznos. Kod virmana avans se može evidentirati najkasnije narednog radnog dana uz datum uplate; interna preporuka je odmah po utvrđivanju priliva. Ne odlagati do dostave i ne tumačiti „isti dan“ kao automatsko oslobođenje od avansa. [S8, S9]
4. U Minimax-u koristiti artikal tipa **Avans**, pravilno označen po poreskoj stopi, količinu 1 i odgovarajuće PDV polje. Kada se datum uplate razlikuje od izdavanja, uneti datum i vreme u polje **Datum dospeća/uplate avansa** prema uputstvu. Kod više stopa razdvojiti osnovice. PDF avansa poslati iz Minimax-a i sačuvati uz porudžbinu u kontrolnom registru. [S9]
5. Pri realizaciji internet isporuke izdati konačni račun: na avansu **Kopiraj > U konačni račun**, uneti stvarne artikle i povezati avans. Minimax automatski radi Avans Refundaciju za zatvaranje avansa, a PP referencira tu refundaciju. Interna AR u ovom toku ne predstavlja vraćanje novca i ne šalje se kupcu kao takva. Kod pune uplate ostatak za naplatu je nula. Ne izdavati dodatnu ručnu AR pored automatske. [S10]
6. Konačni PDF poslati kupcu pri izdavanju iz Minimax-a. U panel povezati konačni PFR broj; u internu belešku dodati vezu na registar sa AP/AR/PP nizom. Pri potvrdi stvarne lične isporuke priložiti isti konačni PDF i potvrditi datum i referencu banke. Ako je PDF već dostavljen, ponovno slanje istog dokumenta ne predstavlja novu prodaju.

Ako kupac uplati tek pri samoj predaji i uplata se tada proveri, izdaje se PP za realizovani promet sa odgovarajućim načinom plaćanja, bez izmišljenog ranijeg avansa. Kod otpreme internet porudžbine pratiti stvarni početak isporuke; ne čekati proizvoljno kraj dana. Za ličnu dostavu obezbediti Minimax pristup i internet u trenutku potrebnog izdavanja. [S2]

<!-- PAGEBREAK -->

## 4 Avansi i povraćaji

**Više uplata:** za svaku novu avansnu uplatu voditi zaseban bankarski događaj i AP. Sledeći AP povezati sa prethodnim PFR brojem, pa konačni račun povezati sa svim odgovarajućim avansima po Minimax postupku. Ne označavati porudžbinu u panelu kao u celosti plaćenu ako je primljen samo deo. Iznose i preostali dug pratiti u Minimax-u i kontrolnom registru; panel nema evidenciju delimično plaćenog iznosa. [S4]

**Kupac odustane pre isporuke, avans primljen:** u Minimax-u na izvornom AP izabrati **Kopiraj > U storno** i proveriti Avans Refundaciju, iznos, referencu, datum i vreme. Proveriti propisanu identifikaciju kupca. Stvarni novac vratiti na provereni račun kupca i sačuvati dokaz banke. PDF AR poslati kupcu. Ako postoji više avansa, proveriti ceo povezani niz da ništa ne ostane otvoreno. Ne izdavati konačni PP za posao koji nije realizovan. [S9]

**Roba je isporučena i kupac traži puni ili delimični povraćaj:** evidentirati zahtev, vraćene količine i razlog. U Minimax-u pripremiti **Promet Refundaciju** sa referencom na izvorni PP, datumom/vremenom i propisanom identifikacijom kupca. Refundirati samo odobrene stavke i ranije nerefundirani iznos. Za novac koji se vraća bankom odabrati **prenos na račun** i sačuvati izvod; način refundacije prati stvarni povraćaj, a ne automatski originalno pouzeće. Kupcu dostaviti PR PDF. Za dokazivanje povraćaja pratiti pravila PU o kopiji refundacije i dokazima; pre prve bankarske refundacije potvrditi sa podrškom/računovođom da li dokaz banke zamenjuje potpisanu kopiju u konkretnom toku. [S1, S11]

**Neuručena i nenaplaćena pošiljka:** sačuvati povratnicu i dokaz kurira da otkupnina nije naplaćena. Račun se ne briše; potreban je dokument fiskalne refundacije/poništavanja izvornog PP i vraćanje zaliha. Ne upisivati izmišljenu uplatu i ne označavati novčanu refundaciju za novac koji nije primljen. Tačan izbor identifikacije kupca za poništavanje neuručene pošiljke nije izričito potvrđen pregledanim uputstvima; pre primene Minimax podrška i računovođa treba da potvrde taj unos. Postupak korekcije greške sa sopstvenim PIB-om postoji, ali ga ne treba automatski preslikati na svaki povraćaj. [S12]

**Pogrešno izdat račun:** koristiti dokumentovano poništavanje sa sopstvenim PIB-om, referencom i svim stavkama izvornog računa, pa izdati ispravan račun. Čuvati oba dokumenta i razlog; ne menjati originalni PDF ili broj. Ovo je korekcija greške, a ne način da se prikrije stvarni povraćaj kupcu. [S12]

**Evidencija panela:** isporuku označiti **Vraćena** kada roba zaista bude vraćena. Status **Refundirana** predstavlja novčanu evidenciju, ne izdaje PR/AR. Za delimični povraćaj ne koristiti taj status kao da je sve vraćeno; iznose voditi u registru. Za neuručeno/nenaplaćeno zadržati **Nenaplaćena**, uz belešku o fiskalnom poništavanju. Pre zaključavanja porudžbine otkazivanjem sačuvati potrebne operativne reference; zaključana porudžbina se više ne uređuje. [R3]

<!-- PAGEBREAK -->

## 5 Evidencija i sprečavanje duplog ručnog izdavanja

U početku račun izdaje jedan imenovani operater iz jednog radnog spiska. Pre klika **Izdaj** upisuje „izdavanje u toku“ u kontrolni registar. Posle uspeha odmah beleži Minimax ID, PFR broj/vreme i PDF. Ako ekran zastane ili potvrda izostane, traži već nastali račun u Minimax-u; do razjašnjenja nema drugog izdavanja.

| Podatak | Mesto evidencije |
|---|---|
| Pun ID porudžbine i bruto iznos | Minimax opis/referenca i registar |
| Izvorni račun | Panel polje Broj fiskalnog računa čuva konačni PP |
| AP i automatska AR | Registar sa vezama, Minimax dokumenti i PDF arhiva |
| PR ili AR zbog vraćanja novca | Registar, originalni dokument i dokaz banke |
| PFR referenca | PFR broj izvornog dokumenta, ne ID porudžbine |
| Minimax ID | Interni broj zapisa, odvojen od PFR broja |
| Poslat PDF | Adresa primaoca, datum slanja i status poruke |
| Novac | Bankarski izvod ili izveštaj kurira i prenos |

Registar mora podržati **više redova po porudžbini**. Minimalne kolone: orderId, operater, događaj, AP/AR/PP/PR, iznos, datum priliva, referenca banke, Minimax ID, PFR broj/vreme, referentni PFR, naziv PDF-a, status izdavanja i status slanja. Koristiti zajednički kontrolisani registar; pristup ograničiti i ne unositi brojeve ličnih dokumenata u javni repozitorijum.

**Potvrđena ograničenja aktuelnog panela na osnovnom SHA `d31ca177e8853a8c5e55102019b27b6e7e26ff60`:**

- `fiscalNumber` je slobodan unos; dva različita naloga prihvataju isti sintetički broj sa HTTP 200. `linked` znači evidentiranu vezu, ne validiran račun. Nema zaštite od toga da operater nezavisno izda dva računa u Minimax-u.
- Predaja kuriru prolazi i bez PDF-a. Zato pre fizičke predaje ručno proveriti da račun postoji i da je dostavljen. Ponovljeni klik **Predaja kuriru** na poslatoj porudžbini ne pravi novu pošiljku; to nije garancija fiskalne idempotentnosti.
- Jedan `receipt_key` i jedan fiskalni broj ne predstavljaju knjigu svih AP/AR/PP/PR dokumenata. Avanse i refundacije slati iz Minimax-a i voditi u registru; konačni PDF dodati tokom slanja/isporuke. Posle toga ne pokušavati zamenu PDF-a ponovnim klikom za slanje.
- Nema automatske provere poreskih podataka, potpunosti naplate, delimične refundacije niti usklađivanja kurirskih naknada. Naknadna naplata ne stvara novi PP.

Na kraju dana operater i računovođa usklađuju porudžbine, fiskalne dokumente i novac kao tri odvojene evidencije. Proveriti sve otpreme bez PP/PDF-a, uplate bez AP/konačnog računa, otvorene avanse, povrate bez korekcije i nedostavljene poruke. Razlike razrešiti po originalnim dokazima; izvoz panela obuhvata najviše 100 porudžbina, pa nije samostalni dokaz potpunosti. [R1–R3]

<!-- PAGEBREAK -->

## 6 Povezivanje Workera sa Minimax APIjem

**Zaključak:** tehnički je izvodljivo preko serverskih HTTPS poziva. Prvi korak automatizacije treba da bude prenos porudžbine u **nacrt Minimax računa**, dok operater proverava i izdaje u Minimax-u. Puno automatsko izdavanje uvoditi tek nakon potvrde ponašanja u obuci. REST API i OAuth2 ne zahtevaju lokalni fiskalni uređaj u Worker-u; fiskalizaciju obavlja Minimax. [S13–S16]

| Potreba adaptera | Dokumentovana Minimax mogućnost |
|---|---|
| Kreiranje nacrta | `AddIssuedInvoice`, POST `api/orgs/{organisationId}/issuedinvoices` |
| Čitanje i provera | `GetIssuedInvoice`, GET istog resursa sa `/{issuedInvoiceId}` |
| Izdavanje poznatog nacrta | `CustomActionIssuedInvoice`, PUT na `/{id}/actions/issue?rowVersion=...` |
| PDF | Akcija `generatepdf`, odnosno dokumentovani `issueAndGeneratepdf`; proveriti stvarni fiskalni PDF u RS nalogu |
| Prilozi | `GetIssuedInvoiceAttachments`; sadržaj odgovora i fiskalni prilog proveriti u obuci |
| Avans i konačni | `PaymentStatus: Avans`, `IssuedInvoiceRowId` i `AdvancePaymentIssuedInvoiceRow` |
| Refundacija | Poseban fiskalni tok sa originalnom referencom; mapiranje potvrditi prema uzorku iz RS Minimax obuke |

Fiskalni račun prepoznaje se po **fiskalnoj numeraciji**, ne samo po nazivu API metode. ID-eve organizacije, numeracije, kasira, stranke, artikala i načina plaćanja dobiti iz šifarnika; ne pogađati ID i ne preuzimati primere iz hrvatske lokalizacije. Pozitivni HTTP odgovor ili status običnog izdatog računa sami ne potvrđuju PFR uspeh. [S5]

Za avanse je dokumentacija dopunjena 26. oktobra 2026. Minimax preporučuje da se primer najpre pripremi u obuci, pročita preko GET-a i prema njemu oblikuje JSON. Sačuvati ID-eve redova avansa za konačni račun. Pregledane stranice tehničke dokumentacije/changelog-a nisu svuda prikazale iste novosti; schema iz stvarnog RS naloga u obuci i potvrda podrške imaju prednost nad prepisivanjem starog primera. [S14, S15]

Podrška izdaje Client podatke; korisnik u **Moj profil > Nova aplikacija** postavlja User podatke i odobrava API prava na organizaciji. Dokumentovani token endpoint je `https://moj.minimax.rs/RS/AUT/oauth20/token`, `grant_type=password`, scope `minimax.rs`, trajanje tokena 3600 s. Sva četiri pristupna podatka i token držati serverski u Worker Secrets, bez logovanja; odvojiti test i produkciju. Ograničiti prava i organizaciju, ponovljene pogrešne prijave zaustaviti zbog zaključavanja aplikacije. [S13]

Predloženi adapter treba da čuva zaključanu kopiju porudžbine, hash sadržaja, bruto stavke i cene u parama. Mapiranje mora očuvati zbir robe, dostave i popusta, PDV oznake i valutu. Ne koristiti statuse porudžbine kao automatski dokaz naplate. PDF čuvati privatno u R2, a slanje kupcu voditi odvojeno od fiskalnog izdavanja.

<!-- PAGEBREAK -->

## 7 Obavezne kontrole za budući adapter

U pregledanoj dokumentaciji nije potvrđen provajderski idempotency ključ niti garantovana pretraga po proizvoljnoj eksternoj referenci. `RowVersion` štiti ažuriranje poznatog zapisa, ali ne garantuje sprečavanje dva zasebna POST nacrta. Postojeći `integration_jobs.operation_key` je samo pripremljena lokalna tabela; nema aktivnog Minimax adaptera. [S13, S16, S17, R1]

Predloženi postupak, koji tek treba implementirati i testirati:

1. Trajno rezervisati jedinstvenu poslovnu operaciju: `organizacija/orderId/PP`, `organizacija/orderId/AP/bankEventId` ili `organizacija/orderId/PR/refundEventId`. Revizija podataka nije novi ključ kojim se sme zaobići postojeći račun. Uz ključ sačuvati hash zahteva; isti ključ sa drugim iznosom vraća konflikt.
2. Jednim atomskim upisom preuzeti operaciju i zaključati porudžbinu. Paralelni proces, dupli klik i ponovljeni webhook dobijaju postojeći rezultat. Blokirati automatsko izdavanje ako je račun već ručno povezan; ručne AP/AR/PP/PR prvo importovati/proveriti.
3. Kreirati nacrt samo jednom, trajno upisati `IssuedInvoiceId` iz `Location`, pa tek onda dozvoliti izdavanje. Ako se odgovor na POST izgubi i ID nije poznat, označiti `attention`. Lista računa ima paginaciju; dokumentovan filter ne potvrđuje pretragu po `DocumentReference`. Ručno/serverski proveriti sve kandidate, bez slepog ponovnog POST-a. [S17]
4. Izdavati samo poznati ID uz svež GET i `RowVersion`. Pre mrežnog poziva trajno zabeležiti neizvestan pokušaj. Posle timeout-a prvo čitati isti ID i proveriti stvarnu fiskalizaciju, broj i vreme. Ako se ishod ne može dokazati, stati na `attention`, bez automatskog novog izdavanja.
5. Istek zaključavanja ne daje pravo drugom procesu da ponovi neizvestan fiskalni poziv. Zaštititi i slučaj kada je prvi proces zastao pre slanja, a kasnije nastavi: dok idempotentnost kod provajdera nije dokazana, takve operacije se ne preuzimaju za novo slanje.
6. Konačni račun može automatski proizvesti AR i PP. Sačuvati oba rezultata. Kod delimičnog uspeha pregledati postojeće dokumente, ne izdavati dodatnu AR. Evidencija dokumenata treba da ima više redova po porudžbini, jedinstven provajderski/PFR identitet i vezu na izvorni dokument.
7. Ponovljeni zahtevi za PDF, štampu ili email koriste postojeći račun. Ne izvršavaju `issue`. Refundacije imaju sopstveni ključ, zaključavanje i zbirnu kontrolu da ukupan povraćaj ne pređe ranije nerefundirani iznos. Email red nije red fiskalnih operacija.

**Podršci treba potvrditi:** idempotentnost `issue` za isti ID, ponašanje pri gubitku odgovora, polja PFR statusa i originalnog PDF-a, način pouzdane rekonstrukcije izgubljenog POST-a, fiskalni refund API za RS i ponašanje automatske AR ako PP ne uspe. Bez tih potvrda moguć je prenos nacrta uz kontrolisani ručni završetak, ali se ne tvrdi garantovano automatsko izdavanje tačno jednom.

<!-- PAGEBREAK -->

## 8 Sintetička provera postupka

Svi iznosi i identifikatori u ovom odeljku su izmišljeni. Ne predstavljaju poreske stope, stvarne porudžbine ili fiskalne račune. Uloge za probu: operater izdaje u Minimax obuci, računovođa proverava vezu dokumenata, tester proverava panel i poruke. Brojeve iz obuke ne povezivati sa stvarnim porudžbinama.

| Proba | Ulaz i očekivani rezultat |
|---|---|
| T01 Pouzeće | Roba 598 + dostava 420. PP 1.018 pri predaji kuriru, drugo bezgotovinsko. PDF kupcu; panel unpaid do potvrđene naplate. |
| T02 Puna uplata pre isporuke | Roba 2.400, lična dostava 0. Priliv 2.11, otprema 3.11. AP 2.400, zatim automatska AR i PP 2.400; ostatak za naplatu 0. |
| T03 Više avansa | Isporuka 2.400; prilivi 1.000 i 1.400. Dva AP povezana u niz; konačni PP sa uračunatim avansima. Panel paid tek po punoj naplati. |
| T04 Kasnije uočen virman | Priliv 2.11, uočen 3.11. AP najkasnije 3.11 sa datumom stvarne uplate 2.11; sistemsko vreme izdavanja ostaje stvarno. |
| T05 Odustanak pre isporuke | Primljen AP 2.400. AR 2.400 i povrat preko banke, bez PP. Registar sadrži dokaz povraćaja. |
| T06 Delimični povraćaj | Posle PP 2.400 odobren povrat jedne stavke 600. PR 600 sa originalnom referencom i bankarski povrat 600; neto promet 1.800. Dostava se tretira prema stvarnom osnovu. |
| T07 Nepreuzet paket | PP 1.018, kurir nije naplatio. Dokumentovan povrat, fiskalno poništavanje po potvrđenom postupku; bez fiktivne naplate i povrata novca. |
| T08 Izdavanje bez potvrde | Operater izgubi odgovor. Pre novog pokušaja pronalazi isti dokument u Minimax-u. Očekivanje: jedan PP, ne dva. API test tek kada postoji adapter. |
| T09 Email ne uspe | Fiskalni račun već postoji, PDF sačuvan. Ponoviti samo slanje istog PDF-a. Neizvestan email ne pokreće fiskalizaciju. |
| T10 Pogrešan PDF ili poresko mapiranje | Neslaganje iznosa/SKU/poreske oznake zaustavlja fizičku otpremu. Proveriti šifarnik i dokument pre izdavanja; već pogrešan račun korigovati propisano. |

**Izvršena lokalna provera 29.10.2026:** novih 7 testova ručnog toka, 34 postojeća testa lične dostave i 16 testova reda email poruka prolaze, kao i skripta administratorskih operacija. Testovi koriste izolovani SQLite i sintetičke mrežne odgovore. Provereni su PDF prilog, autorizacija, odbijanje neispravnog/prevelikog fajla, očuvanje iznosa, odvajanje naplate od slanja i ponavljanje poruke bez nove pošiljke.

**Granica provere:** nije izvedena Minimax obuka niti potvrđen pristup nalogu, sertifikat, stvarna fiskalizacija, autentičnost PDF-a ili isporuka pravom kupcu. T01–T10 su plan za proveru poslovnog postupka, ne oznaka da su uspešno izvedeni u Minimax-u. Produkcija nije menjana.

<!-- PAGEBREAK -->

## 9 Izvori i tehnička evidencija

Izvori provereni 29.10.2026. Uputstvo kombinuje dokumentovane mogućnosti i preporučene interne kontrole; otvorena pitanja su izričito označena uz odgovarajući korak.

- [S1] Poreska uprava, odgovori na najčešća pitanja o eFiskalizaciji, naročito način plaćanja, elektronski račun i povraćaj: https://www.purs.gov.rs/eFiskalizacija/odgovori_najcesca_pitanja.html
- [S2] PU CVPO, Bilten april–jun 2023, mišljenje MF 011-00-00539/2022-04 od 14.03.2023, internet otprema i kurirsko pouzeće: https://www.purs.gov.rs/upload/media/2025/2/4/657810/Biltenapril-jun2023-1.pdf
- [S3] Minimax, podešavanje fiskalne blagajne i sertifikata: https://help.minimax.rs/help/podesavanje-fiskalne-kase-i-sertifikata
- [S4] Minimax, avansno plaćanje u webshopu, 27.10.2026: https://www.minimax.rs/sr-latn-rs/avansno-placanje-u-webshopu-od-prve-uplate-do-konacnog-fiskalnog-racuna
- [S5] Minimax, API testiranje fiskalnog računa: https://help.minimax.rs/help/api-fiskalni-racun
- [S6] PU, prodaja robe preko interneta i trošak isporuke: https://www.purs.gov.rs/odnosi-s-javnoscu/novosti/8613/efiskalizacija---prodaja-robe-preko-interneta.html
- [S7] NBS, QR za plaćanje računa nasuprot IPS prihvatu trgovca: https://ips.nbs.rs/sr_lat/ips-mesta-i-nacini-placanja/placanje-racuna-putem-nbs-ips-qr-koda
- [S8] PU, tehničko uputstvo, primeri posebnih slučajeva i virmanski avansi: https://tap.suf.purs.gov.rs/Help/Home/ExportToPdf?all=true&file=%D0%9F%D1%80%D0%B8%D0%BC%D0%B5%D1%80%D0%B8-%D1%80%D0%B0%D1%87%D1%83%D0%BD%D0%B0-%D1%83-%D1%81%D0%BF%D0%B5%D1%86%D0%B8%D1%98%D0%B0%D0%BB%D0%BD%D0%B8%D0%BC-%D1%81%D0%BB%D1%83%D1%87%D0%B0%D1%98%D0%B5%D0%B2%D0%B8%D0%BC%D0%B0&hash=454320695
- [S9] Minimax, Avans Prodaja i Avans Refundacija, 26.10.2026: https://help.minimax.rs/help/fiskalni-avansni-racun
- [S10] Minimax, konačni račun, 26.10.2026: https://help.minimax.rs/help/fiskalizacija-konacni-racun
- [S11] PU, referentni broj i lanac dokumenata: https://tap.suf.purs.gov.rs/help/view/387096995/%D0%A0%D0%B5%D1%84%D0%B5%D1%80%D0%B5%D0%BD%D1%82%D0%BD%D0%B8-%D0%B1%D1%80%D0%BE%D1%98
- [S12] Minimax, ispravka pogrešno izdatog računa: https://help.minimax.rs/help/kako-uraditi-ispravku-u-sluaju-pogreno-izdatog-rauna
- [S13] Minimax, API ovlašćenja, OAuth2 i RowVersion: https://help.minimax.rs/help/api-za-programere
- [S14] Minimax, API avans i konačni, 26.10.2026: https://help.minimax.rs/help/api-testiranje-fiskalni-avansni-racun-i-konacni-racun-copy
- [S15] Minimax, nacrt pa izdavanje preko API-ja: https://help.minimax.rs/help/testiranje-api-prenosa-izdat-racun
- [S16] Minimax RS, metode za račune: https://moj.minimax.rs/RS/API/Home/ModuleDetails/IssuedInvoice
- [S17] Minimax RS, lista računa sa filterima i paginacijom: https://moj.minimax.rs/RS/API/Help/Api/GET-api-orgs-organisationId-issuedinvoices

Repozitorijum https://github.com/goranlazarevic-rs/adriatic-trade na osnovnom SHA `d31ca177e8853a8c5e55102019b27b6e7e26ff60`:

- [R1] `docs/ADMIN-INTEGRATIONS.md`, priključne tačke i ograničenja.
- [R2] `ADMIN-SETUP-v4.0.md`, prijem i slanje već izdatog PDF-a.
- [R3] `assets/js/admin.js` i `worker/adriatic-trade-worker-v4.5.0.js`, stvarne rute, statusi i polja. Naziv Worker fajla nije broj aktuelne verzije izvršavanja.

Razvojna provera: `node tests/fiscal-manual-workflow.mjs`, `node tests/admin-operations.mjs`, `node tests/local-delivery.mjs`, `node tests/notification-outbox.mjs`. Testovi ne šalju podatke Minimax-u, PU ili stvarnom email servisu. Za početni postupak nisu potrebne izmene izvršnog koda; nova regresiona provera i uputstvo pripremaju bezbedan nastavak rada.
