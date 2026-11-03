// Pure handoff model. These are INTERNAL evidence records, NOT Minimax API fields.
// No fetch, credentials, database access, quota writes or document issuance here.
// A live adapter must prove invoice/movement linkage and snapshot coverage first.
import {CONFIG, ITEMS, demand} from '../minimax-draft/model.mjs';

const skus = Object.keys(ITEMS).filter(sku => sku !== 'DOSTAVA').sort();
const positiveId = n => Number.isSafeInteger(n) && n > 0;
const label = s => typeof s === 'string' && /^[A-Za-z0-9:._-]{1,128}$/.test(s);
const hash = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const time = s => {
  demand(typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) &&
    Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s, 'INVALID_OBSERVATION_TIME');
  return Date.parse(s);
};
function units(rows) {
  demand(Array.isArray(rows) && rows.length > 0 && rows.length <= skus.length, 'INVALID_RESERVED_UNITS');
  const result = new Map();
  for (const row of rows) {
    demand(row && skus.includes(row.sku) && !result.has(row.sku) &&
      Number.isSafeInteger(row.qty) && row.qty > 0 && row.qty <= 10000, 'INVALID_RESERVED_UNITS');
    result.set(row.sku, row.qty);
  }
  return [...result].sort(([a], [b]) => a.localeCompare(b)).map(([sku, qty]) => ({sku, qty}));
}
function indexed(rows, key) {
  demand(Array.isArray(rows) && rows.length <= 1000, 'INVALID_EVIDENCE');
  const result = new Map();
  for (const row of rows) {
    demand(row && !result.has(row[key]), 'DUPLICATE_EVIDENCE');
    result.set(row[key], row);
  }
  return result;
}
function scope(row) {
  demand(row.organisationId === CONFIG.organisationId && row.warehouseId === CONFIG.warehouseId, 'EVIDENCE_SCOPE_MISMATCH');
}
function bracket(before, after, start, end) {
  demand(time(before.observedAt) <= start && time(after.observedAt) >= end, 'EVIDENCE_OUTSIDE_SNAPSHOT');
}
function invoiceState(pair, reservation, start, end) {
  demand(pair?.before && pair.after, 'INVOICE_EVIDENCE_REQUIRED');
  const {before, after} = pair;
  bracket(before, after, start, end);
  for (const row of [before, after]) {
    scope(row);
    demand(row.invoiceId === reservation.invoiceId && row.reference === 'WEBSHOP:' + reservation.orderId &&
      row.planHash === reservation.planHash && row.kind === 'goods' && label(row.version), 'INVOICE_EVIDENCE_MISMATCH');
    demand(['draft', 'issued'].includes(row.state), 'RECONCILIATION_REQUIRED');
  }
  demand(before.state === after.state && before.version === after.version, 'EVIDENCE_CHANGED');
  return before.state;
}
function includedMovement(pair, reservation, coverage, start, end) {
  demand(pair?.before && pair.after, 'POSTING_EVIDENCE_REQUIRED');
  const {before, after} = pair;
  bracket(before, after, start, end);
  const expected = JSON.stringify(units(reservation.units));
  for (const row of [before, after]) {
    scope(row);
    demand(row.invoiceId === reservation.invoiceId && positiveId(row.movementId) && label(row.version) &&
      row.state === 'confirmed' && row.planHash === reservation.planHash &&
      JSON.stringify(units(row.units)) === expected, 'POSTING_EVIDENCE_MISMATCH');
  }
  demand(before.movementId === after.movementId && before.version === after.version, 'EVIDENCE_CHANGED');
  demand(coverage.get(before.movementId)?.version === before.version, 'POSTING_NOT_IN_SNAPSHOT');
  return before.movementId;
}

/**
 * Calculate one snapshot, preserving the reservation history rather than deleting it.
 * Evidence must be produced by a trusted adapter AFTER validating raw documents.
 * Coverage means inclusion in this exact stock snapshot, not merely an earlier GET
 * timestamp, an invoice status, AssociationWithStock=D, or a matching quantity fall.
 * This module deliberately cannot collect/establish that proof from today's GETs.
 */
export function reconcileSnapshot({automaticStockIssue, localSnapshotBefore, localSnapshotAfter,
  stockSnapshot, reservations, invoices, postings, previousHandoffs}) {
  demand(automaticStockIssue === true, 'AUTOMATIC_STOCK_ISSUE_NOT_CONFIRMED');
  demand(hash(localSnapshotBefore) && hash(localSnapshotAfter), 'INVALID_LOCAL_SNAPSHOT');
  demand(localSnapshotBefore === localSnapshotAfter, 'LOCAL_RESERVATIONS_CHANGED');
  demand(stockSnapshot && label(stockSnapshot.id), 'INVALID_STOCK_SNAPSHOT');
  scope(stockSnapshot);
  const start = time(stockSnapshot.startedAt), end = time(stockSnapshot.completedAt);
  demand(start <= end, 'INVALID_STOCK_SNAPSHOT');
  const stock = indexed(stockSnapshot.rows, 'sku');
  demand(stock.size === skus.length && skus.every(sku => stock.has(sku)), 'INVALID_STOCK_SNAPSHOT');
  for (const row of stock.values()) demand(row.quantity === null ||
    (Number.isSafeInteger(row.quantity) && Math.abs(row.quantity) <= 1000000000), 'INVALID_STOCK_SNAPSHOT');
  const coverage = indexed(stockSnapshot.includedMovements, 'movementId');
  for (const row of coverage.values()) demand(positiveId(row.movementId) && label(row.version), 'INVALID_EVIDENCE');
  const orders = indexed(reservations, 'orderId'), invoicePairs = indexed(invoices, 'orderId'), movementPairs = indexed(postings, 'orderId');
  // The caller must load this ledger, never reconstruct it from current statuses.
  // Returning an issued invoice to draft or deleting a historical admission is
  // not equivalent to returning goods to saleable stock.
  const ledger = indexed(previousHandoffs, 'orderId'), priorInvoices = new Set(), priorMovements = new Set();
  for (const row of ledger.values()) {
    demand(orders.has(row.orderId) && positiveId(row.invoiceId) && positiveId(row.movementId) &&
      label(row.version) && hash(row.planHash) && !priorInvoices.has(row.invoiceId) &&
      !priorMovements.has(row.movementId), 'INVALID_HANDOFF_HISTORY');
    units(row.units);
    priorInvoices.add(row.invoiceId); priorMovements.add(row.movementId);
  }
  const totals = Object.fromEntries(skus.map(sku => [sku, {reserved: 0, pending: 0, accounted: 0}]));
  const invoiceIds = new Set(), usedMovements = new Set(), decisions = [];
  for (const reservation of orders.values()) {
    demand(/^AT-MMTEST-FLOW-(STANDARD|PAKET|BESPLATNA|GURMAN)$/.test(reservation.orderId) &&
      reservation.state === 'active' && hash(reservation.planHash), 'INVALID_RESERVATION');
    const required = units(reservation.units);
    let accounted = false, movementId = null;
    if (reservation.invoiceId === null) {
      demand(!invoicePairs.has(reservation.orderId) && !movementPairs.has(reservation.orderId), 'UNLINKED_EVIDENCE');
    } else {
      demand(positiveId(reservation.invoiceId) && !invoiceIds.has(reservation.invoiceId), 'DUPLICATE_OR_INVALID_INVOICE');
      invoiceIds.add(reservation.invoiceId);
      const state = invoiceState(invoicePairs.get(reservation.orderId), reservation, start, end);
      if (state === 'draft') demand(!movementPairs.has(reservation.orderId), 'UNEXPECTED_POSTING');
      else {
        movementId = includedMovement(movementPairs.get(reservation.orderId), reservation, coverage, start, end);
        demand(!usedMovements.has(movementId), 'MOVEMENT_REUSED');
        usedMovements.add(movementId); accounted = true;
      }
    }
    const previous = ledger.get(reservation.orderId);
    if (previous) demand(accounted && previous.invoiceId === reservation.invoiceId && previous.movementId === movementId &&
      previous.version === movementPairs.get(reservation.orderId).before.version && previous.planHash === reservation.planHash &&
      JSON.stringify(units(previous.units)) === JSON.stringify(required),
      'PREVIOUS_HANDOFF_NOT_RECONCILED');
    if (accounted) ledger.set(reservation.orderId, {orderId: reservation.orderId, invoiceId: reservation.invoiceId,
      movementId, version: movementPairs.get(reservation.orderId).before.version, planHash: reservation.planHash, units: required});
    for (const {sku, qty} of required) {
      totals[sku].reserved += qty;
      totals[sku][accounted ? 'accounted' : 'pending'] += qty;
    }
    decisions.push({orderId: reservation.orderId, invoiceId: reservation.invoiceId, movementId,
      state: accounted ? 'accounted_in_snapshot' : 'reservation_pending', units: required});
  }
  demand([...invoicePairs.keys(), ...movementPairs.keys()].every(id => orders.has(id)), 'UNLINKED_EVIDENCE');
  const rows = skus.map(sku => {
    const quantity = stock.get(sku).quantity, total = totals[sku];
    return {sku, quantity, totalReserved: total.reserved, pendingReserved: total.pending,
      accountedInMinimax: total.accounted,
      simulationRemaining: quantity === null ? null : Math.max(0, quantity - total.pending),
      shortage: quantity === null ? null : Math.max(0, total.pending - quantity)};
  });
  return {scope: 'synthetic-handoff-model', modelOnly: true, salesReady: false, quotaWrite: false,
    snapshotId: stockSnapshot.id, rows, decisions,
    proposedHandoffs: [...ledger.values()].map(row => ({...row, units: units(row.units)})).sort((a, b) => a.orderId.localeCompare(b.orderId))};
}
