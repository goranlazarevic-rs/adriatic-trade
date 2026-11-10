# SEO – Adriatic Trade / Solana Nin Srbija

## Cilj i raspodela stranica

| Namera pretrage | Glavna stranica |
| --- | --- |
| nerafinisana morska so; cena; kupovina u Srbiji | Postojeći katalog `/proizvodi.html` |
| Solana Nin Srbija; Adriatic Trade | `/` |
| morska so Solana Nin; asortiman i cene | `/proizvodi.html` |
| nerafinisana sitna morska so 600 g | `/proizvodi/nerafinisana-sitna-600g.html` |
| nerafinisana krupna morska so 600 g | `/proizvodi/nerafinisana-krupna-600g.html` |
| nerafinisana sitna morska so 500 g kutija | `/proizvodi/nerafinisana-sitna-500g.html` |
| cvet soli 100 g / 125 g | Odgovarajuća postojeća stranica proizvoda |
| poreklo i proces proizvodnje | `/solana-nin.html` |

SEO se sprovodi na postojećim stranicama. Vizual, raspored, vidljivi tekstovi,
navigacija, fotografije i funkcije korpe ostaju identični početnom stanju.
Ne dodavati novu kategoriju niti stranicu za pojedinačne ključne reči.
Ne dodavati skriveni tekst, lažne ocene ili zdravstvena obećanja.

## Implementirano u SEO grani

- Ciljani naslov i opis postojećeg kataloga za nerafinisanu morsku so.
- Postojeće putanje i unutrašnji linkovi ostaju nepromenjeni.
- Posebni naslovi i opisi, jedinstven canonical i usklađen Open Graph.
- Statički HTML za ključni sadržaj; JavaScript nije uslov za čitanje ponude.
- `Organization` i `WebSite` sa stabilnim ID-ovima; `WebPage`/`CollectionPage`,
  `BreadcrumbList` i `ItemList` gde odgovaraju sadržaju.
- Dopunjeni `Product`/`Offer` podaci, stvarne SKU fotografije u deljenju.
- Uklonjena neproverena fiksna tvrdnja `InStock`; žive kvote i pauza prijema ostaju
  pod kontrolom postojećeg sistema. Dostupnost ponovo dodati u statičke podatke
  samo uz pouzdan proces sinhronizacije sa stvarnom prodajnom dostupnošću.
- Postojeći `sitemap.xml` i `robots.txt` ostaju nepromenjeni: 16 javnih stranica.
- `scripts/check-seo.py` u CI proverava i izvor i javni izlaz za objavu.
- Provereno je da su svi HTML sadržaji posle `</head>`, kao i CSS i JavaScript
  resursi, identični početnom produkcionom stanju.

## Obavezni nastavak posle objave

Postupak i merila: [SEO-RELEASE.md](docs/SEO-RELEASE.md).

Objava koda nije dokaz indeksiranja. U ovoj grani nisu prijavljeni sitemap ili
URL-ovi kroz Google Search Console/Bing nalog. Google URL-prefix svojstvo je dodato u nalogu vlasnika, a originalna HTML
oznaka verifikacije pripremljena je u početnoj stranici. Vlasništvo još nije
potvrđeno jer oznaka nije objavljena. Pristup Bing nalogu nije potvrđen. Nije kupljeno oglašavanje i nije ugovoren nijedan spoljni link.

## Izvori za proveru sadržaja i tehnike

- [Solana Nin – nerafinisana morska so](https://www.solananin.hr/hr/webshop/nerafinirana-morska-sol/)
- [Sitna 600 g – proizvođač](https://www.solananin.hr/hr/webshop/nerafinirana-morska-sol/nerafinirana-sitna-morska-sol-600-g/)
- [Krupna 600 g – proizvođač](https://www.solananin.hr/hr/webshop/nerafinirana-morska-sol/nerafinirana-krupna-morska-sol-600-g/)
- [Google – korisna struktura prodavnice](https://developers.google.com/search/docs/specialty/ecommerce/help-google-understand-your-ecommerce-site-structure)
- [Google – podaci o proizvodima](https://developers.google.com/search/docs/appearance/structured-data/product)
- [Google – pravila strukturiranih podataka](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)

## Merenje rezultata

U Search Console pratiti upite za nerafinisanu morsku so i Solanu Nin: prikaze,
klikove, CTR i prosečnu poziciju, uz filter Srbija i ciljnu stranicu. U postojećoj
GA4 konfiguraciji, uz saglasnost posetioca, pratiti prelazak iz kataloga na
proizvod, `add_to_cart` i kupovinu. Ne predstavljati jedan ručni upit ili jednu
prosečnu poziciju kao stalno prvo mesto za sve korisnike.
