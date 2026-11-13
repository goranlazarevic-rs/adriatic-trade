# Webshop mailbox routing

Prepared 13 November 2026. Deployment is separate from this source change.

| Message | Destination | Reply-To |
| --- | --- | --- |
| New order notification | webshop@adriatictrade.rs | Customer email |
| Order receipt and status updates | Customer email | webshop@adriatictrade.rs |
| Payment, delivery, fiscal PDF and refund notices sent by the webshop | Customer email | webshop@adriatictrade.rs |
| Contact and business cooperation forms | info@adriatictrade.rs | Submitter email |

The verified automated sender stays `Adriatic Trade <porudzbine@orders.adriatictrade.rs>`.
Creating a Microsoft 365 mailbox alone does not authorize Resend to send from
the root domain. This change routes replies and order notifications to Webshop
without changing sender-domain authentication or account/API credentials.
Customer-facing email contact links use the Webshop address. General site
contact details and legal documents continue to list info@adriatictrade.rs.

Existing queued payloads are preserved, including their original Reply-To and
idempotency keys. Do not rewrite or replay sent notifications. Before production
promotion, inspect any outstanding checkout email attempts: an in-flight retry
of a pre-change checkout submission has a saved business/customer idempotency
key but constructs a new payload. Finish such attempts with the old revision
before promotion; do not clear sent flags or change submission IDs.

## Minimax

After the user completed sign-in, the live send-email dialog was inspected on
an existing training invoice. It shows `Od: minimax@minimax.rs` and defaults
`Odgovori na` to info@adriatictrade.rs. Its edit button exposes an editable
Reply-To field; the dialog was cancelled without sending. No persistent email
setting was changed. The existing draft transfer, customer email mapping,
warehouse and numbering are unchanged. Do not replace a buyer's email with
the merchant's address.

For documents sent directly from Minimax, review the **Odgovori na** field and
set webshop@adriatictrade.rs for webshop documents. The **Od** field is managed
by Minimax; do not assume that the new Microsoft mailbox changes it. Mail sent
from Minimax is recorded in Minimax and does not automatically appear in the
Outlook Webshop Sent Items folder. Review the optional copy setting separately.

Official references:
- https://help.minimax.rs/help/slanje-dokumenata-preko-e-maila
- https://help.minimax.rs/help/kako-mogu-da-vidim-da-li-je-predracun-poslat-putem-e-mail-a

## Verification

Local isolated tests cover accepted checkout routing, duplicate submissions,
seven order-status/payment/delivery messages, fiscal PDF routing, preserved
notification retries, contact/B2B routing to info, and Minimax draft/stock/handoff
regressions. All external mail and Minimax requests in those tests are mocked.
No real order, invoice issuance, fiscalization or customer email is generated.

After approved production deployment, test actual delivery with a controlled
merchant-owned recipient and verify that replying reaches Webshop. A unit test
or mail-provider acceptance does not prove delivery to an Outlook inbox.
