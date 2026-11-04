# Adriatic Trade — kopija originalnih fiskalnih računa u OneDrive

Status: pripremljeno za proveru; nije aktivirano na produkciji ili korisnikovom računaru. Instalaciju pokrenuti tek posle objave serverske izmene, provere na Windows-u i podešavanja posebnog ključa arhive.

## Šta dobijate

- Originalni PDF ostaje u arhivi webshopa. Novi dokumenti tamo se organizuju po godini i mesecu izdavanja u vremenskoj zoni Srbije. Postojeći objekti ostaju dostupni na ranijim adresama.
- Windows preuzima PDF u izabrani postojeći OneDrive nalog, npr. `OneDrive/Adriatic Trade/Fiskalni racuni/2026/11/porudzbina-AT-.../sale-oznaka.pdf`.
- Ime fajla služi jednoznačnosti; sadržaj PDF-a ostaje identičan originalu. Obuhvaćene su evidentirane prodaje i refundacije, bez obzira na ishod slanja mejla.
- Proverava se SHA-256 svakog novog i svakog postojećeg PDF-a. Postojeći PDF se ne prepisuje. Razlika zaustavlja preuzimanje radi provere.
- Brisanje dokumenta na serveru ne briše preuzetu kopiju. Ručno obrisana lokalna kopija preuzima se ponovo ako original i dalje postoji.
- Raniji računi bez originala ili bez potpune fiskalne evidencije prijavljuju se kao potrebna dopuna, bez lažne potvrde da su svi preuzeti.

## Jednokratno podešavanje webshopa

Administrator objavljuje pregledanu izmenu Workera i kroz bezbedno upravljanje tajnama postavlja novi, nasumičan `FISCAL_ARCHIVE_TOKEN` od najmanje 32 znaka. Mora biti različit od administratorskog ključa. Nemojte ga slati u chat, unositi u GitHub kod ili stavljati u OneDrive. Ključ se unosi direktno na računaru i omogućava samo čitanje inventara i originalnih PDF-ova; nema pristup izmeni porudžbina. Opoziva se zamenom ili uklanjanjem ove serverske tajne. Proveriti da R2 arhiva nema javni pristup.

## Jednokratno podešavanje računara

1. Potrebni su Windows 10/11, prijavljen i pokrenut OneDrive i Node.js 22 ili noviji. Raspakujte paket.
2. Pokrenite `PODESI-ARHIVU.cmd`. Ako postoji više OneDrive naloga, izaberite broj naloga namenjenog firmi. Unesite poseban ključ arhive u skriveno polje.

Ako je uz instalacioni paket isporučen privatni `destination.json`, instalacija automatski koristi njegovu putanju, uključujući razmake i srpska slova. Odredište mora biti unutar postojećeg OneDrive naloga na tom računaru. Taj fajl sadrži samo putanju i ne postavlja se u javni repozitorijum. Putanja se može zadati i parametrom `-Destination` pri pokretanju `setup.ps1`.
3. Prvo preuzimanje mora uspeti i arhiva biti potpuna da bi se zadatak uključio. Prazna nova evidencija može biti ispravna; uporedite broj dokumenata sa admin panelom. Nije potrebno izdavati probni fiskalni račun radi instalacije.
4. U otvorenom folderu za `Fiskalni racuni` izaberite desni klik → **Always keep on this device**. Sačekajte da OneDrive potvrdi sinhronizaciju. Tako imate kopiju i na disku i na cloud-u.

Zadatak `AdriaticTrade-FiscalArchive` radi svakog dana u 18:00 po vremenu računara i pri prijavi u Windows, sa pravima prijavljenog korisnika. Računar i mreža moraju biti dostupni; kada računar ne radi, preuzimanje nastavlja pri sledećoj prijavi. Po grešci postoje do tri ponovna pokušaja na 15 minuta. Ručno pokretanje: `PREUZMI-SADA.cmd` ili isti zadatak u Windows Task Scheduler-u.

Ključ je zaštićen Windows DPAPI-jem pod tim korisnikom i računarom. Skripte, ključ i izveštaji su u `%LOCALAPPDATA%/AdriaticTrade/FiscalArchive`, izvan sinhronizovanog foldera. OneDrive lozinka se ne unosi u ovaj alat. Za prenos na drugi računar potrebno je ponoviti instalaciju. Zadatak ne traži administratorska prava.

## Kontrola i oporavak

- U Task Scheduler-u pregledati poslednji rezultat: `0` uspeh, `1` greška, `2` potrebna dopuna ranijih dokumenata. Lokalni `last-success.json` beleži poslednje potpuno preuzimanje. On **ne potvrđuje** da je OneDrive završio slanje; to proveriti u OneDrive aplikaciji.
- Ako postojeći PDF ima drugačiji otisak, sačuvati ga odvojeno radi provere, uporediti sa serverom, pa ponoviti preuzimanje. Alat ga nikada sam ne prepravlja.
- Posle ponovnog pokretanja Windows-a uklanja se brava prekinutog preuzimanja. Ako je proces nasilno ugašen bez restarta, prvo potvrditi da preuzimanje više ne radi, pa ukloniti samo lokalni `download.lock` i ponoviti.
- Za promenu ključa ponoviti instalaciju. Za isključivanje obrisati zadatak u Task Scheduler-u. Brisanje zadatka ne briše račune.
- OneDrive može preneti ručno brisanje na druge uređaje. Koristite i istoriju verzija/oporavak fajlova. Postojeća zasebna šifrovana sistemska kopija sa čuvanjem od 30 dana ostaje deo oporavka; dugoročni folder se ne prazni automatski.

Provera prihvatanja na računaru: preuzeti sintetički PDF u odvojenom testnom okruženju, potvrditi identičan SHA-256 i zelenu OneDrive oznaku, ponoviti bez dupliranja, proveriti zakazano izvršavanje i ponovni download posle brisanja samo testne lokalne kopije. Računi iz Minimax-a i dalje se ručno prilažu webshop porudžbini; ovaj alat ne preuzima dokumente direktno iz Minimax-a.

## Provere za razvoj

`node --test tests/fiscal-archive.mjs tests/first-sale-fiscal.mjs`

Windows: `powershell.exe -NoProfile -File tests/fiscal-archive-windows.ps1`. Odvojeni GitHub workflow proverava Windows putanje, sintaksu PowerShell-a, DPAPI i prenos tajne preko stdin-a. Lokalna Linux provera ne potvrđuje Windows Task Scheduler ili stvarnu OneDrive sinhronizaciju.

Microsoft: [Always keep on this device](https://support.microsoft.com/en-gb/onedrive/save-disk-space-with-onedrive-files-on-demand-for-windows), [DPAPI zaštita akreditiva](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/export-clixml?view=powershell-5.1).
