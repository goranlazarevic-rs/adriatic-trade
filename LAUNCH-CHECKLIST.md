# Prva prodaja — kandidat 4.12.0

Ovo je spisak za pregled i odobrenje, a ne potvrda spremnosti ili produkciona objava. Stari v3.2 spisak sa FormSubmit i dostavom 390/2500 je zastareo. Važeće cene dostave su 420 RSD / besplatno od robe 3500 RSD.

## Prvi operativni režim

Prijem porudžbine i jedno umanjenje izdvojene webshop kvote → potvrda kupcu → operater izdaje fiskalni račun u Minimax-u → originalni PDF se povezuje i šalje iz panela ili se evidentira slanje iz Minimax-a → stvarna predaja kuriru ili lična isporuka. Kurir se zakazuje ugovorenim kanalom. Automatska fiskalizacija, API kurira i automatski prenos Minimax zaliha još nisu uključeni.

Detaljno: [docs/FIRST-SALE-RUNBOOK.md](docs/FIRST-SALE-RUNBOOK.md).

Aktuelne potvrde i otvorene stavke od 3.11: [docs/FIRST-SALE-READINESS.md](docs/FIRST-SALE-READINESS.md). Laboratorijska potvrda još nije dobijena, kurir je u pregovorima, a vlasnik potvrđuje uključen Režim obuke numeracije 1428454-1. Po završetku proba koristi se kontrolisan prelazak iste numeracije u redovan režim; ne pravi se nova samo zbog obuke.

## Tehnička provera tačnog kandidata

- [ ] Jedinstveni PFR broj; sačuvani iznos/sastav i jedno povezivanje pri ponavljanju.
- [ ] Originalni PDF do 5 MB; admin autorizacija; primalac iz konkretne porudžbine.
- [ ] Trajan email zahtev i ponavljanje istog zahteva, bez ponovnog izdavanja računa.
- [ ] Blokada isporuke bez fiskalne evidencije i slanja; oba kanala slanja.
- [ ] Puna refundacija urađena u Minimax-u povezana sa originalom; nema automatskog vraćanja novca/kvote.
- [ ] Postojeće potvrde/mejlovi, pouzeće, lična dostava/IPS, kontakt/B2B i zajedničke regresije.
- [ ] Pravi workerd/D1/R2 i browser 1440/390/320 px novog toka; uspešan Release Gate za tačan commit.

## Potvrde vlasnika pre otvaranja

- [ ] Roba je fizički i pravno slobodna za prodaju; potrebni dokumenti i deklaracije potvrđeni. Ranija laboratorijska/uvozna/registraciona pitanja ne smatraju se zatvorenim ovim kodom.
- [ ] Potvrđeni stvarni lager, knjigovodstveni prijem i vrednovanje. Ne potvrđivati raniji nacrt prijema sa nultom nabavnom vrednošću radi probe.
- [ ] Aktivna prava Minimax fiskalna blagajna/numeracija, sertifikat i poslovni prostor; za prodaju isključena Obuka. Probni API nacrti nisu stvarni računi kupaca.
- [ ] Pre isključivanja Obuke zaustavljen probni API za nacrte, ne samo probni prijem. Sedam sintetičkih nacrta ostaje neizdato; staging workflow se ne pokreće ponovo nad numeracijom koja je prešla u redovan rad.
- [ ] Potvrđen fiskalni način plaćanja za pouzeće i dogovorenu bezgotovinsku naplatu. Uplata pre isporuke zahteva odgovarajući avansni/konačni postupak. TEST_BANK_TRANSFER nije produkciono mapiranje.
- [ ] Izabran kurir; ugovoreni preuzimanje, težina, cena, pouzeće, prenos novca i povrat. Cena webshopa 420 RSD nije dokaz ugovorene kurirske cene.
- [ ] Potvrđene ograničene početne slobodne webshop kvote svih pet SKU, uključujući nule. Minimax stanje se ne prepisuje automatski preko preostale kvote.

## Posebno odobrena objava

- [ ] Vlasnik pregleda kandidat i posebno odobrava merge, potrebne migracije i produkcionu objavu sa prijemom pauziranim.
- [ ] Backup D1. Po potrebi odobreno primenjeni checkout-availability-v1 i admin-availability-v1 SQL. Ne resetovati postojeće kvote, prijeme ili istoriju.
- [ ] Read-only release preflight potvrđuje pauzu; sam je ne menja. Fiskalne tabele inicijalizuju se samo u uključenom prvom prodajnom režimu.
- [ ] FIRST_SALE_MODE=manual-minimax; DB/R2/Resend/Turnstile i Cron. Health potvrđuje 4.12.0 i firstSaleFiscal=true.
- [ ] Usklađeni admin frontend i Worker. Samostalna Pages objava nije završena objava.
- [ ] Posle poslovnih potvrda i provere kvota posebno odobreno otvaranje prodaje. Za produkcionu probu dogovoreni tačan primalac i obim; nema podrazumevanog izdavanja/slanja.
