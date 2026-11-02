import {CONFIG, buildDraft, sampleOrder, validatePriceList, verifyDraft, demand} from './model.mjs';

export async function runProbe({client, journal, reconcileId = null, day}) {
  let entry = journal.read();
  const fixed = buildDraft(sampleOrder(), entry?.payload?.DateIssued ?? day);
  if (entry) demand(JSON.stringify(entry.payload) === JSON.stringify(fixed), 'JOURNAL_PAYLOAD_MISMATCH');
  if (entry?.status === 'sending' && reconcileId === null) throw new Error('OUTCOME_UNCERTAIN_DO_NOT_RESEND');
  await client.login();
  await client.verifyOrganisation();
  if (reconcileId !== null) {
    demand(entry?.status === 'sending' || entry?.status === 'created' || entry?.status === 'verified', 'NO_ATTEMPT_TO_RECONCILE');
    if (entry.invoiceId) demand(entry.invoiceId === reconcileId, 'RECONCILE_ID_CONFLICT');
    const actual = await client.getInvoice(reconcileId);
    const result = verifyDraft(actual, entry.payload);
    demand(actual.IssuedInvoiceId === reconcileId, 'DRAFT_ID_MISMATCH');
    journal.write({...entry, invoiceId: reconcileId, status: 'verified'});
    return {...result, reused: true};
  }
  if (entry?.invoiceId) {
    const actual = await client.getInvoice(entry.invoiceId);
    const result = verifyDraft(actual, entry.payload);
    demand(actual.IssuedInvoiceId === entry.invoiceId, 'DRAFT_ID_MISMATCH');
    journal.write({...entry, status: 'verified'});
    return {...result, reused: true};
  }
  // Validate the user's saved six-line reference and current customer prices
  // before preparing any write. No copying of original invoice/row/payment IDs.
  verifyDraft(await client.getInvoice(CONFIG.referenceInvoiceId), fixed, {referenceOnly: true});
  validatePriceList(await client.getPrices(), fixed);
  entry = {status: 'prepared', payload: fixed};
  journal.write(entry);
  // This MUST be durable before POST. A crash, HTTP error, malformed success
  // or timeout now requires reconciliation; no automatic second create.
  entry = {...entry, status: 'sending'};
  journal.write(entry);
  const id = await client.createSampleDraft(entry.payload);
  entry = {...entry, invoiceId: id, status: 'created'};
  journal.write(entry);
  const actual = await client.getInvoice(id);
  const result = verifyDraft(actual, entry.payload);
  demand(actual.IssuedInvoiceId === id, 'DRAFT_ID_MISMATCH');
  journal.write({...entry, status: 'verified'});
  return {...result, reused: false};
}
