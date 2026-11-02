import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildDraft, sampleOrder} from './model.mjs';
import {MinimaxDraftClient, ProbeError} from './client.mjs';
import {openJournal} from './journal.mjs';
import {runProbe} from './probe.mjs';

export async function main(args = process.argv.slice(2)) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--preview')) {
    const draft = buildDraft(sampleOrder());
    console.log('LOKALNI PREGLED - bez prijave i bez mreze.');
    console.log(JSON.stringify(draft, null, 2));
    console.log('UKUPNO: 2968.00 RSD. Status: O (nacrt).');
    return;
  }
  const reconcile = args.length === 2 && args[0] === '--reconcile' && /^[1-9]\d*$/.test(args[1]);
  if (!(args.length === 1 && args[0] === '--live') && !reconcile) throw new Error('INVALID_ARGUMENTS');
  // Credentials arrive only on stdin from the local secure prompt. They are
  // never command-line arguments, environment variables or a config file.
  if (process.stdin.isTTY) throw new Error('USE_LOCAL_SECURE_PROMPT');
  let text = '';
  for await (const chunk of process.stdin) {
    text += chunk;
    if (Buffer.byteLength(text) > 8192) throw new Error('INVALID_CREDENTIAL_INPUT');
  }
  let credentials;
  try { credentials = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('INVALID_CREDENTIAL_INPUT'); }
  text = '';
  const client = new MinimaxDraftClient({credentials});
  for (const key of Object.keys(credentials)) credentials[key] = '';
  credentials = null;
  // Stable per-user storage, independent of the downloaded repository folder.
  const directory = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'state'), 'AdriaticTrade', 'MinimaxDraftProbe', '81179');
  let journal;
  try {
    journal = openJournal(directory);
    const result = await runProbe({client, journal, reconcileId: reconcile ? Number(args[1]) : null});
    console.log(`REZULTAT: USPEH; nacrt ${result.id}; ukupno ${result.total.toFixed(2)} RSD; status O.`);
    console.log(result.reused ? 'Postojeci nacrt je procitan i proveren; novi nije kreiran.' : 'Kreiran je jedan probni nacrt. Racun NIJE izdat.');
    console.log(`Minimax: https://moj.minimax.rs/RS/VA/WebUI/IzdanRacun/IzdanRacunView.aspx?iracid=${result.id}&pgat=pgatv`);
  } finally { client.close(); journal?.close(); }
}

// Print only controlled codes/statuses. Never print raw errors, stacks, causes,
// credentials, provider response bodies or access tokens.
const safeCodes = new Set([
  'INVALID_ARGUMENTS', 'USE_LOCAL_SECURE_PROMPT', 'INVALID_CREDENTIAL_INPUT', 'UNEXPECTED_USER',
  'PROBE_LOCKED_CHECK_PREVIOUS_ATTEMPT', 'JOURNAL_INVALID', 'JOURNAL_PAYLOAD_MISMATCH',
  'OUTCOME_UNCERTAIN_DO_NOT_RESEND', 'NO_ATTEMPT_TO_RECONCILE', 'RECONCILE_ID_CONFLICT',
  'LOGIN_ALREADY_ATTEMPTED', 'INVALID_AUTH_RESPONSE', 'LOGIN_REQUIRED_OR_EXPIRED', 'ORG_ACCESS_NOT_CONFIRMED',
  'MINIMAX_HTTP_ERROR', 'MINIMAX_TIMEOUT', 'MINIMAX_NETWORK_ERROR', 'MINIMAX_INVALID_JSON',
  'ONLY_FIXED_SAMPLE_DRAFT_ALLOWED', 'CREATE_OUTCOME_UNCERTAIN', 'CREATE_LOCATION_MISSING', 'UNEXPECTED_CREATE_LOCATION',
  'INVALID_PRICELIST', 'PRICELIST_VALIDATION_FAILED', 'CUSTOMER_PRICE_MISSING_OR_AMBIGUOUS', 'PRICE_ITEM_MISMATCH',
  'CUSTOMER_PRICE_MISMATCH', 'CUSTOMER_NET_PRICE_MISMATCH', 'NOT_A_DRAFT', 'DRAFT_ID_MISMATCH',
  'DRAFT_HEADER_MISMATCH', 'DRAFT_REFERENCE_MISMATCH', 'DRAFT_DATE_MISMATCH', 'DRAFT_ROWS_MISMATCH',
  'DRAFT_ITEM_MISMATCH', 'DRAFT_QUANTITY_MISMATCH', 'DRAFT_AMOUNT_MISMATCH', 'DRAFT_TAX_MISMATCH',
  'DRAFT_WAREHOUSE_MISMATCH', 'DRAFT_PAYMENT_MISMATCH', 'DRAFT_CUSTOMER_MISMATCH',
  'DRAFT_DOCUMENTNUMBERING_MISMATCH', 'DRAFT_EMPLOYEE_MISMATCH', 'DRAFT_CURRENCY_MISMATCH',
]);
export function safeError(error) {
  const code = safeCodes.has(error?.message) ? error.message : 'PROBE_FAILED';
  return `REZULTAT: NEUSPEH; ${code}${error instanceof ProbeError && error.status ? `; HTTP ${error.status}` : ''}.`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(safeError(error));
    console.error('Ne ponavljajte naslepo. Sacuvajte lokalnu evidenciju i posaljite samo red REZULTAT.');
    process.exitCode = 1;
  });
}
