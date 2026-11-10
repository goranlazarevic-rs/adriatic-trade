# SEO paket: objava i indeksiranje

## Obim: isključivo SEO

Koriste se postojeće stranice. Ne menjaju se vizual, raspored, vidljivi tekstovi,
navigacija, fotografije, CSS ili JavaScript. U ovom paketu HTML izmene su samo
unutar `<head>`: naslovi/opisi, social metadata, strukturirani podaci i Google
verifikaciona oznaka. Katalog `/proizvodi.html` je ciljna postojeća stranica za
upit „nerafinisana morska so“. Mapa sajta zadržava postojećih 16 URL-ova.

## Status

### Objavljeno 10.11.2026: PR #31

- Produkcioni `main`: `56f935842b7b7ef8e4fc893d3cbc24a6e5b3011c`.
- [Hosting objava 42901925788, pokušaj 2](https://github.com/goranlazarevic-rs/adriatic-trade/actions/runs/42901925788/attempts/2): uspešna; isti SHA potvrđen na custom domenu i workers.dev.
- Google URL-prefix svojstvo `https://adriatictrade.rs/` verifikovano originalnom meta oznakom u `index.html`.
- Sitemap `https://adriatictrade.rs/sitemap.xml`: **Success, 16 discovered pages**.
- Početna i katalog: **URL is on Google**; zasebni zahtevi za novo indeksiranje prihvaćeni.
- Performance izveštaj još obrađuje podatke; trenutno nema osnova za zaključak o promeni pozicije.

### Dodatna provera proizvoda 10.11.2026.

Rezultati iz vlasničkog Google URL Inspection-a, a ne procena pomoću `site:` upita.
Za svih pet URL-ova preuzimanje je uspešno, crawl/indexing dozvoljeni,
Google-selected canonical je sam provereni URL.

| Stranica u `/proizvodi/` | Google status | Poslednji crawl prikazan u alatu |
| --- | --- | --- |
| `cvet-soli-100g.html` | URL is on Google / Page is indexed | 04.11.2026. 07:39:01 |
| `cvet-soli-125g.html` | URL is on Google / Page is indexed | 20.10.2026. 11:43:56 |
| `nerafinisana-sitna-600g.html` | URL is on Google / Page is indexed | 04.11.2026. 17:38:47 |
| `nerafinisana-krupna-600g.html` | URL is on Google / Page is indexed | 21.10.2026. 08:18:49 |
| `nerafinisana-sitna-500g.html` | URL is on Google / Page is indexed | 20.10.2026. 11:15:57 |

Za 500 g samo polje Sitemaps prikazuje `Temporary processing error`; stranica
je indeksirana, Google canonical ispravan, a mapa sajta globalno prihvaćena.
To nije nalaz da je proizvod isključen iz indeksa.

Google Rich Results Test uspešno je preuzeo obe **trenutno objavljene** stranice:

- [Cvet soli 100 g — Google rezultat](https://search.google.com/test/rich-results/result?id=fxhvHREfZyAUS0TworKBLA): **3 valid items**, Product snippets, Merchant listings i Breadcrumbs.
- [Cvet soli 125 g — Google rezultat](https://search.google.com/test/rich-results/result?id=Hicj3TUZQ21RZrGddibLxw): **3 valid items**, iste tri vrste.
- Potvrđeni SKU, fotografija i cena: `10086` / 600 RSD i `10012` / 800 RSD.
- Merchant listings ima samo tri opcione preporuke: `shippingDetails`, `availability`, `hasMerchantReturnPolicy`. Nema obaveznih grešaka.
- Dostupnost se ne izmišlja: prodajna pauza i zalihe zavise od živog sistema.
  Uslovi dostave/povraćaja mogu se strukturirati kada su konačno potvrđeni i usklađeni sa vidljivim pravilima.

### Pripremljeno za zasebno odobrenje i objavu

Nova grana `seo/cvet-soli-products-20261110` menja samo `<head>` dve postojeće
stranice cveta soli: ciljani title/meta opis i Open Graph, usklađeni opis u
JSON-LD i veze `WebPage.mainEntity` / `Product.mainEntityOfPage`.
Opis navodi postojeće cene sa PDV-om i dostavu u Srbiji. Pri promeni cena
uskladiti i ove opise, pored postojećeg Offer-a i kataloga.

Svih 24 HTML tela i svih 10 CSS/JavaScript datoteka ostaju identični objavljenom
SHA-u. Nema nove stranice, vidljivog teksta, navigacije, slike ili promene korpe.
Lokalni i izgrađeni SEO audit prolaze za 16 stranica.

Ove dodatne dorade još nisu objavljene niti predstavljene kao Google-om
preuzeta nova verzija. Posle odobrenja konkretnog PR-a i objave ponoviti URL
proveru dva cveta soli i zatražiti osvežavanje. Ne ponavljati zahteve pre objave.
Rad na SEO ne podrazumeva otvaranje prodaje, promenu Minimax režima ili objavu
order Workera. Link sa sajta Solane Nin čeka dogovor vlasnika.

## 1. Provere pre objave

```sh
python3 scripts/check-seo.py
node scripts/build-web.mjs
python3 scripts/check-seo.py --root .web-dist
```

Sačekati uspešne obavezne CI provere i uporediti sadržaj svih HTML stranica posle
`</head>` sa početnim stanjem. Proveriti i da nema izmena CSS/JavaScript resursa.
Proveriti da su broj i veličine pakovanja i cene u SEO podacima usklađeni sa
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

Ako javni origin prihvata read-only audit klijent, opciono pokrenuti
`python3 scripts/check-seo.py --live-base https://adriatictrade.rs`.
Dana 10.11.2026. Cloudflare je tom klijentu vratio 403/1010; ne zaobilaziti
zaštitu promenom identiteta klijenta. Živu proveru tada raditi kroz pravi
browser i Google live alate, uz lokalni audit izlaza za objavu.

Proveriti i `/hosting-status.json` za odobreni SHA, HTTPS, stvarni status
`/robots.txt` i `/sitemap.xml`, kao i ponašanje nepostojećeg URL-a (404).
Uspešan lokalni audit nije dokaz da je Google prihvatio stranicu ili da će je
prikazati kao prošireni rezultat.

## 3. Google Search Console

Otvoriti nalog vlasnika u [Search Console](https://search.google.com/search-console).
Koristiti postojeće verifikovano vlasništvo ako postoji. Ako ne postoji,
verifikovati `adriatictrade.rs` pomoću vrednosti koju Google izda vlasniku; ne
izmišljati verifikacione kodove i ne menjati mail/DNS zapise radi druge svrhe.

1. URL Inspection → testirati početnu, postojeći katalog i tri stranice soli.
2. Zabeležiti rezultat indeksiranja, Google canonical i poslednje preuzimanje.
3. Ako prijavi prepreku, rešiti konkretan razlog pre traženja indeksiranja.
4. Sitemaps → prijaviti `https://adriatictrade.rs/sitemap.xml` i proveriti rezultat.
5. Request indexing za početnu i postojeći katalog, zatim po potrebi za proizvode.
6. U Rich Results Test proveriti jedan proizvod i breadcrumbs. Ispraviti
   obavezne greške; opcionalna upozorenja ne rešavati izmišljanjem zaliha/ocena.

Google navodi da sitemap i zahtev za indeksiranje ne garantuju indeksiranje,
rok ili poziciju. Ne slati zastarele sitemap ping URL-ove i ne koristiti
Indexing API za obične stranice proizvoda.

## 4. Bing i drugi izvori

U [Bing Webmaster Tools](https://www.bing.com/webmasters/) proveriti postojeće
vlasništvo, prijaviti sitemap i zatražiti indeksiranje postojećeg kataloga. Import iz
Google naloga raditi samo u nalogu vlasnika i nakon odobrenja traženih pristupa.
IndexNow se može naknadno povezati uz ispravno postavljen verifikacioni ključ;
prijem IndexNow zahteva nije garancija indeksiranja i ne predstavlja prijavu
Google-u.

Proveriti spoljne veze koje već postoje (Instagram/profil firme i proizvođač).
Predlog za proizvođača je link sa njegovog spiska distributera na srpsku
prodavnicu. Slanje zahteva proizvođaču ili objava na tuđim kanalima
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
