# Priprema otvaranja — stanje 3.11.2026.

Ovo je priprema za pregled, ne potvrda spremnosti ili nalog za objavu, izdavanje računa i otvaranje prodaje. Razvojni kandidat je Worker/admin 4.12.0 u Draft PR-u #19. Izvršni kod nije menjan ovom dopunom.

## Potvrđeno i otvoreno

| Stavka | Dokaz / stanje | Šta još treba |
| --- | --- | --- |
| Laboratorija i puštanje robe | Vlasnik 3.11. navodi da nalaz očekuje danas ili sutra; potvrda još nije dobijena. | Potvrda da je roba slobodna za prodaju i da su završeni potrebni uvozni/registracioni koraci. Očekivani datum nije odobrenje. |
| Kurir | Pregovori traju. | Izabrani kurir, preuzimanje, pakovanje/težina, konačne naknade sa PDV-om, naplata pouzeća, prenos novca, neuručenje/povrat i reklamacije. Webshop 420 RSD nije ugovorena kurirska cena. |
| Minimax veza i nacrti | Ranije korisničke provere sedam sačuvanih nacrta i očitavanja pet SKU. | Ne izdavati sintetičke nacrte; API pristup nije dokaz produkcione fiskalizacije. |
| Fiskalna blagajna | Vlasnik prenosi naziv „Adriatic Trade Webshop“, prostor 1428454, uređaj 1. | Proveriti potvrđen status i važeći produkcioni sertifikat. Red „85RD Adriatic Trade Webshop / 31.10.2029“ nema preneta zaglavlja; datum ostaje nepotvrđen rok sertifikata dok se ne proveri kolona/status. |
| Numeracija | Izdati računi, šifra 1428454-1, automatsko brojanje, stranka Fizičko lice, povezana ista blagajna. Vlasnik izričito potvrđuje da je Režim obuke uključen. | Planiran kontrolisan prelazak u redovan režim posle zaustavljanja proba. Nema potrebe za novom numeracijom samo zbog prestanka obuke. |
| Razduženje zaliha | Vlasnik potvrđuje kvačicu „Smanjivanje zaliha neposredno računom“. | Potvrđen prijem, vrednovanje i slobodna roba; nacrt računa nije dokaz razduženja. Ne potvrđivati nulti nabavni prijem radi probe. |
| Način plaćanja | Početni cilj je pouzeće; probni nacrti koriste TEST_BANK_TRANSFER / ID 622053. | Potvrditi stvarni fiskalni tip i knjiženje naplate prema dogovoru sa kurirom i knjigovođom. Test oznaka nije produkciono mapiranje. |
| Program i kontrole | Kandidat bdaa789ba11bce45c9e7cacb6ae628306afb2f9e: Release Gate #63 uspešan; 38 novih i 154 prethodna Minimax/model testa, workerd/D1/R2 i browser 1440/390/320. | Posebno pregledati i odobriti usklađenu objavu; ovo nije živa fiskalna proba. Produkcioni deploy i staging u tom izvršavanju preskočeni. |
| Stvarni produkcioni prijem | Iz ove prepiske nije nezavisno proverena aktuelna produkciona verzija/pauza; potvrđena ranija pauza odnosi se na probni prijem. | Pre objave očitati produkcioni status; ako kontrolna šema nedostaje, pripremiti odobrenu migraciju i pauzu, bez resetovanja postojećih porudžbina/kvota. |

## Šta završavamo dok čekamo robu i kurira

1. Proveriti status/rok sertifikata postojeće blagajne bez izvoza sertifikata, PAK-a ili lozinke. Ne praviti novu blagajnu/oznaku prostora samo zbog obuke.
2. Pregledati **Poslovanje → Izdati računi → meni sa tri crtice → Načini plaćanja**. Zabeležiti nazive i postojeće tipove/knjiženja, bez kreiranja stvarnog računa. Posle dogovora sa kurirom utvrditi tačan postupak; ne označavati račun kao naplaćen samo zato što je pouzeće izabrano.
3. Potvrditi početni kanal fiskalnog PDF-a. Kandidat podržava slanje originalnog PDF-a iz panela i ručno evidentiranje prethodnog slanja iz Minimax-a. Za prvi mali obim predlog je panel: izdati u Minimax-u, preuzeti originalni PDF, povezati i poslati konkretnoj adresi iz porudžbine. Potvrda porudžbine i fiskalni račun su dva odvojena mejla/događaja. Minimax stranka „Fizičko lice“ ne određuje adresu stvarnog kupca.
4. Pripremiti ograničenu početnu raspodelu robe za webshop, svih pet SKU uključujući nule; konačno potvrditi tek kada je roba slobodna. Paketi i pojedinačni artikli troše iste komade. Knjigovodstvene zalihe ne prepisivati preko preostale kvote.
5. Pregledati usklađeni kandidat, backup i konkretne potrebne migracije, bindings/Resend/Turnstile/Cron, pa pripremiti objavu sa pauzom. Merge, produkciona objava, stvarna slanja i otvaranje nisu obuhvaćeni ovom pripremom.

## Prelazak numeracije 1428454-1 iz obuke

Zvanično Minimax uputstvo navodi da se povratak u redovan režim radi skidanjem kvačice Obuka na postojećoj numeraciji. Raniji predlog da je nova numeracija obavezna nije tačan. Ne menjati šifru, poslovni prostor ili uređaj radi razdvajanja proba.

1. Završiti potrebne sintetičke provere i sačuvati njihove rezultate/ID-eve. Sedam postojećih probnih nacrta ostaje neizdato: 25000576, 25000816, 25000921, 25004946, 25005034, 25005075, 25005162. Nacrt 24955965 je raniji referentni primer, nije narudžbina kupca.
2. Zaustaviti probni prijem **i pristup probnom API-ju za nacrte** pre promene režima. Samo pauziranje prijema ne gasi rutu za nacrte. Trenutni staging wrapper odbija sve zahteve kada MINIMAX_MODE nije `draft`; po posebno dogovorenoj radnji može se staviti `disabled` na izolovanom Worker-u i proveriti blokada. Ponovna staging objava iz workflow-a vraća `draft`, pa je ne pokretati dok ista numeracija služi redovnoj prodaji. Ovo podešavanje sada nije promenjeno.
3. Potvrditi poslovne preduslove, važeći sertifikat/status, načine plaćanja i posebno odobrenu produkcionu objavu sa pauzom. Probni Worker/DB/porudžbine ne prenose se u produkciju. Produkcioni prvi režim je ručno izdavanje u Minimax-u; nema automatskog API izdavanja.
4. Neposredno pred dogovoreni početak, u **Podešavanje organizacije → Dokumenta → Numeracija dokumenta → 1428454-1 → Uredi**, isključiti Režim obuke, sačuvati i ponovo proveriti prikaz. Ne pritiskati Izdaj na probnim nacrtima. Sama promena režima nije izdavanje računa niti otvaranje webshopa.
5. Konačno potvrditi webshop kvote i posebno otvoriti stvarni prijem. Prvi stvarni račun izdati za stvarnu porudžbinu odgovarajućeg tipa, sa proverom robe, cene, poreza, dostave i načina plaćanja; zatim povezati originalni PDF i evidentirati slanje prema [uputstvu](FIRST-SALE-RUNBOOK.md). Ne izdavati stvarni račun samo radi tehničkog testa.

Nije potvrđeno da postojeći staging API nezavisno očitava i kontroliše kvačicu režima obuke: on ograničava operacije na nacrte, a numeracija je fiksna 77630. Zato oznaka `staging` nije poseban Minimax sandbox i ne zamenjuje zaustavljanje proba pri prelasku.

## Kada je moguće otvoriti

Potrebni su zajedno: potvrda slobodne robe i dokumentacije/prijema/vrednovanja, potvrđena blagajna/sertifikat i redovan režim, način plaćanja i ugovoren operativni kanal kurira, uspešno odobrena produkciona objava sa pauzom i potvrđene početne kvote. Odluka vlasnika o otvaranju ostaje zasebna. Nalaz sam po sebi ne zatvara preostale stavke.

Izvori provereni 3.11.2026:

- https://help.minimax.rs/help/obuka-prodaja-i-obuka-refundacija — prelazak istom numeracijom iz obuke u redovan režim.
- https://help.minimax.rs/help/api-fiskalni-racun — numeracija određuje fiskalni tok API dokumenta; obuka se isključuje po završetku testiranja.
- https://help.minimax.rs/help/podesavanje-fiskalne-kase-i-sertifikata — blagajna, sertifikat, poslovni prostor/uređaj i povezana numeracija.
- https://help.minimax.rs/help/nacini-placanja — pregled/definisanje načina plaćanja i knjiženja.
- https://help.minimax.rs/help/izdati-racuni---definisanje-nacina-placanja — oznaka plaćanja ne zatvara sama otvorenu stavku.
- https://github.com/goranlazarevic-rs/adriatic-trade/actions/runs/41616326516 — validacija izvršnog kandidata pre ove dokumentacione dopune.
