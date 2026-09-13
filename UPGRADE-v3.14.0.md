# Adriatic Trade v3.14.0 — Analytics & Conversion Tracking

## Status
Google Analytics 4 je povezan sa produkcionim Measurement ID-em `G-WX8JF1GHRT`. Paket je spreman za produkcioni deploy.

## Praćenje
- GA4 page_view (automatski nakon saglasnosti)
- view_item na product detail stranama
- view_item_list na katalogu proizvoda
- add_to_cart
- remove_from_cart
- view_cart
- begin_checkout
- purchase sa transaction_id, value, shipping i item podacima
- smart_cart_shown
- smart_cart_added
- smart_cart_purchase
- free_shipping_purchase

## Privatnost
- Google Analytics se ne učitava pre saglasnosti korisnika.
- Banner: „Prihvati analitiku“ / „Samo neophodni“.
- Izbor se čuva lokalno u pregledaču.
- Link „Podešavanja kolačića“ omogućava kasniju promenu izbora.
- Ne šalju se ime, email, telefon, adresa niti napomena kupca.
- Politika privatnosti je ažurirana.

## Važno
`purchase` se čuva privremeno u sessionStorage nakon uspešnog odgovora Worker-a i šalje na thank-you stranici, kako redirect ne bi izgubio ecommerce event.

Worker ostaje v4.3.0.
