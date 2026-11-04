# Prva porudžbina — uputstvo 4.13.0

Primenjuje se posle odobrene objave, potvrđenih poslovnih preduslova i zasebnog otvaranja prodaje. Razvojne provere koriste sintetičke podatke; njima nije izdat stvarni račun, poslat mejl kupcu ili predata roba kuriru. Od 4.13.0 obavezna je [arhiva originalnog PDF-a](PAYMENT-QR-FISCAL-CONTROLS.md), i za dokumente već poslate iz Minimax-a. Ručna provera na portalu Poreske uprave je opciona i nije uslov za isporuku; može se dodati naknadno, bez ponovnog izdavanja ili slanja računa.

## Pre početka

Proći [LAUNCH-CHECKLIST.md](../LAUNCH-CHECKLIST.md). Potvrditi slobodnu robu/dokumenta, pravu fiskalnu numeraciju/sertifikat, poreska podešavanja i način plaćanja sa knjigovođom, kao i kurira. Za početni režim koristi se ugovoreni način pouzeća. Lična dostava uz raniju uplatu mora pratiti odgovarajući Minimax avansni/konačni postupak; bankarska provera u panelu sama ne rešava fiskalizaciju avansa.

Konkretno stanje i redosled prelaska numeracije 1428454-1: [FIRST-SALE-READINESS.md](FIRST-SALE-READINESS.md). Vlasnik je 3.11. potvrdio da je Obuka uključena. Po završetku proba na istoj numeraciji se isključuje Obuka; nova numeracija nije obavezna samo zbog prelaska. Pre toga zaustaviti probni API za nacrte (pauza prijema nije dovoljna) i sačuvati sve sintetičke nacrte neizdate. Pripremljeni prvi produkcioni režim podrazumeva ručno izdavanje u Minimax-u, bez API izdavanja.

U Minimax opciji **Pošalji e-mailom** proveriti polje **Za** za konkretnog kupca. Zajednička stranka „Fizičko lice“ nije izvor adrese svih kupaca.

Zvanični izvori:

- https://help.minimax.rs/help/promet-prodaja-i-promet-refundacija — izdavanje i fiskalni PDF.
- https://help.minimax.rs/help/slanje-dokumenata-preko-e-maila — primalac i evidencija slanja.
- https://purs.gov.rs/eFiskalizacija/novosti/8613/efiskalizacija---prodaja-robe-preko-interneta.html — fiskalni račun i dostava u internet prodaji.
- https://purs.gov.rs/eFiskalizacija/odgovori_najcesca_pitanja.html — elektronska forma kod isključive internet prodaje; primeniti odgovarajući režim firme.
- https://tap.suf.purs.gov.rs/help/Home/ExportToPdf?all=true&file=Data-Structures — PFR identifikator. Panel proverava format i jedinstvenost, ne autentičnost računa.

## Kvote i obrada

1. Dok je prijem pauziran, potvrditi ograničenu slobodnu kvotu svih pet fizičkih SKU, uključujući nule. Paketi dele iste komade. Otvaranje je poseban korak.
2. Primljena porudžbina već jednom umanjuje kvotu. **Ne umanjivati je ponovo pri fiskalizaciji i ne prepisivati celo Minimax stanje preko nje.** Kod dopune proveriti sve neobrađene porudžbine i ostalu prodaju. Povrat robe/refundacija ne vraćaju kvotu automatski.
3. U novoj porudžbini proveriti kupca, adresu/telefon, robu/pakete, sačuvanu cenu, dostavu i bezbednosne oznake. Potvrditi porudžbinu; kupcu odlazi postojeća potvrda sa prilozima. To nije fiskalni račun.
4. Tabela „Priprema za unos u Minimax“ prikazuje fizičke artikle, količine i raspodeljene bruto cene paketa sa dve decimale, iz sačuvanog sastava i cene. To nije izdat dokument i ne preuzima aktuelni cenovnik. Operater u Minimax-u izdaje odgovarajući stvarni fiskalni dokument. Ne koristiti sedam probnih API nacrta za stvarnog kupca i ne izdavati stvarnu prodaju dok numeracija ostaje u Obuci. Proveriti PFR broj, vrstu, vreme, artikle/količine, način plaćanja, porez i ukupan iznos sa dostavom. Preuzeti originalni PDF; panel ga ne generiše i ne proverava preko Poreske uprave.
5. U odeljku **Fiskalni račun** uneti PFR broj, stvarno vreme izdavanja i ukupno RSD; uporediti originalni PDF sa porudžbinom. Za ličnu uplatu proveriti eventualni avans i konačni račun u Minimax-u. Email je iz porudžbine. Provera na portalu je opciona: po želji uključiti evidenciju i uneti verifikacioni link, PIB i potvrde poređenja. Preporučuje se za prve račune, nakon promena i kod sumnje; preskakanje ne blokira čuvanje ili isporuku.
6. Priložiti **neizmenjeni originalni PDF do 5 MB** u oba načina dostave. Izabrati **Pošalji originalni PDF iz panela**, ili **Već je poslat iz Minimax-a** (stvarno vreme slanja i provera primaoca/evidencije u Minimax-u). Drugi izbor samo arhivira i evidentira, bez ponovnog slanja. Ne dodavati platni QR u originalni fiskalni PDF.
7. Proveriti status. **Email servis je prihvatio PDF** znači prihvatanje servisa, ne dokaz inbox-a. **Slanje iz Minimax-a je ručno evidentirano** označava potvrdu operatera. Dok email čeka/ima grešku, predaja je blokirana. Ne izdavati drugi račun zbog greške slanja.
8. Kurira zakazati kroz ugovoreni kanal, upakovati robu i uneti stvaran broj/link pošiljke. Tek po stvarnoj predaji kliknuti **Označi kao poslato i obavesti kupca**. Mejl o slanju ne dodaje ponovo fiskalni PDF. API zakazivanje kurira još nije aktivno.
9. Za ličnu isporuku ostaju dogovor termina i provera bankarske uplate. Pratiti prijem novca od kurira i reference izvoda. „Poslato“ nije dokaz naplate.

## Greške i refundacije

- Greška mejla zadržava PFR vezu, PDF i isti zahtev. Koristiti proveru/ponavljanje slanja; ne ponavljati fiskalizaciju. Posle isteka bezbednog retry prozora potrebna je provera email servisa, bez zaobilaženja upozorenja.
- PFR broj ne može pripasti drugoj porudžbini, ni uz promenu velikih/malih slova. Originalni zapis ostaje u istoriji posle otkazivanja. Račun/PDF se ne prepisuju; pogrešni podaci zahtevaju zaustavljanje i proveru operatera.
- Otkaz, povrat novca i fiskalna refundacija su odvojene radnje. Za izdat račun operater prvo radi **punu refundaciju u Minimax-u**, sa referencom originala. Zatim u panelu otvara **Evidentiraj punu refundaciju**, unosi novi PFR broj i originalnu referencu i evidentira slanje. Panel ne izdaje refundaciju, ne prenosi novac i ne vraća kvotu.
- Refundacija blokira slanje robe. Potvrđena neposlata porudžbina zatim može biti otkazana. Za već poslatu porudžbinu povrat i naplata/refundacija vode se zasebno. Delimične refundacije, zamene i ispravke nisu automatizovane: proveriti postupak u Minimax-u i dokumentovati, bez prisilnog uklapanja u obrazac pune refundacije.

## Objava i povratak

Vlasnik je 3.11.2026. odobrio usklađenu produkcionu objavu, backup i potrebne migracije uz prijem zatvoren od početka. Pre migracija produkcioni job proverava Cloudflare D1 Time Travel bookmark i čuva metadata artefakt (bez sadržaja porudžbina), pa primenjuje dve idempotentne availability migracije i postavlja pauzu. Pre i posle objave proverava se `mode=paused`. Tačka oporavka važi u aktivnom Cloudflare periodu čuvanja rezervnih kopija; metadata artefakt sam nije SQL kopija baze. R2 dokumenti se ne brišu niti premeštaju. Minimax ostaje u Obuci; otvaranje prodaje nije odobreno.

FIRST_SALE_MODE=manual-minimax se postavlja u pripremljenoj produkcionoj konfiguraciji; health izričito zahteva firstSaleFiscal=true. Bez toga ostaje raniji režim. Probni Minimax wrapper i dalje zabranjuje stvarnu fiskalizaciju, slanje i kurira.

Pri problemu pauzirati nove prijeme, sačuvati postojeće porudžbine/PFR/PDF/mejlove i prvo proveriti spoljni ishod. Ne vraćati stariji Worker bez fiskalne kontrole dok je prodaja otvorena. Backup, migracije, objava i otvaranje ostaju posebno odobreni. Automatski Minimax/kurir i usaglašavanje zaliha ostaju kasnija automatizacija; mali početak koristi kontrolisane ručne korake i zasebnu jednom umanjenu webshop kvotu.
