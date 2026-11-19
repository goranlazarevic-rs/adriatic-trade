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
| cvet soli; cvet soli Solana Nin; cena u Srbiji | `/proizvodi/cvet-soli-125g.html` |
| cvet soli 100 g; natron kesa | `/proizvodi/cvet-soli-100g.html` |
| poreklo i proces proizvodnje | `/solana-nin.html` |

SEO se sprovodi na postojećim stranicama. Vizual, raspored, navigacija,
fotografije i funkcije korpe ostaju nepromenjeni. PR #31 i #32 menjali su samo
SEO podatke; korisnik je 19.11.2026. odobrio i ciljane dorade vidljivih tekstova,
uz očuvanje kvaliteta opisa i prirodnog tona.
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

SEO paket PR #31 objavljen je 10.11.2026. Google vlasništvo je potvrđeno,
sitemap prihvaćen (16 stranica), a osvežavanje početne i kataloga zatraženo.
URL Inspection potvrđuje da su svih pet pojedinačnih proizvoda već indeksirani,
sa sopstvenim Google canonical adresama. Oba cveta soli prolaze Rich Results Test.
Tačni rezultati i razlika između objavljenog paketa i novih pripremljenih dorada
nalaze se u [evidenciji objave](docs/SEO-RELEASE.md#status).
Pristup Bing nalogu nije potvrđen. Nije kupljeno oglašavanje i nije ugovoren
spoljni link. Link sa sajta Solane Nin vlasnik tek treba da dogovori.

## Odobrene tekstualne dorade 19.11.2026.

- Katalog: H1 „Nerafinisana morska so i cvet soli Solane Nin“ i uvod koji
  razlikuje so za pripremu hrane od cveta soli za završno začinjavanje.
- Početna: H1 „Nerafinisana so. Rođena iz Jadrana.“ zadržava poruku o poreklu;
  podnaslov „Nerafinisana morska so i cvet soli Solane Nin.“ precizira ponudu.
  Ostaju priča o četiri elementa, ručnoj berbi i Ninu, kao i distributerska poruka.
- Svih pet proizvoda: postojeći H1, gramaža i vrsta pakovanja ostaju;
  uvodi povezuju proizvođača, način upotrebe i praktičnu razliku pakovanja.
- Kratki opisi usklađeni su na početnoj, u katalogu i među povezanim proizvodima.
- Tvrdnje „bez aditiva“ i isticanje minerala u ovih sedam stranica zamenjeni su
  opisima sakupljanja, kristala i upotrebe, bez novih zdravstvenih obećanja.
- Nema promene CSS-a, JavaScript-a, HTML strukture, kupovnih atributa,
  fotografija, putanja, cena, dostave, SEO metadata ili strukturiranih podataka.

Status ove dorade, provere i ograničenja navesti u evidenciji objave. Izmena
izvornog koda nije potvrda produkcione objave niti novog Google preuzimanja.

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
