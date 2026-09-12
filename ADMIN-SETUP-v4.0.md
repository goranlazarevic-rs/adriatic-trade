# Adriatic Trade – porudžbine v4.0

Ova verzija dodaje interni panel za porudžbine. Javni webshop ostaje kompatibilan sa postojećim checkout-om.

## Šta dobijamo

1. Svaka nova web porudžbina se, pored emaila, čuva u Cloudflare D1 bazi.
2. Interni panel je na `/admin.html` i nije u navigaciji niti u sitemap-u.
3. Statusi: `Nova` → `Potvrđena` → `Poslata`.
4. Klik na `Potvrdi porudžbinu` šalje kupcu drugi email.
5. Kod predaje kuriru unose se kurir, broj pošiljke i opcioni tracking link.
6. Može se dodati službeni fiskalni račun iz fiskalnog sistema kao PDF. PDF se čuva u privatnom R2 bucket-u i šalje kupcu u prilogu.
7. Panel NE generiše fiskalni račun. On samo čuva i šalje PDF koji je prethodno izdao vaš fiskalni sistem.

## Cloudflare resursi koje treba povezati sa postojećim Worker-om

- D1 binding: `DB`
- R2 binding: `RECEIPTS`
- Secret: `ADMIN_TOKEN`
- Postojeći secret ostaje: `RESEND_API_KEY`

SQL za D1 je u fajlu `cloudflare-d1-schema-v1.sql`.
