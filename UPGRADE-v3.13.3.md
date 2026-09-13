# Adriatic Trade v3.13.3 — Product & Bundle Quantity Controls

## Izmene
- Nakon prvog dodavanja pojedinačnog proizvoda dugme prelazi u kontrolu `−  1  +` sa oznakom `U korpi`.
- Ista kontrola sada važi i za sva tri paketa: Probaj, Za svaki dan i Premium.
- `+` povećava količinu direktno na kartici.
- `−` smanjuje količinu; `−` sa količine 1 uklanja stavku iz korpe i vraća dugme za dodavanje.
- Broj u mobilnoj korpi se sinhronizuje odmah.
- Product detail mobilni sticky bar zadržava istu logiku za pojedinačne proizvode.
- Smart Cart, cene, paketske cene, prag za besplatnu dostavu i checkout logika nisu menjani.
- Worker ostaje v4.3.0.

## Cache bust
CSS i JS koriste query oznaku `v=3.13.3-final` da se ne bi učitala eventualno keširana prethodna varijanta v3.13.3.
