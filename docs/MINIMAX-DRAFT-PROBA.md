# Proba prenosa jedne porudžbine u Minimax kao nacrta

Ova razvojna grana dodaje izolovani adapter i Windows alat za jedan probni nacrt.
Javni webshop, admin panel, produkcioni Worker, D1, prodajne kvote i kurirski/email
tok se ne menjaju. Simulator iz Draft PR #14 ostaje zaseban.

## Šta je već potvrđeno

Korisnik je 2.11.2026. kod sebe uspešno proverio Client + User prijavu i dobio
organizaciju **81179**, `APIAccess: D`. U Minimax interfejsu potvrđen je režim
obuke numeracije 1428454-1. API odgovor referentnog nacrta **24955965** pokazuje
šest stavki sa POPDV 3.2, cene sa PDV-om, kasira i probno plaćanje Tekući račun.
Taj odgovor služi proveri mapiranja, ne kao telo novog POST zahteva.

| Šifra | Minimax ItemId | Cena sa PDV-om, RSD |
|---|---:|---:|
| 10086 | 13473518 | 600 |
| 10012 | 13473554 | 800 |
| 10306 | 13473557 | 299 |
| 10307 | 13473558 | 299 |
| 10240 | 13473560 | 550 |
| DOSTAVA | 13473586 | 420 |

Kupac 9775669; skladište 40999; numeracija 77630; kasir 408672;
valuta 2 (RSD); stopa PDV-a 4; način plaćanja 622053.
Cena za kupca „Fizičko lice“ ima prednost isključivo nakon tačnog uparivanja
`Customer.ID` i `Item.ID`. Osnovne cene iz `GetItems.Price` nisu MP-WEB cene.

## Koraci na Windows računaru

1. Preuzmite ZIP ove razvojne grane sa GitHub-a i **raspakujte** ga u običan folder.
2. Potreban je Node.js 22+ (preporuka 24 LTS). Alat ga ne instalira automatski.
3. Otvorite `tools/minimax-draft/POKRENI-PROBU.cmd`.
4. Za lokalni pregled pritisnite Enter (opcija 1). Nema mrežnih poziva ni unosa lozinki.
5. Za stvarni prenos probnog nacrta pokrenite alat ponovo, izaberite **2** i
   upišite **KREIRAJ NACRT**. Proba koristi samo sintetičku porudžbinu
   `AT-MINIMAX-PROBA-001`: po jedan komad pet artikala i dostavu, **2968 RSD**.
6. Unesite Client kod i Client lozinku iz poruke podrške; User ime je
   `adriatic-webshop`, a User lozinka je ona za spoljnu aplikaciju u Minimax profilu.
   Tajni unosi su skriveni. Podaci idu lokalnim stdin kanalom u Node i zatim samo
   na HTTPS Minimax. Nema tajni u argumentima, konfiguraciji, browseru ili repozitorijumu.
7. Sačuvajte rezultat i otvorite link do kreiranog nacrta u Minimax-u. Proverite
   6 stavki, POPDV 3.2 i ukupno 2968 RSD. Ne klikćite Izdaj. Pošaljite samo red
   `REZULTAT`, bez pristupnih podataka.

Launcher koristi ExecutionPolicy Bypass samo za pokrenuti PowerShell proces;
ne menja sistemsku politiku. Ako organizaciona politika blokira skriptu,
ne isključujte zaštitu: prijavite blokadu radi drugog načina pokretanja.
Kod je čitljiv u `prompt.ps1`, `cli.mjs`, `client.mjs` i `model.mjs`.

## Zaštita od ponavljanja

Nema automatskog ponavljanja prijave ili POST-a, čak ni posle HTTP 401/429/5xx.
Pre kreiranja alat proverava pristup organizaciji, referentni nacrt i sve
aktuelne cene za kupca 9775669. Nedostajuća, duplirana ili promenjena cena
zaustavlja prenos umesto zamene iznosa iz porudžbine.

Lokalna evidencija nalazi se u
`%LOCALAPPDATA%/AdriaticTrade/MinimaxDraftProbe/81179/` i traje i kada raspakujete
novu kopiju grane. Čuva samo sintetički zahtev, otisak zahteva, status i ID nacrta.
Ne čuva pristupne podatke. Zaključavanje sprečava dva istovremena procesa na istom
računaru. Status `sending` se trajno upisuje pre slanja.

Ako POST uspe, ID se čuva pre naknadnog GET-a i provere stavki/iznosa/statusa.
Ponovno pokretanje sa poznatim ID-em samo čita i proverava postojeći nacrt.
Ako odgovor izostane ili se proces prekine pre upisa ID-a, nema novog slanja.
U Minimax-u prvo pronađite nacrt po osnovu
`WEBSHOP-PROBA:AT-MINIMAX-PROBA-001`. Zatim opcija **3** proverava njegov ID,
referencu, datum, cene, količine, poreze, skladište, kasira i plaćanje bez POST-a.
Pogrešan ID ili izdati račun ne prolaze proveru.

Posle nasilnog prekida može ostati `probe.lock`. Ne brišite ga niti evidenciju
da biste „probali ponovo“: prvo proverite da nema aktivnog procesa i istražite
ishod u Minimax-u. Oporavak zaključavanja se radi uz proveru prethodnog pokušaja.
Ovo je zaštita na jednom računaru, **nije Minimax garancija idempotentnosti**.
Ne pokrećite istu probu na drugom računaru ili nakon brisanja evidencije bez provere.

## Namerno ograničen obuhvat

- Adapter može poslati samo fiksni probni nacrt sa `Status: O`. Nema funkcije za
  izdavanje, refundaciju, brisanje, SEF slanje, PDF, email ili kurirsku pošiljku.
- Datum za novu probu je tekući dan po vremenu Europe/Belgrade. Oporavak zadržava
  datum prvog zahteva. Ne kopiraju se stari datum, ID računa, ID-jevi redova,
  RowVersion, InvoiceNumber, InvoiceValue, dokumenti i prilozi.
- `TEST01`, paketi, popusti, druge valute i proizvodna pouzećem plaćanja blokirani
  su pre prenosa. Za prvu probu koristi se `TEST_BANK_TRANSFER`, ne „Pouzećem“.
  Ne predstavljati 622053 kao potvrđeno mapiranje svih načina naplate.
- `DOSTAVA` je usluga bez skladišta; fizički artikli imaju skladište 40999.
  Nulta dostava ne dodaje stavku. Ovo ne potvrđuje obračun obaveza prema kuriru.
- Proba nacrta ne proverava fizičku zalihu, ne rezerviše robu i ne potvrđuje MP/VP
  knjiženje. `AssociationWithStock` se ne prepisuje iz nacrta kao podešavanje.
  Stvarno izdavanje čeka proveru zaliha/vrednovanja sa knjigovođom i odobrenja
  za prodaju. Činjenica da je obuka uključena nije poseban API sandbox.
- Webshop cenovnik/paketi, konačan način plaćanja kod kurira i poreske oznake
  fiskalnog izlaza zahtevaju zasebnu proveru pre produkcionog adaptera.

## Validacija i izvori

Pokrenuti iz korena repozitorijuma: `node --test tests/minimax-draft.mjs`.
Testovi koriste lažni transport bez pristupa Minimax-u i proveravaju mapiranje,
cene/zaokruživanje, bezbedno rukovanje greškama, kreiranje/čitanje i neizvestan
ishod/ponovljene i konkurentne pokušaje. Uspešni testovi ne znače da je stvarni
POST već izvršen. Stvarnu probu radi korisnik lokalno sa privatnim pristupnim podacima.

- [Client/User OAuth postupak](https://help.minimax.rs/help/api-za-programere)
- [AddIssuedInvoice](https://moj.minimax.rs/RS/API/Help/Api/POST-api-orgs-organisationId-issuedinvoices)
- [Nacrt i odvojena akcija izdavanja](https://help.minimax.rs/help/testiranje-api-prenosa-izdat-racun)
- [Fiskalna numeracija, kasir, jedinica mere i POPDV](https://help.minimax.rs/help/api-fiskalni-racun)
- [Customer cene](https://moj.minimax.rs/RS/API/Help/Api/GET-api-orgs-organisationId-items-pricelists)

Promene objaviti samo kao razvojnu granu i Draft PR. Ne spajati niti objavljivati
produkciju bez posebnog odobrenja.
