# Worker patch v4.4.1 — pricing & shipping

Apply this as a **minimal patch to the currently deployed Cloudflare Worker v4.4.0**. Do not replace the Worker with older v4.3.0 source.

## Product prices
- 10086: 599 -> **600**
- 10012: 799 -> **800**
- 10306: stays **299**
- 10307: stays **299**
- 10240: 549 -> **550**
- PKT-PROBA: 1149 -> **1150**
- PKT-GURMAN: 1649 -> **1650**
- PKT-KOMPLET: 1799 -> **1800**

## Promotion
End/remove the temporary 10240 WEB AKCIJA promotion (499 RSD). The active price must now be **550 RSD**.

## Shipping
- FREE_SHIPPING: 2500 -> **3500**
- SHIPPING_FEE: 390 -> **420**

The server-side buildOrder calculation must remain:
```js
const shipping = goodsTotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE;
```

## Version
Set Worker health/version to **4.4.1** after applying the patch.

## Regression checks
1. Order goods total below 3,500 RSD -> shipping 420 RSD.
2. Goods total exactly 3,500 RSD -> shipping 0 RSD.
3. Goods total above 3,500 RSD -> shipping 0 RSD.
4. Server-calculated prices match frontend prices for all 5 products and 3 bundles.
5. SKU 10240 is 550 RSD and no 499 RSD scheduled promo remains.
6. Existing security/rate-limit/Turnstile/admin functionality from v4.4.0 remains unchanged.
