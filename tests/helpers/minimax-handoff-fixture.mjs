// INTERNAL proof records for offline tests, not example Minimax API responses.
export const clone = value => structuredClone(value);
const before = '2026-11-02T20:00:00.000Z', after = '2026-11-02T20:00:03.000Z';
const skus = ['10012', '10086', '10240', '10306', '10307'];
export function handoffFixture(reservations = [{orderId: 'AT-MMTEST-FLOW-STANDARD', invoiceId: 45000001,
  state: 'active', planHash: 'a'.repeat(64), units: [{sku: '10012', qty: 2}]}]) {
  const input = {automaticStockIssue: true, localSnapshotBefore: 'c'.repeat(64), localSnapshotAfter: 'c'.repeat(64), previousHandoffs: [],
    stockSnapshot: {id: 'synthetic-stock-1', organisationId: 81179, warehouseId: 40999,
    startedAt: '2026-11-02T20:00:01.000Z', completedAt: '2026-11-02T20:00:02.000Z',
    rows: skus.map(sku => ({sku, quantity: 100})), includedMovements: []},
    reservations: clone(reservations), invoices: [], postings: []};
  for (const r of reservations.filter(r => r.invoiceId !== null)) {
    const invoice = {organisationId: 81179, warehouseId: 40999, invoiceId: r.invoiceId,
      reference: 'WEBSHOP:' + r.orderId, planHash: r.planHash, kind: 'goods', state: 'draft', version: 'invoice-v1'};
    input.invoices.push({orderId: r.orderId, before: {...invoice, observedAt: before}, after: {...invoice, observedAt: after}});
  }
  return input;
}
export function includePosting(input, orderId = input.reservations[0].orderId, movementId = 55000001) {
  const r = input.reservations.find(r => r.orderId === orderId), invoice = input.invoices.find(r => r.orderId === orderId);
  for (const row of [invoice.before, invoice.after]) {row.state = 'issued'; row.version = 'invoice-v2';}
  const movement = {organisationId: 81179, warehouseId: 40999, invoiceId: r.invoiceId, movementId,
    planHash: r.planHash, state: 'confirmed', version: 'movement-v1', units: clone(r.units)};
  input.postings.push({orderId, before: {...movement, observedAt: before}, after: {...clone(movement), observedAt: after}});
  input.stockSnapshot.includedMovements.push({movementId, version: movement.version});
  for (const {sku, qty} of r.units) input.stockSnapshot.rows.find(row => row.sku === sku).quantity -= qty;
  return input;
}
