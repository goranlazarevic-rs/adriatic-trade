# Kopije, oporavak i nadzor

Prijem porudžbina ostaje pauziran. Ovi postupci ne menjaju Minimax, ne izdaju račune i ne šalju poruke kupcima ili kuriru.

## Automatska kopija

Workflow `Adriatic Trade backups, monitoring and hosting`, operacija `backup`, svakog dana u 02:23 UTC. GitHub može odložiti zakazano izvršavanje. Ručna operacija `backup` dostupna je sa `main` grane.

Kopija obuhvata pun D1 SQL izvoz i sve objekte iz R2 `adriatic-trade-receipts`, njihove ključeve, metapodatke i SHA-256 sažetke. Provera vraća SQL u SQLite, proverava integritet, strane ključeve, broj redova i prisustvo PDF-ova na koje evidencija pokazuje. Promena R2 inventara tokom kopiranja prekida kopiju da bi se postupak ponovio.

Pre prenosa na GitHub sadržaj se šifruje AES-256-GCM. Nasumičan ključ svake kopije zaštićen je RSA-3072 OAEP SHA-256 javnim ključem u `ops/backup-public.pem`. GitHub artefakt `encrypted-backup-RUN-ATTEMPT` sadrži samo `.atbak` i njegov SHA-256. Čuvanje je 30 dana; lokacija je odvojena od Cloudflare-a. Dnevni interval znači do približno jednog dana gubitka od poslednje uspešne kopije. D1 Time Travel je dodatni, odvojeni sloj zaštite, nije kopija PDF-ova.

Privatni ključ je predat vlasniku u datoteci `Adriatic-Trade-kljuc-za-oporavak.zip`, odvojeno od repozitorijuma i GitHub artefakata. Preuzeti i sačuvati na dve bezbedne lokacije, jednu van mreže. Gubitak privatnog ključa onemogućava oporavak ovih kopija. Nikada ga ne stavljati u repozitorijum, Actions secrets, issue, log ili javni prilog.

Ograničenja: do 1 GiB ukupno, 128 MiB po objektu/SQL izvozu i 100.000 fajlova pri vraćanju; prekoračenje prekida kopiju i aktivira alarm. GitHub čuva istoriju kopija 30 dana; ovo nije zamena za propisanu dugoročnu arhivu dokumenata.

## Proba vraćanja

Na pouzdanom računaru preuzeti i raspakovati šifrovani GitHub artefakt i zasebno privatni ključ. Raditi u privatnom direktorijumu uz `umask 077`.

```sh
sha256sum -c adriatic-trade.atbak.sha256
node ops/seal.mjs unseal adriatic-trade.atbak backup.tar.gz /bezbedna/putanja/adriatic-trade-recovery-private.pem
python3 ops/backup.py restore backup.tar.gz izolovani-oporavak
```

Komanda pravi novu lokalnu SQLite bazu `izolovani-oporavak/restored.sqlite`, kopije objekata i provereni manifest. Postojeći cilj se odbija. Proveriti broj porudžbina i PDF-ova, kao i reprezentativni PDF kada postoji. Ne objavljivati podatke iz kopije. Nakon provere obrisati privremene nešifrovane datoteke sa računara.

Stvarni oporavak produkcije je zaseban postupak: pauzirati prijem, zabeležiti incident i novi snimak, pripremiti novu praznu D1 bazu i novi R2 bucket, vratiti SQL i objekte pod izvornim ključevima iz manifesta, proveriti i tek potom promeniti Worker bindings uz odobrenje vlasnika. Ne prepisivati produkcionu bazu i ne puštati automatski porudžbine ili ponovo izdavati fiskalne dokumente. Uskladiti oporavljene porudžbine sa Minimax-om i kurirom pre otvaranja.

## Nadzor i alarm

Operacija `monitor` zakazana je na pet minuta; GitHub raspored može kasniti. Proverava naslovnu stranu, admin i checkout, Worker health, konfiguraciju zaštite, rutu za porudžbine bez slanja porudžbine, stvarno čitanje D1 kontrole prijema i obaveznu autorizaciju admin API-ja. Namerno stanje `paused` je ispravno. Nadzor ne proverava plaćanje, slanje mejla, Minimax ili kurira i ne potvrđuje kompletan tok stvarne kupovine.

Proverava i da postoji neistekla šifrovana kopija mlađa od 36 sati. Greška nadzora ili kopiranja otvara jedan GitHub issue `[Operations] Adriatic Trade: … failure`, dodeljen `goranlazarevic-rs`. Ponovljene greške ne stvaraju duplikate; sledeća uspešna provera beleži oporavak i zatvara issue. Mejl/push obaveštenja zavise od podešavanja GitHub naloga; proveriti prijem obaveštenja na nalogu vlasnika. Ako GitHub Actions sam ne radi, ovaj nadzor ne može poslati alarm; za strožu neprekidnu kontrolu potreban je drugi nezavisan monitoring servis.

## Hosting

Javni sadržaj se gradi u `.web-dist` i objavljuje kao Workers Static Assets `adriatic-trade-web`; API Worker, D1 i R2 ostaju isti. SQL, izvorni operativni kod i ključevi nisu deo javnih datoteka. Operacije `hosting-preview` i `hosting-cutover` zahtevaju tačan aktuelni `main` SHA i postojeće odobrenje okruženja `worker-production`.

Pre promene domena čuva se `website-dns-recovery-RUN` sa dotadašnjim zapisima samo za dva veb imena. MX/TXT i ostali zapisi se proveravaju sažetkom. Neuspešna provera novog hostinga pokušava vraćanje starih veb DNS zapisa. DNS oporavak nije oporavak baze. Posle potvrđenog prelaska isključiti GitHub Pages objavljivanje, zadržati repozitorijum i istoriju koda.
