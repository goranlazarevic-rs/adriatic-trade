import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSnapshot} from '../tools/minimax-reconciliation/model.mjs';
import {handoffFixture, includePosting, clone} from './helpers/minimax-handoff-fixture.mjs';
import {stockHarness} from './helpers/minimax-stock-harness.mjs';
import {seedReservations} from './helpers/minimax-reservations-fixture.mjs';

const item = input => reconcileSnapshot(input).rows.find(r => r.sku === '10012');
const blocked = (input, code) => assert.throws(() => reconcileSnapshot(input), {message: code});
test('100 minus 2 stays 98 across reservation, draft and included posting, never 96 or 100', () => {
  const input = handoffFixture();
  const unlinked = clone(input); unlinked.reservations[0].invoiceId = null; unlinked.invoices = [];
  assert.equal(item(unlinked).simulationRemaining, 98);
  assert.equal(item(input).simulationRemaining, 98);
  includePosting(input);
  assert.deepEqual(item(input), {sku: '10012', quantity: 98, totalReserved: 2, pendingReserved: 0,
    accountedInMinimax: 2, simulationRemaining: 98, shortage: 0});
  const original = JSON.stringify(input), expected = reconcileSnapshot(input);
  for (let i = 0; i < 10; i++) assert.deepEqual(reconcileSnapshot(input), expected);
  input.previousHandoffs = clone(expected.proposedHandoffs);
  assert.deepEqual(reconcileSnapshot(input), expected, 'Persisted handoff replay has the same quantities and one ledger row');
  input.previousHandoffs = [];
  assert.equal(JSON.stringify(input), original, 'Never deletes/updates reservations or input proof');
  assert.equal(expected.decisions[0].state, 'accounted_in_snapshot');
  assert.equal(expected.salesReady, false); assert.equal(expected.quotaWrite, false); assert.equal(expected.modelOnly, true);
});
test('issued invoice and a stock fall alone cannot prove a handoff', () => {
  const input = handoffFixture();
  input.stockSnapshot.rows[0].quantity = 98;
  for (const row of [input.invoices[0].before, input.invoices[0].after]) {
    row.state = 'issued'; row.AssociationWithStock = 'D';
  }
  blocked(input, 'POSTING_EVIDENCE_REQUIRED');
});
test('confirmed movement must be included in the exact stock snapshot, not only observed earlier', () => {
  const input = includePosting(handoffFixture()); input.stockSnapshot.includedMovements = [];
  blocked(input, 'POSTING_NOT_IN_SNAPSHOT');
});
test('four saved FLOW admissions mix pending and accounted components without touching D1 or Minimax', async () => {
  const h = stockHarness(); await seedReservations(h);
  const snapshot = await h.ctx.mmReservationSnapshot(h.db);
  const reservations = snapshot.entries.map(e => ({orderId: e.orderId, invoiceId: e.invoiceId,
    planHash: e.planHash, state: 'active', units: JSON.parse(e.requirementsJson)}));
  const input = handoffFixture(reservations);
  const before = h.sql.prepare('SELECT * FROM checkout_admissions ORDER BY submission_id').all();
  const original = reconcileSnapshot(input);
  for (const r of original.rows) assert.equal(r.pendingReserved, snapshot.reserved[r.sku]);
  includePosting(input, 'AT-MMTEST-FLOW-PAKET'); includePosting(input, 'AT-MMTEST-FLOW-BESPLATNA', 55000002);
  const mixed = reconcileSnapshot(input);
  for (const r of mixed.rows) {
    assert.equal(r.totalReserved, snapshot.reserved[r.sku]);
    assert.equal(r.pendingReserved + r.accountedInMinimax, r.totalReserved);
    assert.equal(r.simulationRemaining, original.rows.find(v => v.sku === r.sku).simulationRemaining);
  }
  assert.equal(mixed.decisions.length, 4, 'Historical admissions stay present');
  assert.equal(h.mm.requests.length, 0, 'Offline model cannot issue invoices or fetch stock');
  assert.deepEqual(h.sql.prepare('SELECT * FROM checkout_admissions ORDER BY submission_id').all(), before);
});
test('saved package v2 composition works independently from current recipes and pricing', () => {
  const input = handoffFixture([{orderId: 'AT-MMTEST-FLOW-PAKET', invoiceId: 45000001, state: 'active',
    planHash: 'b'.repeat(64), units: [{sku: '10012', qty: 4}, {sku: '10240', qty: 1}]}]);
  includePosting(input); const result = reconcileSnapshot(input);
  assert.equal(result.rows.find(r => r.sku === '10012').accountedInMinimax, 4);
  assert.equal(result.rows.find(r => r.sku === '10086').totalReserved, 0);
});
for (const [quantity, expected, shortage] of [[null, null, null], [0, 0, 2], [-2, 0, 4]])
  test('unknown, empty and negative stock remain conservative: ' + quantity, () => {
    const input = handoffFixture(); input.stockSnapshot.rows[0].quantity = quantity;
    assert.equal(item(input).simulationRemaining, expected); assert.equal(item(input).shortage, shortage);
  });
for (const [name, mutate, code] of [
  ['disabled automatic discharge', i => {i.automaticStockIssue = false;}, 'AUTOMATIC_STOCK_ISSUE_NOT_CONFIRMED'],
  ['changed local admissions', i => {i.localSnapshotAfter = 'd'.repeat(64);}, 'LOCAL_RESERVATIONS_CHANGED'],
  ['missing local signature', i => {delete i.localSnapshotBefore;}, 'INVALID_LOCAL_SNAPSHOT'],
  ['stale invoice evidence', i => {i.invoices[0].after.observedAt = '2026-11-02T20:00:01.500Z';}, 'EVIDENCE_OUTSIDE_SNAPSHOT'],
  ['late initial invoice evidence', i => {i.invoices[0].before.observedAt = '2026-11-02T20:00:01.500Z';}, 'EVIDENCE_OUTSIDE_SNAPSHOT'],
  ['invoice issued during reading', i => {i.invoices[0].after.state = 'draft';}, 'EVIDENCE_CHANGED'],
  ['invoice changed during reading', i => {i.invoices[0].after.version = 'invoice-v3';}, 'EVIDENCE_CHANGED'],
  ['advance invoice', i => {i.invoices[0].before.kind = 'advance';}, 'INVOICE_EVIDENCE_MISMATCH'],
  ['wrong reference', i => {i.invoices[0].before.reference = 'WEBSHOP:ANOTHER';}, 'INVOICE_EVIDENCE_MISMATCH'],
  ['wrong saved plan', i => {i.invoices[0].before.planHash = 'b'.repeat(64);}, 'INVOICE_EVIDENCE_MISMATCH'],
  ['wrong invoice ID', i => {i.invoices[0].before.invoiceId++;}, 'INVOICE_EVIDENCE_MISMATCH'],
  ['wrong invoice warehouse', i => {i.invoices[0].before.warehouseId++;}, 'EVIDENCE_SCOPE_MISMATCH'],
  ['uncertain invoice', i => {i.invoices[0].before.state = 'uncertain';}, 'RECONCILIATION_REQUIRED'],
  ['cancelled invoice', i => {i.invoices[0].before.state = 'reversed';}, 'RECONCILIATION_REQUIRED'],
  ['cancelled order', i => {i.reservations[0].state = 'cancelled';}, 'INVALID_RESERVATION'],
  ['unconfirmed movement', i => {i.postings[0].before.state = 'draft';}, 'POSTING_EVIDENCE_MISMATCH'],
  ['partial stock issue', i => {i.postings[0].before.units[0].qty--;}, 'POSTING_EVIDENCE_MISMATCH'],
  ['returned negative units', i => {i.postings[0].before.units[0].qty = -2;}, 'INVALID_RESERVED_UNITS'],
  ['wrong movement invoice', i => {i.postings[0].before.invoiceId++;}, 'POSTING_EVIDENCE_MISMATCH'],
  ['wrong movement warehouse', i => {i.postings[0].before.warehouseId++;}, 'EVIDENCE_SCOPE_MISMATCH'],
  ['wrong organisation', i => {i.postings[0].before.organisationId++;}, 'EVIDENCE_SCOPE_MISMATCH'],
  ['stale stock coverage version', i => {i.stockSnapshot.includedMovements[0].version = 'movement-v0';}, 'POSTING_NOT_IN_SNAPSHOT'],
  ['movement changed during reading', i => {i.postings[0].after.version = 'movement-v2';}, 'EVIDENCE_CHANGED'],
  ['movement switched during reading', i => {i.postings[0].after.movementId++;}, 'EVIDENCE_CHANGED'],
  ['late initial movement evidence', i => {i.postings[0].before.observedAt = '2026-11-02T20:00:01.500Z';}, 'EVIDENCE_OUTSIDE_SNAPSHOT'],
  ['stale final movement evidence', i => {i.postings[0].after.observedAt = '2026-11-02T20:00:01.500Z';}, 'EVIDENCE_OUTSIDE_SNAPSHOT'],
  ['invalid observation date', i => {i.stockSnapshot.startedAt = '2026-02-30T20:00:00.000Z';}, 'INVALID_OBSERVATION_TIME'],
  ['backwards snapshot time', i => {i.stockSnapshot.completedAt = '2026-11-02T19:59:00.000Z';}, 'INVALID_STOCK_SNAPSHOT'],
  ['missing stock item', i => {i.stockSnapshot.rows.pop();}, 'INVALID_STOCK_SNAPSHOT'],
  ['duplicate stock item', i => {i.stockSnapshot.rows.push(clone(i.stockSnapshot.rows[0]));}, 'DUPLICATE_EVIDENCE'],
  ['fractional stock', i => {i.stockSnapshot.rows[0].quantity = 98.5;}, 'INVALID_STOCK_SNAPSHOT'],
  ['duplicate admission', i => {i.reservations.push(clone(i.reservations[0]));}, 'DUPLICATE_EVIDENCE'],
  ['duplicate invoice evidence', i => {i.invoices.push(clone(i.invoices[0]));}, 'DUPLICATE_EVIDENCE'],
  ['duplicate movement evidence', i => {i.postings.push(clone(i.postings[0]));}, 'DUPLICATE_EVIDENCE'],
  ['duplicate coverage', i => {i.stockSnapshot.includedMovements.push(clone(i.stockSnapshot.includedMovements[0]));}, 'DUPLICATE_EVIDENCE'],
  ['evidence for another order', i => {i.postings.push({...clone(i.postings[0]), orderId: 'OTHER'});}, 'UNLINKED_EVIDENCE'],
  ['unknown reserved item', i => {i.reservations[0].units[0].sku = 'UNKNOWN';}, 'INVALID_RESERVED_UNITS'],
  ['shipping is not physical stock', i => {i.reservations[0].units[0].sku = 'DOSTAVA';}, 'INVALID_RESERVED_UNITS'],
]) test('blocks the entire handoff: ' + name, () => {
  const input = includePosting(handoffFixture()); mutate(input); blocked(input, code);
});
test('one movement cannot cover two different orders even when their quantities match', () => {
  const input = handoffFixture([
    {orderId: 'AT-MMTEST-FLOW-STANDARD', invoiceId: 45000001, state: 'active', planHash: 'a'.repeat(64), units: [{sku: '10012', qty: 2}]},
    {orderId: 'AT-MMTEST-FLOW-PAKET', invoiceId: 45000002, state: 'active', planHash: 'b'.repeat(64), units: [{sku: '10012', qty: 2}]},
  ]);
  includePosting(input, input.reservations[0].orderId); includePosting(input, input.reservations[1].orderId);
  input.stockSnapshot.includedMovements.pop(); blocked(input, 'MOVEMENT_REUSED');
});
test('a draft with independent stock issue requires reconciliation, not another deduction', () => {
  const input = includePosting(handoffFixture());
  input.invoices[0].before.state = input.invoices[0].after.state = 'draft'; blocked(input, 'UNEXPECTED_POSTING');
});
test('two admissions cannot reuse one invoice ID', () => {
  const input = handoffFixture(); input.reservations.push({...clone(input.reservations[0]), orderId: 'AT-MMTEST-FLOW-PAKET'});
  blocked(input, 'DUPLICATE_OR_INVALID_INVOICE');
});
for (const [name, mutate, code] of [
  ['return to draft without a verified reversal', i => {i.invoices[0].before.state = i.invoices[0].after.state = 'draft'; i.postings = [];}, 'PREVIOUS_HANDOFF_NOT_RECONCILED'],
  ['lost invoice link', i => {i.reservations[0].invoiceId = null; i.invoices = []; i.postings = [];}, 'PREVIOUS_HANDOFF_NOT_RECONCILED'],
  ['deleted historical admission', i => {i.reservations = []; i.invoices = []; i.postings = [];}, 'INVALID_HANDOFF_HISTORY'],
  ['new movement version', i => {i.postings[0].before.version = i.postings[0].after.version = i.stockSnapshot.includedMovements[0].version = 'movement-v2';}, 'PREVIOUS_HANDOFF_NOT_RECONCILED'],
  ['changed historical plan', i => {i.previousHandoffs[0].planHash = 'd'.repeat(64);}, 'PREVIOUS_HANDOFF_NOT_RECONCILED'],
  ['changed previously accounted units', i => {i.reservations[0].units[0].qty++; i.postings[0].before.units[0].qty++; i.postings[0].after.units[0].qty++;}, 'PREVIOUS_HANDOFF_NOT_RECONCILED'],
  ['duplicate historical handoff', i => {i.previousHandoffs.push(clone(i.previousHandoffs[0]));}, 'DUPLICATE_EVIDENCE'],
]) test('retains handoff history and blocks: ' + name, () => {
  const input = includePosting(handoffFixture()); input.previousHandoffs = reconcileSnapshot(input).proposedHandoffs;
  mutate(input); blocked(input, code);
});
