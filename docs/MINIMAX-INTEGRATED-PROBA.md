# Objedinjena proba kvota, porudžbine i Minimax nacrta

Razvojni predlog 2.11.2026. Objedinjuje #16 (`25abea6`) i #18 (`2137419`) u zasebnoj razvojnoj grani. Nije produkciona objava, migracija produkcione baze, otvaranje stvarne prodaje ili izdavanje fiskalnog računa.

## Šta se proverava

Jedan probni admin panel prikazuje kontrolu kvota iz #16 i Minimax nacrte iz #18. Dodaje četiri stalna sintetička scenarija koji prolaze isti `acceptOrder` / `admitOrder` servis kao javni checkout, umesto neposrednog INSERT-a probnih porudžbina. `validateOrder` i `buildOrder` daju serverski korpu, cene, dostavu i sastav paketa. Prijem proverava režim, raspoloživost fizičkih komponenti i njihove količine u jednoj D1 transakciji, zajedno sa debitima, porudžbinom i događajem. Pri ponavljanju vraća sačuvanu porudžbinu, cenu i sastav.

Probni ulaz je isključivo autentifikovan administratorski API na staging Worker-u, sa fiksnim sintetičkim kupcem, korpom, test načinom plaćanja i stalnim brojem po scenariju. Ne sadrži javni obrazac, Turnstile prozivku, email ili kurirski API. Zajednički servis prijema je proveren ovim tokom; javne Turnstile/honeypot/rate-limit kontrole proveravaju postojeće zasebne regresije. To nisu ista tvrdnja niti potpuna proba stvarne prodaje.

| Scenario | Stalni broj nove probe | Roba / dostava / ukupno |
|---|---|---|
| STANDARD | AT-MMTEST-FLOW-STANDARD | 2.548 / 420 / 2.968 RSD |
| PAKET | AT-MMTEST-FLOW-PAKET | 2.850 / 420 / 3.270 RSD |
| BESPLATNA | AT-MMTEST-FLOW-BESPLATNA | 3.600 / 0 / 3.600 RSD |
| GURMAN | AT-MMTEST-FLOW-GURMAN | 3.300 / 420 / 3.720 RSD |

Iznosi iz tabele važe za trenutni katalog 2.11.2026; probni pregled pokazuje aktuelnu ponudu, a rezultat prijema autoritativno prikazuje sačuvani iznos. PAKET sadrži dva PKT-PROBA i 10240 po današnjih 550 RSD. Stara proba PAKET ima ranije sačuvanu akcijsku cenu 499 RSD i ostaje 3.219 RSD. Ne prepravljati je na 3.270 RSD. GURMAN proverava treći fiksni recept sa sajta. Prag besplatne dostave zavisi od vrednosti robe, ne ukupnog iznosa sa dostavom.

## Sačuvani stvarni nacrti prethodne probe

Korisnik je slikama panela potvrdio serverski prenos i readback u Minimax organizaciji 81179:

| Stara porudžbina | Minimax ID | Ukupno |
|---|---:|---:|
| AT-MMTEST-STANDARD | 25000576 | 2.968 RSD |
| AT-MMTEST-PAKET | 25000816 | 3.219 RSD |
| AT-MMTEST-BESPLATNA | 25000921 | 3.600 RSD |

Naknadni prikaz BESPLATNA pokazuje isti ID 25000921 i sačuvane attempt/verified događaje. Dokaz su korisnikove slike; agent nema tajne ili nezavisnu autentifikovanu Minimax sesiju. Nacrti nisu izdati. Raniji lokalni nacrt 24994201 takođe se ne ponavlja.

Priprema staging-a koristi `CREATE IF NOT EXISTS` / `INSERT OR IGNORE`. Ne briše ili menja postojeće porudžbine, `minimax_drafts`, njihove izvore/hash-eve/ID-eve, kvote, kontrolnu reviziju ili istoriju. Nova kvotna šema inicijalno ima pauzu i nema alokacija. Ponovni deployment ne resetuje već podešen probni režim. Tri stare porudžbine nemaju checkout admissions jer su istorijski seed iz #18; nisu dokaz prijema kroz kvote. Njih proveravamo samo dugmetom **Proveri postojeći nacrt**, bez novog kreiranja.

## Koraci vlasnika posle uspešnih testova i staging ažuriranja

1. U postojećem GitHub workflow-u `Adriatic Trade Release Gate` izabrati granu `feat/minimax-admin-integrated-20261102`, uključiti samo `deploy_minimax_staging` i u `approved_staging_sha` upisati pun SHA iz pregledanog PR-a. `deploy_production` ostaje isključen, `approved_sha` prazan. Pokreće se samo zasebni postojeći Worker/D1 `adriatic-trade-minimax-staging`. Nije potrebno menjati postojeće privatne tajne.
2. Otvoriti https://adriatic-trade-minimax-staging.lakifinance.workers.dev/admin.html, osvežiti i prijaviti se postojećim probnim ADMIN_TOKEN-om. Na starim porudžbinama pročitati/proveriti iste ID-eve iz tabele. Ako evidencija ili ID nedostaje, prekinuti novu probu i proveriti stanje; ne brisati bazu, ne resetovati journal i ne kreirati zamene.
3. U „Dostupnost za webshop“ potvrditi **sintetičku** preostalu kvotu po fizičkom SKU (za sva četiri ponuđena scenarija dovoljno je po 10 komada od svakog, kao izolovani test, ne podatak o pravoj robi). Potvrda povećanja koristi tačan tekst `SKU nova_kvota`, razlog i proveru. Nema kvote za paket. Prvo proveriti postojeće preostale količine i istoriju; ponavljanje uspešne probe ne zahteva dopunu.
4. Pre otvaranja probnog prijema pokušati probu: mora odbiti prijem zbog pauze, bez novog umanjenja. Zasebno otvoriti samo sintetički prijem kroz gornje kontrole; javni `/order` ostaje blokiran čak i kada je ovaj režim otvoren.
5. Kliknuti **Prihvati / proveri istu probnu porudžbinu** za jedan scenario. Prvi prijem umanjuje kvote i čuva novu porudžbinu. Ponoviti isto dugme: isti broj, isti prihvaćeni iznos, isto sačuvano telo i bez novog umanjenja. Pauziranje prijema ne blokira proveru već prihvaćenog zahteva.
6. Kliknuti **Potvrdi probnu porudžbinu**. To ne šalje poruke i ne menja kvote. U njenim detaljima pregledati zasebni Minimax prikaz i, kada se odobri ta konkretna proba, kliknuti **Napravi probni nacrt** jednom. Nova FLOW porudžbina ima drugu referencu od ranijih nacrta. Izdavanje nije dostupno.
7. Posle uspeha zabeležiti novi ID. Osvežiti panel i kliknuti **Proveri postojeći nacrt**: ID i iznos ostaju isti. Svaki novi create zahtev nakon prvog pokušaja samo vraća journal; posle neizvesnog ishoda dozvoljeno je jedino čitanje pronađenog ID-a. Ne ponavljati sa drugim ID-em porudžbine.
8. Ponoviti sa ostalim scenarijima, zatim pauzirati probni prijem. Slike rezultata ne smeju sadržati tajne. Nove stvarne FLOW probe čekaju ovaj ručni postupak; automatizovani testovi koriste isključivo sintetičke Minimax odgovore.

## Automatizovane zajedničke provere

`tests/minimax-integrated-runtime.mjs` pokreće pravi workerd/D1 i staging wrapper: originalni journals/ID-evi prežive ponovnu pripremu, stari nacrti se samo čitaju, stroga autorizacija/origin i fiksna korpa odbijaju proizvoljne podatke, pauza/nedostupna komponenta blokiraju prijem, osam konkurentnih prijema čuva jednu porudžbinu i jedan debit, zastarela korekcija kvote se odbija, osam potvrda daje jedan događaj, osam create zahteva daje jedan Minimax POST. Sve tri paketske recepture, pojedinačni proizvodi, aktuelna i sačuvana akcijska cena, prag dostave i oporavak neizvesnog create/readback-a pokriveni su zajedničkim i zadržanim #18 testovima.

`tests/minimax-integrated-browser.mjs` koristi stvarni frontend i staging wrapper uz izolovani Worker/SQLite i simuliran Minimax, na 1440/390/320 px: pauza, potvrđeno otvaranje, izgubljen odgovor prijema, isti ponovljeni zahtev, jedno umanjenje kvote, potvrda porudžbine, nacrt/readback, osvežavanje/isti ID, pauza i ponovna provera, odjava i mobilno prelamanje. Zasebne #16 workerd/browser provere zadržavaju trku korekcije sa javnim checkout-om, izgubljen odgovor korekcije i rollback. Izmene checkout prijema zadržavaju postojeće regresije javnih zaštita i slanja.

## Preostali uslovi za stvarnu prodaju

Mapiranje pouzeća i IPS-a; izdavanje/fiskalizacija, PDF i dostava računa; vrednovanje i razduženje zaliha/VP-MP; potvrđena slobodna roba i poslovna dokumentacija; izbor/ugovor i integracija kurira. Nijedan od tih uslova se ne smatra rešenim ovim prenosom nacrta. Prikaz komponenti je zadržan; ne uvode se novi kombo artikli u Minimax.

Produkcioni merge, migracija, objava sa početnom pauzom i kasnije otvaranje stvarne prodaje zahtevaju posebno odobrenje. Ova grana ne menja produkciju niti automatski pokreće deployment.
