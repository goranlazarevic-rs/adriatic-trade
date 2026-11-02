# Pregled zaliha iz Minimax-a

Razvojni dodatak 2.11.2026, Worker 4.10.2, u objedinjenu probnu granu #19. Nije objavljen u produkciji. Staging mora zasebno da se ažurira posle uspešne validacije punog SHA.

Verzija 4.10.1 objavljena je na staging-u kroz Release Gate #51. Stvarno čitanje nije uspelo: vlasnik je dostavio 502 odgovor sa `MINIMAX_HTTP_ERROR`. To potvrđuje neuspešan uzvodni HTTP odgovor, ali ne identifikuje njegov status niti korak; uzrok još nije potvrđen. Verzija 4.10.2 dodaje samo dijagnostiku: fiksan naziv koraka (prijava, organizacija ili zalihe), poznati SKU ako je primenljiv i broj uzvodnog HTTP statusa. Telo, zaglavlja i tajne iz Minimax greške ne prenose se. Način i broj poziva ostaju isti. Sledeća proba čeka ovu staging objavu; ne menjati pristupne podatke na osnovu same generičke greške.

## Ponašanje panela

Na tačnom probnom hostu, posle prijave, pojavljuje se „Zalihe iz Minimax-a · samo pregled“. Dugme **Pročitaj zalihe iz Minimax-a** tek na klik poziva autentifikovani `GET /admin/minimax-stock`. Nema automatskog čitanja pri prijavi, pozadinskog osvežavanja, kopiranja u kvote ili otvaranja prijema. Odjava briše prikaz; odgovor započet pre odjave ne može ga vratiti. Neuspešno novo čitanje uklanja prethodni prikaz da se staro stanje ne predstavi kao sveže.

Server koristi postojeće četiri privatne API tajne, proverava API pristup organizaciji **81179**, pa čita pet unapred povezanih fizičkih artikala iz **VP skladišta 40999**. Po artiklu koristi `GET api/orgs/81179/stocks?WarehouseId=40999&ItemID=<poznati ID>&Mode=1&CurrentPage=1&PageSize=100`. Pet filtriranih poziva je ograničeno nezavisno od veličine celog šifarnika. To nije uvoz svih novih Minimax artikala u webshop; novi SKU zahtevaju potvrđeno povezivanje sa katalogom. Paket nema nezavisno stanje zaliha.

Zvanična dokumentacija:
- https://moj.minimax.rs/RS/API/Help/Api/GET-api-orgs-organisationId-stocks
- https://help.minimax.rs/help/stock-stanje-zaliha

Odgovor proverava očekivani ID, šifru, jedinicu `kom`, agregat bez serije, jednu kompletnu stranicu i najviše jedan red po artiklu. Duplikati, drugi artikal, nepotpuna stranica, nepoznata jedinica ili nevažeća količina odbijaju ceo pregled, bez delimičnog rezultata. Nulta količina prikazuje **0 kom.**, negativna količina prikazuje vrednost sa upozorenjem, a izostao red ili `Quantity:null` prikazuje **Nije prijavljeno**. Izostao red se nikada ne pretvara u nulu. Troškovi, nabavne cene, vrednosti i prodajne cene se ne prenose u odgovor panela. Provider tekst/greške/tajne se ne prikazuju.

Prikazuje se vreme završenog očitavanja. To je posmatranje trenutnog API stanja tokom više poziva, ne atomski presek svih artikala ili garancija slobodne robe. `startedAt` i `readAt` omeđuju interval. Potrebno je novo očitavanje za novo stanje. API i assets probnog panela imaju `Cache-Control:no-store`.

## Odvajanje od prodajnih kvota

Nova ruta se obrađuje posle postojećeg Bearer/Origin pristupa, ali pre administrativne inicijalizacije šema: radi samo SELECT za marker odvojene baze, OAuth prijavu i API GET zahteve. Ne piše u D1, `checkout_stock`, reviziju kontrole, prijem porudžbina, rezervacije ili `minimax_drafts`. Zadržava se postojeća pauza. U produkciji je ruta isključena bez tačnih staging flags i markera. Staging wrapper dozvoljava samo GET na toj putanji, odbija drugi Origin i upis/metodu. Organizacija, skladište, SKU i API putanja nisu korisnički parametri.

Probne kvote sa sintetičkim količinama nisu stvarne zalihe i ne upoređuju se kao raspoloživost za prodaju. Pregled ne potvrđuje laboratorijsko/operativno oslobađanje robe, potpun prijem i nabavnu vrednost, rezervacije drugih kanala ili trenutak knjigovodstvenog razduženja.

Kasnije automatsko računanje raspoloživosti zahteva odvojeno trajno usaglašavanje rezervacija webshopa koje još nisu obuhvaćene Minimax razduženjem. Primer: Minimax 100, prihvaćeno 3 nerazdužena komada → 97 za sledeće kupce. Kada Minimax već prikaže 97 po tom razduženju, ista tri komada ne oduzimati ponovo. Ovaj dodatak to još NE implementira i zato nema dugme za prenos količina u kvote.

## Provera nakon staging ažuriranja

1. Prijaviti se postojećim privatnim probnim ADMIN_TOKEN-om. Probni prijem ostaviti pauziran. Ne praviti nove test porudžbine/nacrte radi pregleda zaliha.
2. Kliknuti **Pročitaj zalihe iz Minimax-a** i uporediti pet količina sa Minimax prikazom za isto VP skladište. Sačuvati samo rezultat bez tajni.
3. Potvrditi da probne kvote, pauza, postojeći brojevi porudžbina i nacrti nisu promenjeni.
4. Ako odgovor ne odgovara šemi ili nedostaje podatak, istražiti stvarni odgovor kroz privatni nalog bez izlaganja pristupnih podataka. Ne popunjavati pretpostavljene nule i ne otvarati stvarnu prodaju.

## Automatizovane provere

`tests/minimax-stock.mjs`: 22 testa uz SQLite koji izričito odbija svaki upis na stock ruti; postojeće kvote/revizija/pauza/porudžbine/journals ostaju netaknuti; 0/negativno/null/odsustvo, auth, origin, metoda, fiksni filteri, pogrešna organizacija, šifra/ID/jedinica/serija, duplikat/truncation/page, mreža/redirect/JSON i uklanjanje osetljivih polja.

`tests/minimax-integrated-runtime.mjs`: pravi workerd/D1 i staging wrapper čitaju simulirano stock stanje, odbijaju neispravan odgovor/metodu/pristup, čuvaju kvote/reviziju/pauzu i ne kreiraju račun. Zadržane su sve postojeće zajedničke probe i oporavak neizvesnog nacrta.

`tests/minimax-stock-browser.mjs`: pravi frontend, wrapper i Worker uz izolovani SQLite i simuliran Minimax na 1440/390/320 px: nema API poziva pri prijavi, ručno čitanje, nula/nepoznato/negativno, brisanje zastarelog prikaza nakon greške, nepromenjene kvote/pauza, kasni odgovor posle odjave i prelamanje prikaza.

Automatizovane provere ne koriste stvarne Minimax podatke. Živo čitanje stanja u 4.10.1 nije uspelo; uzrok čeka dijagnostiku u 4.10.2 i poređenje vlasnika.
