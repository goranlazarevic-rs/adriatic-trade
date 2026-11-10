# SEO paket: objava i indeksiranje

## Status

Paket je pripremljen na zasebnoj razvojnoj grani. U Google Search Console-u
naloga vlasnika dodato je URL-prefix svojstvo `https://adriatictrade.rs/`.
Originalna meta oznaka koju je Google izdao nalazi se u `index.html`;
vlasništvo još nije potvrđeno i sitemap nije prijavljen. Produkcija i `main` se menjaju
tek uz odobrenje konkretnog PR-a i objave, prema postojećem dogovoru. Rad na SEO
ne podrazumeva otvaranje prodaje, promenu Minimax režima ili objavu order Workera.

## 1. Provere pre objave

```sh
python3 scripts/check-seo.py
node scripts/build-web.mjs
python3 scripts/check-seo.py --root .web-dist
```

Sačekati uspešne obavezne CI provere i pregledati novu stranicu, početnu i jednu
stranicu proizvoda. Proveriti da su broj i veličine pakovanja i cene usklađeni sa
važećom deklaracijom i cenovnikom. Ne dodavati tvrdnje „bez aditiva“, „nejodirana“
ili zdravstvene tvrdnje bez odgovarajućih podataka za seriju za Srbiju.

## 2. Kontrolisana objava

Posle odobrenog merge-a zabeležiti puni SHA trenutnog `main` i objaviti statički
sajt postojećim hosting postupkom. `hosting-preview` u sadašnjem workflow-u
objavljuje isti web Worker koji koriste custom domeni: tretirati ga kao
produkcioni postupak, ne kao bezazlen izolovan pregled. Ne zaobilaziti proveru
odobrenog SHA ili zaštićeno okruženje. Za ovaj paket nije potreban deploy order
Workera, migracija D1, DNS izmena ili aktiviranje prijema porudžbina.

Posle objave:

```sh
python3 scripts/check-seo.py --live-base https://adriatictrade.rs
```

Proveriti i `/hosting-status.json` za odobreni SHA, HTTPS, stvarni status
`/robots.txt` i `/sitemap.xml`, kao i ponašanje nepostojećeg URL-a (404).
Uspešan lokalni audit nije dokaz da je Google prihvatio stranicu ili da će je
prikazati kao prošireni rezultat.

## 3. Google Search Console

Otvoriti nalog vlasnika u [Search Console](https://search.google.com/search-console).
Koristiti postojeće verifikovano vlasništvo ako postoji. Ako ne postoji,
verifikovati `adriatictrade.rs` pomoću vrednosti koju Google izda vlasniku; ne
izmišljati verifikacione kodove i ne menjati mail/DNS zapise radi druge svrhe.

1. URL Inspection → testirati početnu, novu kategoriju i tri stranice soli.
2. Zabeležiti rezultat indeksiranja, Google canonical i poslednje preuzimanje.
3. Ako prijavi prepreku, rešiti konkretan razlog pre traženja indeksiranja.
4. Sitemaps → prijaviti `https://adriatictrade.rs/sitemap.xml` i proveriti rezultat.
5. Request indexing za početnu i novu kategoriju, zatim po potrebi za proizvode.
6. U Rich Results Test proveriti jedan proizvod i breadcrumbs. Ispraviti
   obavezne greške; opcionalna upozorenja ne rešavati izmišljanjem zaliha/ocena.

Google navodi da sitemap i zahtev za indeksiranje ne garantuju indeksiranje,
rok ili poziciju. Ne slati zastarele sitemap ping URL-ove i ne koristiti
Indexing API za obične stranice proizvoda.

## 4. Bing i drugi izvori

U [Bing Webmaster Tools](https://www.bing.com/webmasters/) proveriti postojeće
vlasništvo, prijaviti sitemap i zatražiti indeksiranje nove kategorije. Import iz
Google naloga raditi samo u nalogu vlasnika i nakon odobrenja traženih pristupa.
IndexNow se može naknadno povezati uz ispravno postavljen verifikacioni ključ;
prijem IndexNow zahteva nije garancija indeksiranja i ne predstavlja prijavu
Google-u.

Proveriti spoljne veze koje već postoje (Instagram/profil firme i proizvođač).
Predlog za proizvođača je link sa njegovog spiska distributera na srpsku
kategoriju/prodavnicu. Slanje zahteva proizvođaču ili objava na tuđim kanalima
nisu deo izvršene izmene i zahtevaju zasebnu instrukciju korisnika.

## 5. Praćenje i odgovornost

Posle prvog preuzimanja i indeksiranja pratiti Search Console za Srbiju:
prikaze, klikove, CTR i prosečnu poziciju po upitu i stranici. Porediti jednake
periode kada postoji dovoljno podataka. Zabeležiti datume stvarne objave i
prijave pretraživačima; ne upisivati planirane korake kao izvršene.

Ako `site:` ne vrati URL, to je signal za URL Inspection, a ne dokaz da Google
sigurno nema URL u indeksu. Potvrđeno vlasništvo u Google/Bing alatima ostaje
preduslov za potvrdu indeksiranja. Prvo organsko mesto odmah se ne obećava.

## Reference

- [Google: zahtev za ponovno preuzimanje](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- [Google: sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: site operator](https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-site)
- [IndexNow dokumentacija](https://www.indexnow.org/documentation)
