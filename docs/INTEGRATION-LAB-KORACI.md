# Webshop + Minimax + kurir: korak po korak

Stanje 31.10.2026. Razvojna grana `feat/integration-lab-20261031`.

## 1. Šta je sada urađeno

Dodat je zaseban **lokalni probni panel**. On simulira potvrdu webshop porudžbine, prenos primljene narudžbine, proveru zaliha, prijem dokumenta/PDF-a, poruku kupcu, kreiranje pošiljke, predaju, isporuku i naplatu. Nije aktiviran na javnom webshopu niti povezan sa stvarnim Minimaxom ili kurirom.

Nema unosa sertifikata, PAK-a, API ključeva ili pravih porudžbina. Ne postoje pozivi za fiskalno izdavanje. Sintetički PDF nosi vidljivu oznaku `SIMULATION - NOT A FISCAL RECEIPT`. Adrese završavaju na `example.invalid`. Email se čuva samo kao simulirani zapis; ne postoji SMTP/Resend slanje. Nema pravih kurirskih nalepnica ili preuzimanja. Testne poreske oznake nisu poreski savet ili produkciono mapiranje.

Simulator ima sopstvenu SQLite evidenciju. To nije Cloudflare D1, R2 ili produkcioni panel. Kod lokalne simulacije moraće da se prilagodi D1 transakcijama i stvarnim API ugovorima u narednoj fazi. Ovaj korak proverava poslovni redosled i lokalne zaštite, **ne dokazuje kompatibilnost Minimax API-ja ili garanciju provajdera protiv duplikata**.

## 2. Kako da pokreneš probu na Windows računaru

1. Otvori razvojni PR i njegovu granu na GitHubu. Proveri da piše `feat/integration-lab-20261031`, ne `main`.
2. Na stranici koda izaberi **Code > Download ZIP**. Raspakuj ZIP u novu fasciklu. Ne menjaj produkcione fajlove niti otvaraj Cloudflare.
3. Potreban je **Node.js 24 ili noviji**, isti glavni runtime kao u validaciji repozitorijuma. Ako nije instaliran, preuzmi odgovarajući instalacioni paket sa zvanične stranice `https://nodejs.org/`, instaliraj i otvori novi terminal.
4. U raspakovanoj fascikli otvori `tools > integration-lab > POKRENI-TEST.cmd` dvoklikom. Ako Node nije dostupan, dobićeš poruku umesto pokretanja.
5. U Edge-u ili Chrome-u otvori **http://127.0.0.1:4317**. Ovaj link radi samo na računaru na kome je simulator pokrenut; nije javni link i nije link za telefon.
6. Na vrhu proveri oznaku **SAMO SIMULACIJA**. U listi moraju biti samo `TEST-...` porudžbine. Ne unosi stvarne podatke kupaca.
7. Drži komandni prozor otvoren dok radiš. Za kraj pritisni **Ctrl+C** u tom prozoru. Podaci se podrazumevano brišu pri gašenju; osvežavanje stranice ih ne briše.

Alternativa za terminal, iz korena raspakovanog projekta:

```powershell
node --version
node tools/integration-lab/server.mjs
```

Nema `npm install`, `.env`, prijave na Cloudflare ili Minimax. Ako je port 4317 zauzet, zatvori ranije pokrenuti simulator. Ne pokreći drugi primerak istovremeno na istom portu.

Za proveru nastavka posle gašenja koristi novu lokalnu TEST datoteku, iz korena projekta:

```powershell
node tools/integration-lab/server.mjs --db .integration-lab-proba.sqlite
```

Pri sledećem pokretanju ista komanda nastavlja istu probu. Postojeća baza bez oznake laboratorije se odbija pre upisa. Za novu probu ugasi server i izaberi drugi, nov naziv TEST datoteke; ne briši baze drugih aplikacija.

## 3. Prva proba: kurirsko pouzeće

Izaberi **TEST-COD-001**, scenario **Uspešan odgovor**. Sintetički iznos je 598 RSD robe + 420 RSD dostave = **1.018 RSD**.

| Korak | Klik u probnom panelu | Šta moraš da vidiš |
|---|---|---|
| 1 | Potvrdi i prenesi TEST porudžbinu | Potvrđena porudžbina, jedan TEST zapis primljene narudžbine; nema računa, isporuke ili naplate |
| 2 | Ponovi isti klik | Isti ID prenosa; broj pokušaja ostaje 1 |
| 3 | Proveri TEST zalihe | Proverena raspoloživost; bez smanjenja ili rezervacije zaliha |
| 4 | Simuliraj prijem dokumenta | Jedan sintetički dokument; ovo predstavlja budući povrat dokumenta koji operater završava u Minimaxu |
| 5 | Preuzmi TEST PDF | Vidljiva oznaka simulacije, iznos 1.018 RSD i odgovarajući TEST ID |
| 6 | Simuliraj slanje / ponovi poruku | Jedan zapis PDF poruke na adresu ove porudžbine u lokalnom simulatoru |
| 7 | Kreiraj TEST pošiljku | Jedan TEST ID pošiljke, otkupnina 1.018 RSD; isporuka i dalje na čekanju |
| 8 | Simuliraj predaju kuriru | Predato; naplata ostaje nenaplaćena |
| 9 | Simuliraj isporuku | Isporučeno; naplata još ostaje nenaplaćena do posebne potvrde |
| 10 | Simuliraj potvrdu naplate | Evidentirana TEST naplata kurira; prenos otkupnine i dalje na čekanju |
| 11 | Simuliraj prenos otkupnine | Evidentiran TEST prenos novca; isti račun i isti ID pošiljke |

Ponovi klikove za dokument, poruku, pošiljku, predaju i naplatu: ne sme nastati drugi dokument, poruka ili pošiljka. Brojači na dnu prikazuju zbir svih proba, ne samo izabrane porudžbine. Posebna evidencija operacija prikazuje podatke izabrane porudžbine.

U stvarnom toku trenutak fiskalizacije mora pratiti propise i stvarni promet. Sintetički raspored klikova ne daje ovlašćenje za prevremeno izdavanje stvarnog računa.

## 4. Proba prekida veze i poruke koja ne uspe

### Izgubljen odgovor

1. Izaberi **TEST-TIMEOUT-005** i scenario **Izgubljen odgovor posle nastanka zapisa**.
2. Potvrdi TEST porudžbinu. Simulator kreira jedan primljeni nalog, a naš red prikazuje **NEIZVESTAN ISHOD** jer odgovor nije potvrđen.
3. Ponovi potvrdu. Mora da bude blokirana; ne sme nastati drugi nalog.
4. Izaberi **Proveri ishod prenosa**. Sistem pronalazi već nastali TEST zapis i beleži njegov ID.
5. Vrati scenario **Uspešan odgovor** i nastavi zalihama i dokumentom.
6. Isti postupak možeš ponoviti za poruku i pošiljku: scenario postavi pre odgovarajućeg klika, pa koristi baš njeno dugme **Proveri ishod**.
7. Kod trajne TEST baze ugasi i ponovo pokreni simulator dok je status neizvestan. Posle ponovnog otvaranja nastavi proverom ishoda. Status se ne gubi gašenjem.

Ako provera ne može da potvrdi zapis, operacija mora ostati blokirana radi ručne provere. Simulator testira i taj slučaj automatski. U stvarnom API-ju pretraga po našoj referenci, stabilni ključ i uslovi ponavljanja tek treba da budu potvrđeni sa provajderom.

### Odbijena poruka

1. Na porudžbini sa TEST PDF-om, pre prvog slanja izaberi **Email odbijen pre prihvatanja**.
2. Klikni **Simuliraj slanje / ponovi poruku**. Poruka je označena za ponovno slanje; račun se ne menja.
3. Vrati **Uspešan odgovor** i ponovi slanje. Koriste se ista adresa, isti ID računa, sadržaj PDF-a i ključ poruke.
4. Ako je poruka već uspešno završena, novi klik ne simulira naknadni kvar niti kreira novu poruku.

U laboratoriji „potvrđeno” znači da je simulator prihvatio zapis. U stvarnom email servisu prihvatanje nije dokaz dostave u sanduče kupca; statusi prihvatanja, isporuke, odbijanja i problema zahtevaju zasebnu obradu.

## 5. Ostale probe

- **TEST-STOCK-003:** potvrda/prenos uspeva, provera zaliha staje. Prijem dokumenta i pošiljka ne smeju proći. Test nema stvarnog robnog izdavanja.
- **TEST-SKU-004:** potvrda ostaje evidentirana u laboratoriji, ali prenos staje jer šifra nije mapirana. Nema automatskog otvaranja artikla. Potvrđena porudžbina i uspešan prenos su odvojeni statusi.
- **TEST-LOCAL-002:** potvrdi/prenesi, simuliraj potvrdu naplate, proveri zalihe, simuliraj prijem dokumenta i poruku, zatim ličnu isporuku. Iznos je 598 RSD, bez dostave. Kurirska dugmad su isključena. **Ovo proverava samo razdvajanje statusa; ne simulira obavezni AP/AR/PP niz stvarnog avansa.**
- **Neuručen povrat:** na novoj probi kurirskog toka, posle predaje a pre isporuke klikni **Simuliraj neuručen povrat**. Ostaje nenaplaćeno. Povrat ne izdaje fiskalnu refundaciju; ta funkcija još nije implementirana.

## 6. Šta treba pripremiti paralelno

### Minimax: zahtev podršci koji korisnik šalje

U Minimaxu otvori **Zahtevi za pomoć** i zatraži pisanu potvrdu:

1. Da li je dostupna posebna testna organizacija za naš direktni API konektor i kako je nedvosmisleno razlikujemo od stvarne organizacije?
2. Da li ona može koristiti sandbox fiskalizacije, sa kojim V-PFR endpointom i kojim testnim sertifikatom? Ko obezbeđuje sertifikat i uputstvo za uvoz?
3. Da li test može uticati na stvarne zalihe, knjiženja, PDV ili SEF i kako se to sprečava?
4. Kako dobijamo Client podatke i ograničavamo aplikaciju samo na testnu organizaciju?
5. Koje RS API metode upisuju i čitaju **primljene narudžbine**, pronalaze ih po webshop referenci, prate vezu do izdatog računa i vraćaju originalni fiskalni PDF/PFR podatke?
6. Da li je webshop referenca jedinstvena, postoji li idempotency podrška i kako proveriti ishod pre ponavljanja posle timeout-a? Koji su limiti učestalosti i preporuka za periodično čitanje?
7. Kako se u izolaciji proverava ceo niz avans, konačni račun, automatska avansna refundacija i povraćaj?

Ne šalji sertifikate, PAK, lozinke ili Client secret kroz ovaj razgovor ili screenshot. Simulator ih ne traži. Minimax dokumentuje dobijanje Client podataka od podrške i otvaranje aplikacije preko **Moj profil > Uredi osnovne podatke > Nova aplikacija**. Prava moraju biti dodeljena odgovarajućoj organizaciji. [S3]

Oznaka „obuka” ne predstavlja potvrdu da je fiskalni sistem odvojen od produkcije. Dokumentacija objašnjava numeraciju obuke i oznaku na dokumentu, ali ne potvrđuje sandbox na našem nalogu. [S4] Dok ne dobijemo potvrdu okruženja, ne uvozimo sertifikat niti pozivamo izdavanje.

### Kurir: izbor i tehnički podaci

Treba odabrati ugovorenog kurira. Od njega tražiti testni API nalog i dokumentaciju za kreiranje/proveru pošiljke, jedinstvenu referencu, ponovljeni zahtev, broj i format nalepnice, statuse i verifikaciju webhooka, razliku između nalepnice i zakazivanja preuzimanja, otkupninu i izveštaj prenosa novca. Potvrditi ko naplaćuje dostavu kupcu, naknade i iznos otkupnine da ne dođe do duple naplate. Bez izabranog kurira ne ugrađujemo izmišljeni API.

### Šifarnik

Pripremiti tabelu: webshop SKU, Minimax ID/šifra, naziv, jedinica mere, poreska oznaka, testno skladište i pravilo dostave/popusta. Isto uraditi za pakete. [S1] Podrška/računovođa potvrđuje poresko mapiranje. Simulator namerno koristi nepotvrđenu poresku oznaku i ne obračunava PDV.

## 7. Sledeći razvojni koraci

| Faza | Konkretan rezultat | Šta je potrebno |
|---|---|---|
| 1 - urađena | Lokalni probni panel, trajni ključevi, provera neizvesnog ishoda, izolovani testovi | Nema sertifikata, naloga ili API ključeva |
| 2 | Poseban testni Worker, D1 i privatni R2; testni panel i početno samo čitanje Minimax organizacije/šifarnika/zaliha | Potvrđena testna organizacija, API ugovor i ograničena prava; tajne samo serverski |
| 3 | Potvrda u testnom portalu prenosi jednu primljenu narudžbinu; prikazuje Minimax ID | Testirane D1 konkurentne operacije, mapiranje i pretraga po referenci; izdavanje isključeno |
| 4 | Operater u potvrđenom testnom režimu završava dokument; preuzimanje pravog testnog PDF-a i veza sa porudžbinom | Potvrđeni testni sertifikat/okruženje, pouzdana veza narudžbina-račun, testirani AP/AR/PP/PR tokovi |
| 5 | Poruka preko simulatora/testnog primaoca i kurirski sandbox sa nalepnicom/statusima | Izabran kurir, dokumentacija, dozvoljeni testni primaoci, potvrđeno odsustvo stvarnog preuzimanja |
| 6 | Pregled i odvojeno odobrena produkciona aktivacija | Prave tajne i PGJO u odgovarajućem okruženju, provere, postupak oporavka i izričito odobrenje |

Nema prelaska na WooCommerce. Potvrda porudžbine, fiskalno izdavanje, slanje, kurirska predaja, naplata i prenos novca ostaju odvojene evidencije. Za početak je planirano ručno izdavanje u Minimaxu; automatizuje se prenos i povrat podataka, a ne neograničeno izdavanje.

## 8. Tehnička provera

```powershell
node tests/integration-lab.mjs
```

Testovi obuhvataju ponovljene klikove, trajnost posle restartovanja, neizvestan ishod bez dokaza, nepoznati SKU/nedovoljnu zalihu, PDF, odvojene statuse, ponavljanje iste poruke, ponovnu upotrebu istog ključa kroz dva DB klijenta, zabranu stvarnih ID-eva i zaštitu lokalnog HTTP servisa. Ovo nisu testovi konkurentnih D1 radnika niti opterećenja provajdera.

Server sluša samo `127.0.0.1`. Zahteva tačan Host i lokalni Origin za izmene, nasumični token i ograničen JSON. Ne služi proizvoljne fajlove niti učitava `.env`. Za trajnost se koristi lokalna laboratorijska baza. PDF se preuzima samo kroz lokalni autorizovani zahtev.

## Zvanični izvori, provereni 31.10.2026.

- [S1 - Primljene narudžbine](https://help.minimax.rs/help/opis-integracije-na-primljenu-porudzbinu): opis poslovnog toka i šifri; nije API ugovor našeg konektora.
- [S2 - Provera zaliha](https://help.minimax.rs/help/provera-zaliha-pre-izdavanja-fiskalnog-racuna): provera pre fiskalizacije.
- [S3 - API za programere](https://help.minimax.rs/help/api-za-programere): Client/User podaci i prava organizacije.
- [S4 - Obuka](https://help.minimax.rs/help/obuka-prodaja-i-obuka-refundacija): numeracija obuke i oznaka dokumenta, bez potvrde sandbox dostupnosti za Adriatic Trade.
