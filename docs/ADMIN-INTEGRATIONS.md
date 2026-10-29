# Administratorski panel — operativna evidencija i integracije

Implementirano: operativni status isporuke, status naplate i prenosa novca, interna beleška, razlog svake izmene i istorija pre/posle, provera sumnjivih porudžbina, datumski filteri, CSV prikazanih porudžbina, adresne nalepnice 100×150 i 80×100 mm, ručno povezivanje fiskalnog broja i originalne reference.

Postojeće cene i dostava ostaju sačuvane u porudžbini. CSV ima zaštitu od izvršavanja formula. Prikaz i izvoz su ograničeni na 100 porudžbina; za veći obim potrebno je uvesti serversku paginaciju. Interna beleška i operativni podaci dostupni su samo na autorizovanim administratorskim rutama.

Zajednički administratorski ključ ne omogućava identifikaciju pojedinca. Istorija operativnih izmena zato navodi „Administrator (zajednički ključ)“. Pre proširenja tima uvesti pojedinačne naloge i serverski utvrđen identitet. Stari događaji nemaju identitet izvršioca; ne pripisivati ih naknadno.

## Priključne tačke

Tabela integration_jobs predviđa stabilan ključ operacije, red za ponovno izvršavanje, spoljašnji identifikator, status i poslednju grešku. Nema aktivnog slanja provajderima ni izdavanja fiskalnih računa. Adapter i radnik za obradu reda implementiraju se nakon izbora provajdera.

- Kurir: createShipment(orderSnapshot, operationKey), getShipment(externalId), getLabel(externalId, format), cancelShipment(externalId). Koristiti nalepnicu koju vrati kurir. Sačuvati spoljašnji ID, broj pošiljke i verziju poslatih podataka. Uvoz statusa kroz verifikovan webhook ili kontrolisano periodično čitanje.
- Fiskalizacija: issueReceipt(snapshot, operationKey), getReceipt(externalId), refundReceipt(originalReference, lines, operationKey). Čuvati odgovor fiskalnog sistema, broj, vremensku oznaku, referencu i PDF. Lokalni unos broja predstavlja samo ručno povezivanje. Poreske oznake, raspodelu paketa po artiklima i popusta, tretman dostave, način plaćanja i trenutak izdavanja potvrditi sa računovođom i izabranim fiskalnim provajderom pre aktiviranja.
- Štampa: postojeća adresna nalepnica koristi sistemski dijalog za štampu. Podesiti stvarnu dimenziju papira i 100% skalu; isključiti zaglavlja i podnožja. Za direktnu štampu bez dijaloga potreban je lokalni servis/provajder i podržani jezik konkretnog štampača. Model, USB/LAN/Bluetooth i dimenzije nalepnice određuju adapter.

## Pravila aktiviranja

Tajne čuvati u Worker okruženju. Zahteve potpisivati/proveravati po specifikaciji provajdera. Jedan operation_key po izdavanju računa ili kreiranju pošiljke. Nakon timeout-a prvo proveriti status kod provajdera; ne ponavljati izdavanje naslepo. Lokalni UNIQUE ključ sam ne sprečava duplikat kod provajdera. Ne slati interne beleške. Testirati u testnom okruženju pre produkcije.

Fiskalni, platni i isporučni statusi su odvojeni. Otkazivanje ili povraćaj pošiljke ne znači automatski fiskalnu refundaciju. Ponovna štampa ne kreira novu pošiljku ili fiskalni račun.

## Minimax početak rada

Praktični postupak, preduslovi, sintetički primeri i plan API povezivanja nalaze se u [MINIMAX-WEBSHOP-OPERATIVA.md](MINIMAX-WEBSHOP-OPERATIVA.md). Za početak je predviđeno ručno izdavanje u Minimax ESIR-u i povezivanje konačnog PFR broja/PDF-a u panelu. Avanse i refundacije slati iz Minimax-a i pratiti u odvojenom registru jer panel čuva jedan PDF. Nema aktivnog fiskalnog adaptera; `linked` ne potvrđuje autentičnost računa. Jedinstvenost ručno unetog broja i obaveznost PDF-a pre otpreme kontroliše operater. API izdavanje ne aktivirati bez testirane obrade neizvesnog ishoda i zaštite od duplikata.

`node tests/fiscal-manual-workflow.mjs` proverava postojeći ručni tok u izolaciji, sa sintetičkim PDF-ovima i mrežnim odgovorima, bez pristupa Minimax-u ili PFR-u.

## Provera

`node tests/admin-operations.mjs` proverava dozvoljene promene, naplatu/refundaciju, konflikt konkurentnih izmena, istoriju, očuvanje cena i datumske filtere. Sintaksne provere: admin.js i Worker. Fizička štampa i provajderski API zahtevaju konkretan uređaj/izabranog provajdera.
