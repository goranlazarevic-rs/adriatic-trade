import {CONFIG, buildDraft, sampleOrder, demand} from './model.mjs';

const API = 'https://moj.minimax.rs/RS/API/';
const TOKEN = 'https://moj.minimax.rs/RS/AUT/oauth20/token';
const collection = `api/orgs/${CONFIG.organisationId}/issuedinvoices`;

export class ProbeError extends Error {
  constructor(code, status = 0) { super(code); this.name = 'ProbeError'; this.code = code; this.status = status; }
}

// Finite test-only surface: auth, a few GETs and creation of the fixed sample
// draft. No issue/refund/delete/custom action, arbitrary URLs or auto retries.
export class MinimaxDraftClient {
  #credentials; #token; #until = 0; #fetch; #timeout;
  constructor({credentials, fetchImpl = globalThis.fetch, timeoutMs = 15000}) {
    demand(credentials && ['clientId', 'clientSecret', 'username', 'password'].every(k =>
      typeof credentials[k] === 'string' && credentials[k].length > 0 && credentials[k].length <= 2000), 'INVALID_CREDENTIAL_INPUT');
    demand(credentials.username === 'adriatic-webshop', 'UNEXPECTED_USER');
    this.#credentials = {...credentials}; this.#fetch = fetchImpl; this.#timeout = timeoutMs;
  }
  async #request(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeout);
    try {
      const response = await this.#fetch(url, {...options, redirect: 'error', signal: controller.signal});
      if (!response.ok) throw new ProbeError('MINIMAX_HTTP_ERROR', response.status);
      const text = await response.text();
      if (text.length > 2_000_000) throw new ProbeError('MINIMAX_INVALID_JSON');
      return {status: response.status, headers: response.headers, text};
    } catch (error) {
      if (error instanceof ProbeError) throw error;
      // Never propagate provider text, URLs with query data, request bodies,
      // tokens or credentials through an exception/cause/log.
      throw new ProbeError(controller.signal.aborted ? 'MINIMAX_TIMEOUT' : 'MINIMAX_NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  async #json(response) {
    try {
      return JSON.parse(response.text);
    } catch { throw new ProbeError('MINIMAX_INVALID_JSON'); }
  }
  async login() {
    demand(this.#credentials, 'LOGIN_ALREADY_ATTEMPTED');
    const c = this.#credentials; this.#credentials = null;
    try {
      const response = await this.#request(TOKEN, {method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json'},
        body: new URLSearchParams({client_id: c.clientId, client_secret: c.clientSecret,
          username: c.username, password: c.password, grant_type: 'password', scope: 'minimax.rs'}).toString()});
      const data = await this.#json(response);
      demand(typeof data.access_token === 'string' && data.access_token.length > 0 &&
        typeof data.token_type === 'string' && data.token_type.toLowerCase() === 'bearer' &&
        Number.isFinite(Number(data.expires_in)) && Number(data.expires_in) > 60, 'INVALID_AUTH_RESPONSE');
      this.#token = data.access_token;
      this.#until = Date.now() + (Math.min(Number(data.expires_in), 3600) - 30) * 1000;
    } finally { for (const key of Object.keys(c)) c[key] = ''; }
  }
  #headers() {
    demand(this.#token && Date.now() < this.#until, 'LOGIN_REQUIRED_OR_EXPIRED');
    return {Authorization: `Bearer ${this.#token}`, Accept: 'application/json'};
  }
  async #get(relative) {
    const response = await this.#request(API + relative, {method: 'GET', headers: this.#headers()});
    return this.#json(response);
  }
  async verifyOrganisation() {
    const data = await this.#get('api/currentuser/orgs?CurrentPage=1&PageSize=100');
    demand(Array.isArray(data.Rows) && data.Rows.some(r => r.Organisation?.ID === CONFIG.organisationId && r.APIAccess === 'D'), 'ORG_ACCESS_NOT_CONFIRMED');
  }
  getPrices() { return this.#get(`api/orgs/${CONFIG.organisationId}/items/pricelists?CustomerId=${CONFIG.customerId}`); }
  getInvoice(id) {
    demand(Number.isSafeInteger(id) && id > 0, 'INVALID_INVOICE_ID');
    return this.#get(`${collection}/${id}`);
  }
  async createSampleDraft(payload) {
    // Exact whitelist also excludes IDs/RowVersions accidentally copied from GET.
    demand(JSON.stringify(payload) === JSON.stringify(buildDraft(sampleOrder(), payload?.DateIssued)), 'ONLY_FIXED_SAMPLE_DRAFT_ALLOWED');
    const response = await this.#request(API + collection, {method: 'POST',
      headers: {...this.#headers(), 'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
    demand(response.status === 201, 'CREATE_OUTCOME_UNCERTAIN');
    return invoiceIdFromLocation(response.headers.get('Location'));
  }
  close() { this.#token = null; this.#until = 0; this.#credentials = null; }
}

export function invoiceIdFromLocation(location) {
  demand(typeof location === 'string' && location.length > 0, 'CREATE_LOCATION_MISSING');
  const url = new URL(location, API);
  demand(url.origin === 'https://moj.minimax.rs' && !url.username && !url.password && !url.hash, 'UNEXPECTED_CREATE_LOCATION');
  const match = url.pathname.match(/^\/(?:RS\/API\/)?api\/orgs\/81179\/issuedinvoices\/([1-9]\d*)\/?$/i);
  const id = Number(match?.[1]);
  demand(Number.isSafeInteger(id) && id > 0, 'UNEXPECTED_CREATE_LOCATION');
  // Minimax's official AddIssuedInvoice response example repeats the path ID
  // as ?id=6776691. Accept that one matching parameter only; do not follow the
  // Location URL or forward its query. Readback uses our fixed HTTPS API path.
  const params = [...url.searchParams.entries()];
  demand(params.length === 0 || (params.length === 1 && params[0][0] === 'id' &&
    params[0][1] === String(id)), 'UNEXPECTED_CREATE_LOCATION');
  return id;
}
