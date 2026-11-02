// Verified against organisation 81179 on 2026-11-02. Test adapter only.
export const CONFIG = Object.freeze({
  organisationId: 81179, customerId: 9775669, warehouseId: 40999,
  numberingId: 77630, employeeId: 408672, paymentMethodId: 622053,
  currencyId: 2, countryId: 3, vatRateId: 4, referenceInvoiceId: 24955965,
});
export const ITEMS = Object.freeze(Object.fromEntries([
  ['10086', 13473518, 600, 'Cvet soli 100 g – natron vrećica – BIO'],
  ['10012', 13473554, 800, 'Cvet soli 125 g - kutija - BIO'],
  ['10306', 13473557, 299, 'Sitna morska so 600 g - ZIP - BIO'],
  ['10307', 13473558, 299, 'Gruba morska so 600 g - ZIP - BIO'],
  ['10240', 13473560, 550, 'Sitna morska so 500 g - tuljak - BIO'],
  ['DOSTAVA', 13473586, 420, 'Dostava'],
].map(([code, id, gross, name]) => [code, Object.freeze({id, gross, name})])));

export function demand(condition, code) { if (!condition) throw new Error(code); }
export function cents(value) {
  demand(typeof value === 'number' && Number.isFinite(value) && value >= 0, 'INVALID_MONEY');
  const n = Math.round(value * 100);
  demand(Number.isSafeInteger(n) && Math.abs(value * 100 - n) < 0.00001, 'INVALID_MONEY');
  return n;
}
export function belgradeDay(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Belgrade', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function sampleOrder() {
  return {
    id: 'AT-MINIMAX-PROBA-001', payment: 'TEST_BANK_TRANSFER',
    items: ['10086', '10012', '10306', '10307', '10240'].map(sku => ({
      sku, qty: 1, unitPrice: ITEMS[sku].gross, lineTotal: ITEMS[sku].gross,
    })), goodsTotal: 2548, shipping: 420, total: 2968,
  };
}

export function validateSnapshot(order) {
  demand(order && /^[A-Z0-9-]{1,80}$/.test(order.id), 'INVALID_ORDER_ID');
  // A test bank transfer is NOT a mapping for production cash-on-delivery.
  demand(order.payment === 'TEST_BANK_TRANSFER', 'UNCONFIRMED_PAYMENT_MAPPING');
  demand(Array.isArray(order.items) && order.items.length > 0 && order.items.length <= 20, 'INVALID_ITEMS');
  const seen = new Set();
  let goods = 0, units = 0;
  for (const row of order.items) {
    demand(Object.hasOwn(ITEMS, row.sku) && row.sku !== 'DOSTAVA', 'UNSUPPORTED_SKU_OR_BUNDLE');
    demand(!seen.has(row.sku), 'DUPLICATE_SKU'); seen.add(row.sku);
    demand(Number.isSafeInteger(row.qty) && row.qty > 0 && row.qty <= 20, 'INVALID_QUANTITY');
    units += row.qty;
    // Never silently reprice a saved order using today's catalogue.
    demand(cents(row.unitPrice) === cents(ITEMS[row.sku].gross), 'SNAPSHOT_PRICE_MISMATCH');
    demand(cents(row.lineTotal) === cents(row.unitPrice) * row.qty, 'LINE_TOTAL_MISMATCH');
    goods += cents(row.lineTotal);
  }
  demand(units <= 20 && goods === cents(order.goodsTotal), 'GOODS_TOTAL_MISMATCH');
  demand([0, 42000].includes(cents(order.shipping)), 'UNSUPPORTED_SHIPPING');
  demand(cents(order.total) === goods + cents(order.shipping), 'ORDER_TOTAL_MISMATCH');
}

export function buildDraft(order, day = belgradeDay()) {
  validateSnapshot(order);
  demand(/^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T00:00:00Z`).toISOString().slice(0,10) === day, 'INVALID_DATE');
  const source = [...order.items];
  if (order.shipping > 0) source.push({sku: 'DOSTAVA', qty: 1, unitPrice: order.shipping, lineTotal: order.shipping});
  return {
    Status: 'O', InvoiceType: 'R', PricesOnInvoice: 'D',
    DocumentNumbering: {ID: CONFIG.numberingId}, Customer: {ID: CONFIG.customerId},
    Employee: {ID: CONFIG.employeeId}, Currency: {ID: CONFIG.currencyId},
    DateIssued: day, DateTransaction: day, DateTransactionFrom: day, DateDue: day,
    AddresseeName: 'Fizičko lice', AddresseeAddress: '/',
    AddresseePostalCode: '21208', AddresseeCity: 'Sremska Kamenica', AddresseeCountry: {ID: CONFIG.countryId},
    Rabate: 0, ExchangeRate: 1, RecurringInvoice: 'N', InvoiceForPeriod: 'N',
    ForwardToCRF: 'N', ForwardToSEF: 'Zbirno',
    DocumentReference: `WEBSHOP-PROBA:${order.id}`,
    DescriptionAbove: 'PROBA API - NACRT. Ne izdavati. Nije stvarna porudžbina.',
    // AssociationWithStock and report-template IDs are deliberately not copied
    // from a GET response. Stock/accounting and actual issuance are out of scope.
    IssuedInvoiceRows: source.map((row, index) => ({
      RowNumber: index + 1, Item: {ID: ITEMS[row.sku].id}, ItemCode: row.sku,
      ItemName: ITEMS[row.sku].name, Quantity: row.qty, UnitOfMeasurement: 'kom',
      Price: Number((row.unitPrice / 1.2).toFixed(6)), PriceWithVAT: row.unitPrice,
      Value: row.lineTotal, VATPercent: 20, VatRate: {ID: CONFIG.vatRateId},
      VatAccountingType: '3.2', Discount: 0, DiscountPercent: 0,
      Warehouse: row.sku === 'DOSTAVA' ? null : {ID: CONFIG.warehouseId},
      OtherTaxesAndDuties: 'N',
    })),
    IssuedInvoicePaymentMethods: [{PaymentMethod: {ID: CONFIG.paymentMethodId},
      Amount: order.total, AmountInDomesticCurrency: order.total, AlreadyPaid: 'N'}],
  };
}

// Fresh customer-specific price check. The API may also return base prices,
// another customer's rows, or duplicates; none is an acceptable fallback.
export function validatePriceList(response, payload) {
  demand(Array.isArray(response?.Rows), 'INVALID_PRICELIST');
  demand(Array.isArray(response.ValidationMessages) && response.ValidationMessages.length === 0, 'PRICELIST_VALIDATION_FAILED');
  for (const expected of payload.IssuedInvoiceRows) {
    const rows = response.Rows.filter(r => r.Item?.ID === expected.Item.ID &&
      r.Customer?.ID === CONFIG.customerId && r.Warehouse == null);
    demand(rows.length === 1, 'CUSTOMER_PRICE_MISSING_OR_AMBIGUOUS');
    demand(rows[0].Code === expected.ItemCode && rows[0].UnitOfMeasurement === 'kom', 'PRICE_ITEM_MISMATCH');
    demand(cents(rows[0].PriceWithVAT) === cents(expected.PriceWithVAT), 'CUSTOMER_PRICE_MISMATCH');
    demand(typeof rows[0].PriceWithoutVAT === 'number' &&
      Math.abs(rows[0].PriceWithoutVAT - expected.Price) <= 0.000001, 'CUSTOMER_NET_PRICE_MISMATCH');
  }
}

export function verifyDraft(actual, expected, {referenceOnly = false} = {}) {
  demand(actual?.Status === 'O' && !(actual.InvoiceNumber > 0), 'NOT_A_DRAFT');
  for (const key of ['Customer', 'DocumentNumbering', 'Employee', 'Currency']) {
    demand(actual[key]?.ID === expected[key].ID, `DRAFT_${key.toUpperCase()}_MISMATCH`);
  }
  demand(actual.PricesOnInvoice === 'D' && actual.InvoiceType === 'R' && actual.Rabate === 0 && actual.ExchangeRate === 1, 'DRAFT_HEADER_MISMATCH');
  if (!referenceOnly) {
    demand(actual.DocumentReference === expected.DocumentReference, 'DRAFT_REFERENCE_MISMATCH');
    for (const key of ['DateIssued', 'DateTransaction', 'DateTransactionFrom', 'DateDue']) {
      demand(typeof actual[key] === 'string' && actual[key].slice(0,10) === expected[key], 'DRAFT_DATE_MISMATCH');
    }
  }
  demand(Array.isArray(actual.IssuedInvoiceRows) && actual.IssuedInvoiceRows.length === expected.IssuedInvoiceRows.length, 'DRAFT_ROWS_MISMATCH');
  for (const row of expected.IssuedInvoiceRows) {
    const matches = actual.IssuedInvoiceRows.filter(r => r.Item?.ID === row.Item.ID && r.ItemCode === row.ItemCode);
    demand(matches.length === 1, 'DRAFT_ITEM_MISMATCH');
    const r = matches[0];
    demand(r.Quantity === row.Quantity && r.UnitOfMeasurement === 'kom', 'DRAFT_QUANTITY_MISMATCH');
    demand(cents(r.PriceWithVAT) === cents(row.PriceWithVAT) && cents(r.Value) === cents(row.Value) &&
      typeof r.Price === 'number' && Math.abs(r.Price - row.Price) <= 0.000001, 'DRAFT_AMOUNT_MISMATCH');
    demand(r.Discount === 0 && r.DiscountPercent === 0 && r.VATPercent === 20 && r.VatRate?.ID === CONFIG.vatRateId && r.VatAccountingType === '3.2', 'DRAFT_TAX_MISMATCH');
    demand((r.Warehouse?.ID ?? null) === (row.Warehouse?.ID ?? null) && r.AdditionalWarehouse == null, 'DRAFT_WAREHOUSE_MISMATCH');
  }
  const payments = actual.IssuedInvoicePaymentMethods;
  demand(Array.isArray(payments) && payments.length === 1 && payments[0].PaymentMethod?.ID === CONFIG.paymentMethodId &&
    payments[0].AlreadyPaid === 'N' && cents(payments[0].Amount) === cents(expected.IssuedInvoicePaymentMethods[0].Amount) &&
    cents(payments[0].AmountInDomesticCurrency) === cents(expected.IssuedInvoicePaymentMethods[0].AmountInDomesticCurrency), 'DRAFT_PAYMENT_MISMATCH');
  // InvoiceValue can be 0 on the user's saved draft. Validate rows/payment,
  // never interpret that field as a zero-valued order.
  return {id: actual.IssuedInvoiceId, total: payments[0].Amount, status: 'O'};
}
