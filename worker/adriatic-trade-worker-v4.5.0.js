const PRODUCTS = {
  "10086": {
    name: "Cvet soli - natron kesa 100 g",
    price: 600,
    detail: "100 g"
  },
  "10012": {
    name: "Cvet soli - kutija sa plutanim poklopcem 125 g",
    price: 800,
    detail: "125 g"
  },
  "10306": {
    name: "BIO nerafinisana sitna morska so 600 g ZIP",
    price: 299,
    detail: "600 g ZIP"
  },
  "10307": {
    name: "BIO nerafinisana krupna morska so 600 g ZIP",
    price: 299,
    detail: "600 g ZIP"
  },
  "10240": {
    name: "BIO nerafinisana sitna morska so 500 g - kutija sa poklopcem",
    price: 550,
    detail: "500 g"
  },
  "PKT-PROBA": {
    name: "Probaj",
    price: 1150,
    detail: "Cvet soli 100 g + sitna 600 g ZIP + krupna 600 g ZIP"
  },
  "PKT-GURMAN": {
    name: "Za svaki dan",
    price: 1650,
    detail: "Kutija 500 g + sitna 600 g ZIP + krupna 600 g ZIP + Cvet soli 100 g"
  },
  "PKT-KOMPLET": {
    name: "Premium",
    price: 1800,
    detail: "Kutija 500 g + Cvet soli 125 g + Cvet soli 100 g"
  }
};


const PROMOTIONS = {
  "10240": { regularPrice: 550, promoPrice: 499, start: "2026-09-27", end: "2026-10-27" }
};

function belgradeDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function currentProductPrice(sku, date = new Date()) {
  const product = PRODUCTS[sku];
  if (!product) return 0;
  const promo = PROMOTIONS[sku];
  if (!promo) return product.price;
  const key = belgradeDateKey(date);
  return key >= promo.start && key < promo.end ? promo.promoPrice : promo.regularPrice;
}

const BUSINESS_EMAIL = "info@adriatictrade.rs";
const FROM_EMAIL = "Adriatic Trade <porudzbine@orders.adriatictrade.rs>";
const FREE_SHIPPING = 3500;
const SHIPPING_FEE = 420;
const MAX_ITEMS = 20;
const LEGAL_NOTICE_URL = "https://adriatictrade.rs/dokumenti/adriatic-trade-obavestenje-prodaja-na-daljinu.pdf";
const WITHDRAWAL_FORM_URL = "https://adriatictrade.rs/dokumenti/adriatic-trade-obrazac-odustanak.pdf";
const IPS_ACCOUNT = "265201031001135831";
const IPS_PAYEE = "ADRIATIC TRADE DOO\r\nCVETNA 6\r\nSREMSKA KAMENICA";
const IPS_GENERATOR_URL = "https://nbs.rs/QRcode/api/qr/v1/gen/500?lang=sr_RS_Latn";
const LOCAL_PAYMENT_IPS = "Lična dostava — IPS na račun";
const LOCAL_PAYMENT_BANK = "Lična dostava — uplata na račun";
const IPS_TIMEOUT_MS = 5000;

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ACTION = "checkout_order";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MIN_FORM_AGE_MS = 800;
const ALLOWED_TURNSTILE_HOSTS = new Set(["adriatictrade.rs", "www.adriatictrade.rs"]);
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com", "dispostable.com", "guerrillamail.com", "mailinator.com",
  "sharklasers.com", "temp-mail.org", "trashmail.com", "yopmail.com"
]);
const COMMON_EMAIL_DOMAIN_TYPOS = {
  "gmai.com": "gmail.com", "gmial.com": "gmail.com", "gmail.con": "gmail.com",
  "hotmai.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com", "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com", "yahoo.con": "yahoo.com"
};
let securitySchemaReady = false;

const ALLOWED_ORIGINS = new Set([
  "https://adriatictrade.rs",
  "https://www.adriatictrade.rs"
]);

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(flushInquiryOutbox(env).catch(() => console.error('Inquiry retry failed')));
    ctx.waitUntil(flushNotificationOutbox(env).catch(error => console.error("Email retry failed", error.message)));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (!ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        ok: true,
        service: "Adriatic Trade Orders",
        version: "4.10.2",
        status: "ready",
        database: Boolean(env.DB),
        receipts: Boolean(env.RECEIPTS),
        inquiries: inquiryReady(env),
        security: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY && env.SECURITY_PEPPER)
      }, 200, origin);
    }

    if (request.method === "GET" && url.pathname === "/security/config") {
      if (!ALLOWED_ORIGINS.has(origin)) {
        return json({ ok: false, error: "Origin not allowed" }, 403, origin);
      }
      const siteKey = clean(env.TURNSTILE_SITE_KEY, 100);
      if (!siteKey) return json({ ok: false, error: "Zaštita porudžbine nije podešena." }, 503, origin);
      return json({ ok: true, turnstileSiteKey: siteKey }, 200, origin);
    }

    if (url.pathname === "/inquiry/config" && request.method === "GET") {
      if (!ALLOWED_ORIGINS.has(origin)) return json({ok:false},403,origin);
      if (!inquiryReady(env)) return json({ok:false,error:"Prijem upita trenutno nije dostupan."},503,origin);
      return json({ok:true,turnstileSiteKey:env.TURNSTILE_SITE_KEY,ticket:await inquiryTicket(env)},200,origin);
    }
    if (url.pathname === "/inquiry") {
      if (request.method !== "POST") return json({ok:false,error:"Method not allowed"},405,origin);
      return handleInquiry(request,env,origin,ctx);
    }

    if (url.pathname === "/order") {
      if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405, origin);
      return handleCreateOrder(request, env, origin);
    }

    if (url.pathname.startsWith("/admin/")) {
      if (!ALLOWED_ORIGINS.has(origin)) {
        return json({ ok: false, error: "Origin not allowed" }, 403, origin);
      }
      if (!isAdminAuthorized(request, env)) {
        return json({ ok: false, error: "Neispravan administratorski pristup." }, 401, origin);
      }
      if (!env.DB) {
        return json({ ok: false, error: "D1 baza nije povezana sa Worker-om." }, 503, origin);
      }
      try {
        if (url.pathname === "/admin/availability") return await handleAvailability(request, env, origin);
        if (url.pathname === "/admin/minimax-stock") return await mmHandleStock(request, env, url, origin);
        if (url.pathname === "/admin/inquiries" && request.method === "GET") {
          await ensureInquirySchema(env.DB);
          await pruneInquiries(env.DB);
          const rows = await env.DB.prepare("SELECT id,status,created_at,attempts FROM inquiry_outbox ORDER BY created_at DESC LIMIT 100").all();
          return json({ok:true,inquiries:rows.results},200,origin);
        }
        return await handleAdmin(request, env, url, origin);
      } catch (error) {
        console.error("Admin API error", error);
        return json({ ok: false, error: "Greška u administrativnom panelu." }, 500, origin);
      }
    }

    return json({ ok: false, error: "Not found" }, 404, origin);
  }
};

async function handleCreateOrder(request, env, origin) {
  if (!ALLOWED_ORIGINS.has(origin)) {
    return json({ ok: false, error: "Origin not allowed" }, 403, origin);
  }

  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is missing");
    return json({ ok: false, error: "Server configuration error" }, 500, origin);
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "Expected application/json" }, 415, origin);
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 25000) {
    return json({ ok: false, error: "Request too large" }, 413, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400, origin);
  }

  const honeypot = clean(body?.security?.website, 200);
  if (honeypot) {
    console.warn("Order blocked: honeypot");
    return json({ ok: false, error: "Porudžbina nije prihvaćena." }, 400, origin);
  }

  const turnstile = await verifyTurnstile(request, env, body?.security?.turnstileToken);
  if (!turnstile.ok) {
    return json({
      ok: false,
      error: turnstile.error || "Bezbednosna provera nije uspela. Osvežite stranicu i pokušajte ponovo."
    }, turnstile.status || 403, origin);
  }

  const validation = validateOrder(body);
  if (!validation.ok) {
    return json({ ok: false, error: validation.error }, 400, origin);
  }

  const rateLimit = await enforceOrderRateLimit(request, env, validation.data.submissionId);
  if (!rateLimit.ok) {
    return json(
      { ok: false, error: "Previše porudžbina je poslato sa ove mreže u kratkom periodu. Molimo pokušajte ponovo kasnije ili nas kontaktirajte." },
      429,
      origin,
      { "Retry-After": "3600" }
    );
  }

  // A stored submission is the only safe authority for retries. Never fall back
  // to accepting an email-only order when the admission database is unavailable.
  if (!env.DB) return intakeError(origin);
  let order = buildOrder(validation.data);
  let duplicate = false;
  let stored = false;
  let emailState = { business: false, customer: false };
  try {
    const admission = await acceptOrder(env.DB, order, async()=>{
      order.securityFlags = [...new Set([
        ...getClientRiskFlags(validation.data.customer.email, body?.security?.startedAt),
        ...await getVelocityRiskFlags(env.DB, validation.data.customer.email, validation.data.customer.phone)
      ])];
    });
    if (admission.rejection) return json({ok:false,...admission.rejection.body},admission.rejection.status,origin);
    order = admission.order;
    duplicate = admission.duplicate;
    emailState.business = Boolean(order.businessEmailSent);
    emailState.customer = Boolean(order.customerEmailSent);
    stored = true;
  } catch (error) {
    console.error("Order admission unavailable");
    return intakeError(origin);
  }

  if (!emailState.business) {
    const businessResult = await sendEmail(env.RESEND_API_KEY, {
      from: FROM_EMAIL,
      to: [BUSINESS_EMAIL],
      reply_to: order.customer.email,
      subject: `NOVA PORUDŽBINA ${order.id} · ${formatRsd(order.total)}`,
      html: businessEmailHtml(order),
      tags: [
        { name: "category", value: "new_order" },
        { name: "order_id", value: order.id }
      ]
    }, `business/${order.submissionId}`);

    if (!businessResult.ok) {
      console.error("Business email failed", businessResult.status, businessResult.data);
      return json({
        ok: false,
        error: "Porudžbina trenutno ne može da bude poslata. Molimo pokušajte ponovo."
      }, 502, origin);
    }

    emailState.business = true;
    if (stored) {
      await safeDbUpdate(env.DB, "UPDATE orders SET business_email_sent = 1, updated_at = ? WHERE id = ?", [new Date().toISOString(), order.id]);
    }
  }

  if (!emailState.customer) {
    const customerResult = await sendEmail(env.RESEND_API_KEY, {
      from: FROM_EMAIL,
      to: [order.customer.email],
      reply_to: BUSINESS_EMAIL,
      subject: `Porudžbina ${order.id} je primljena`,
      html: customerEmailHtml(order),
      tags: [
        { name: "category", value: "order_confirmation" },
        { name: "order_id", value: order.id }
      ]
    }, `customer/${order.submissionId}`);

    emailState.customer = customerResult.ok;
    if (!customerResult.ok) {
      console.error("Customer confirmation failed", customerResult.status, customerResult.data);
    } else if (stored) {
      await safeDbUpdate(env.DB, "UPDATE orders SET customer_email_sent = 1, updated_at = ? WHERE id = ?", [new Date().toISOString(), order.id]);
    }
  }

  return json({
    ok: true,
    orderId: order.id,
    goodsTotal: order.goodsTotal,
    shipping: order.shipping,
    total: order.total,
    confirmationEmail: emailState.customer,
    duplicateProtection: true,
    duplicate,
    stored
  }, duplicate ? 200 : 201, origin);
}

async function handleAdmin(request, env, url, origin) {
  await ensureNotificationSchema(env.DB);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS order_operations (
    order_id TEXT PRIMARY KEY, data_json TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 0
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS integration_jobs (
    operation_key TEXT PRIMARY KEY, order_id TEXT NOT NULL, provider TEXT NOT NULL,
    operation TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', external_id TEXT,
    attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS courier_export_batches (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, finalized INTEGER NOT NULL DEFAULT 0
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS courier_export_orders (
    order_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, snapshot_json TEXT NOT NULL
  )`).run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS courier_export_access(id INTEGER PRIMARY KEY AUTOINCREMENT,batch_id TEXT NOT NULL,created_at TEXT NOT NULL,actor TEXT NOT NULL)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_courier_export_batch ON courier_export_orders(batch_id)').run();
  if (url.pathname === '/admin/probe-orders' || url.pathname.startsWith('/admin/probe-orders/')) return mmHandleProbeOrder(request,env,url,origin);
  const excludeLocal="NOT EXISTS(SELECT 1 FROM order_events WHERE order_id=orders.id AND event_type='local_delivery_approved')";
  const exportReady=excludeLocal+" AND orders.status='confirmed' AND json_extract(order_operations.data_json,'$.fulfillment')='ready' AND NOT EXISTS(SELECT 1 FROM courier_export_orders WHERE order_id=orders.id)";
  if(request.method==='GET' && url.pathname==='/admin/attention') {
    const result=await env.DB.prepare(`SELECT
      COALESCE(SUM(orders.status='new'),0) AS newOrders,
      COALESCE(SUM(orders.status='confirmed' AND COALESCE(json_extract(order_operations.data_json,'$.fulfillment'),'pending')='pending'),0) AS prepare,
      COALESCE(SUM(${exportReady}),0) AS exportReady,
      COALESCE(SUM(orders.status='shipped' AND COALESCE(json_extract(order_operations.data_json,'$.paymentStatus'),'unpaid')='unpaid'),0) AS unpaid
      FROM orders LEFT JOIN order_operations ON order_operations.order_id=orders.id`).first();
    return json({ok:true,counts:result},200,origin);
  }
  if(request.method==='GET' && url.pathname==='/admin/courier-exports') {
    const rows=await env.DB.prepare(`SELECT b.id,b.created_at,COUNT(e.order_id) AS order_count FROM courier_export_batches b JOIN courier_export_orders e ON e.batch_id=b.id WHERE b.finalized=1 GROUP BY b.id ORDER BY b.created_at DESC LIMIT 50`).all();
    return json({ok:true,batches:rows.results||[]},200,origin);
  }
  const exportMatch=url.pathname.match(/^\/admin\/courier-exports\/(EXP-[a-f0-9-]{36})$/);
  if(request.method==='GET' && exportMatch) {
    const batch=await env.DB.prepare('SELECT * FROM courier_export_batches WHERE id=? AND finalized=1').bind(exportMatch[1]).first();
    if(!batch)return json({ok:false,error:'Izvozni paket nije pronađen.'},404,origin);
    const rows=await env.DB.prepare('SELECT snapshot_json FROM courier_export_orders WHERE batch_id=? ORDER BY order_id').bind(batch.id).all();
    await env.DB.prepare('INSERT INTO courier_export_access(batch_id,created_at,actor) VALUES (?,?,?)').bind(batch.id,new Date().toISOString(),'Administrator').run();
    return new Response(courierCsv((rows.results||[]).map(x=>rowToOrder(JSON.parse(x.snapshot_json))),batch),{headers:{...corsHeaders(origin),'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${batch.id}.csv"`}});
  }
  if(request.method==='POST' && url.pathname==='/admin/courier-exports') {
    let body;try{body=await request.json()}catch{return json({ok:false,error:'Neispravan zahtev.'},400,origin)}
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.requestId||''))return json({ok:false,error:'Neispravan ID izvoza.'},400,origin);
    const id='EXP-'+body.requestId,now=new Date().toISOString();
    const columns=['id','created_at','status','customer_first_name','customer_last_name','customer_email','customer_phone','delivery_method','address','postal_code','city','payment','items_json','goods_total','shipping','total','courier','tracking_number'];
    const snapshot="json_object("+columns.map(k=>"'"+k+"',orders."+k).join(',')+",'operations_json',order_operations.data_json)";
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO courier_export_batches(id,created_at) VALUES (?,?)').bind(id,now),
      env.DB.prepare(`INSERT OR IGNORE INTO courier_export_orders(order_id,batch_id,snapshot_json) SELECT orders.id,?,${snapshot} FROM orders JOIN order_operations ON order_operations.order_id=orders.id WHERE ${exportReady} AND EXISTS(SELECT 1 FROM courier_export_batches WHERE id=? AND finalized=0)`).bind(id,id),
      env.DB.prepare(`INSERT INTO order_events(order_id,event_type,note,created_at) SELECT order_id,'courier_export',?,? FROM courier_export_orders WHERE batch_id=? AND EXISTS(SELECT 1 FROM courier_export_batches WHERE id=? AND finalized=0)`).bind('Administrator · Izvoz za kurira '+id,now,id,id),
      env.DB.prepare('UPDATE courier_export_batches SET finalized=1 WHERE id=?').bind(id)
    ]);
    const batch=await env.DB.prepare('SELECT b.id,b.created_at,COUNT(e.order_id) AS order_count FROM courier_export_batches b LEFT JOIN courier_export_orders e ON e.batch_id=b.id WHERE b.id=? GROUP BY b.id').bind(id).first();
    return json({ok:true,batch},200,origin);
  }
  if ((request.method === "POST") && /\/(confirm|ship|reject|cancel)$/.test(url.pathname) && !env.RESEND_API_KEY) {
    return json({ ok: false, error: "Resend API ključ nije podešen." }, 503, origin);
  }

  if (request.method === "GET" && url.pathname === "/admin/orders") {
    const status = clean(url.searchParams.get("status"), 20).toLowerCase();
    const q = clean(url.searchParams.get("q"), 100);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));

    const conditions = [];
    const params = [];
    if (status && ["new", "confirmed", "shipped", "rejected", "cancelled"].includes(status)) {
      conditions.push("status = ?");
      params.push(status);
    }
    if (q) {
      conditions.push("(id LIKE ? OR customer_first_name LIKE ? OR customer_last_name LIKE ? OR customer_email LIKE ? OR customer_phone LIKE ? OR tracking_number LIKE ?)");
      const needle = `%${q}%`;
      params.push(needle, needle, needle, needle, needle, needle);
    }

    for (const [key,op] of [['from','>='],['to','<=']]) {
      const date=url.searchParams.get(key);
      if(date && /^\d{4}-\d{2}-\d{2}$/.test(date)) { conditions.push(`substr(created_at,1,10) ${op} ?`); params.push(date); }
    }
    const attention=url.searchParams.get('attention');
    const actions={new:"orders.status='new'",prepare:"orders.status='confirmed' AND COALESCE(json_extract((SELECT data_json FROM order_operations WHERE order_id=orders.id),'$.fulfillment'),'pending')='pending'",export:"orders.status='confirmed' AND json_extract((SELECT data_json FROM order_operations WHERE order_id=orders.id),'$.fulfillment')='ready' AND NOT EXISTS(SELECT 1 FROM courier_export_orders WHERE order_id=orders.id)",unpaid:"orders.status='shipped' AND COALESCE(json_extract((SELECT data_json FROM order_operations WHERE order_id=orders.id),'$.paymentStatus'),'unpaid')='unpaid'"};
    if(actions[attention])conditions.push(attention==='export'?`(${actions[attention]}) AND ${excludeLocal}`:actions[attention]);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const stmt = env.DB.prepare(`SELECT orders.*, (SELECT data_json FROM order_operations WHERE order_id=orders.id) AS operations_json, EXISTS(SELECT 1 FROM order_events WHERE order_id=orders.id AND event_type='security_flag') AS security_flagged FROM orders ${where} ORDER BY created_at DESC LIMIT ?`).bind(...params, limit);
    const result = await stmt.all();
    return json({ ok: true, orders: (result.results || []).map(rowToOrder) }, 200, origin);
  }

  const match = url.pathname.match(/^\/admin\/orders\/([^/]+)(?:\/(confirm|ship|reject|cancel|receipt|operations|local-delivery|local-payment|local-schedule|local-delivered|ips-qr|email-retry|minimax-draft))?$/);
  if (!match) return json({ ok: false, error: "Not found" }, 404, origin);

  const orderId = decodeURIComponent(match[1]);
  const action = match[2] || "";
  const order = await getOrderById(env.DB, orderId);
  if (!order) return json({ ok: false, error: "Porudžbina nije pronađena." }, 404, origin);
  if (action === 'minimax-draft') return mmHandleDraft(request, env, order, origin);
  if (request.method === 'POST' && await mmStagingEnabled(env)) {
    await mmEnsureSchema(env.DB);
    const active = await env.DB.prepare("SELECT status FROM minimax_drafts WHERE order_id=? AND status IN ('sending','attention','created')").bind(order.id).first();
    if (active) return json({ok:false,error:'Prvo proverite ishod prenosa Minimax nacrta. Porudžbina je privremeno zaključana.'},409,origin);
  }

  if (request.method === "POST" && action === "email-retry") {
    await env.DB.prepare("UPDATE notification_outbox SET status='pending', next_attempt_at=?, attempts=0 WHERE order_id=? AND status='attention' AND (first_attempt_at IS NULL OR first_attempt_at>?)")
      .bind(Date.now(), order.id, Date.now()-23*60*60*1000).run();
    return notificationResponse(env, order.id, origin);
  }

  if (request.method === "POST" && action === "local-delivery") {
    if (order.status !== "new") {
      return json({ ok: false, error: "Besplatna lokalna dostava može se odobriti samo pre potvrde porudžbine." }, 409, origin);
    }
    if (order.delivery.method !== "Dostava na adresu" || normalizePlace(order.delivery.city) !== "novi sad") {
      return json({ ok: false, error: "Lokalna dostava može se odobriti samo za dostavu na adresu u Novom Sadu." }, 409, origin);
    }
    if (order.shipping === 0) {
      return json({ ok: false, error: "Dostava je već besplatna." }, 409, origin);
    }
    const now = new Date().toISOString();
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE orders SET shipping = 0, total = goods_total, payment = ?, updated_at = ? WHERE id = ? AND status = 'new' AND shipping > 0")
        .bind(LOCAL_PAYMENT_IPS, now, order.id),
      env.DB.prepare("INSERT INTO order_events(order_id,event_type,note,created_at) SELECT ?, 'local_delivery_approved', ?, ? WHERE changes()=1")
        .bind(order.id, "Administrator · Odobrena besplatna lokalna dostava za Novi Sad. Ukupan iznos je umanjen za dostavu, a IPS plaćanje je izabrano kao podrazumevano.", now)
    ]);
    if (!results[0].meta.changes) return json({ ok: false, error: "Porudžbina je u međuvremenu promenjena. Osvežite prikaz." }, 409, origin);
    return json({ ok: true, order: await getOrderById(env.DB, order.id) }, 200, origin);
  }

  if (request.method === "POST" && action === "local-payment") {
    if (!["new", "confirmed"].includes(order.status) || !isApprovedLocalDelivery(order) || order.operations.paymentStatus !== "unpaid") {
      return json({ ok: false, error: "Način plaćanja može se menjati samo za otvorenu, nenaplaćenu ličnu dostavu." }, 409, origin);
    }
    let body; try { body = await request.json(); } catch { return json({ ok: false, error: "Neispravan zahtev." }, 400, origin); }
    if (!["ips", "bank_transfer"].includes(body?.method)) {
      return json({ ok: false, error: "Lična dostava se plaća isključivo na račun, IPS QR kodom ili bankarskim transferom." }, 400, origin);
    }
    const payment = body.method === "ips" ? LOCAL_PAYMENT_IPS : LOCAL_PAYMENT_BANK;
    if (payment === order.payment) return notificationResponse(env, order.id, origin, true);
    const payload = order.status === "confirmed" ? {
      from: FROM_EMAIL, to: [order.customer.email], reply_to: BUSINESS_EMAIL,
      subject: `Uputstvo za uplatu na račun — ${order.id}`,
      html: emailShell(`<h1>Uplata za ličnu dostavu</h1><p>Za porudžbinu ${escapeHtml(order.id)} način plaćanja je promenjen u: ${escapeHtml(payment)}.</p>${bankTransferEmailHtml(order)}`)
    } : null;
    if (payload && !env.RESEND_API_KEY) return json({ ok: false, error: "Resend API ključ nije podešen." }, 503, origin);
    const now = new Date().toISOString();
    const results = await commitNotification(env, order.id, [
      env.DB.prepare("UPDATE orders SET payment = ?, updated_at = ? WHERE id = ? AND status = ? AND payment = ? AND EXISTS(SELECT 1 FROM order_operations WHERE order_id=orders.id AND revision=?)")
        .bind(payment, now, order.id, order.status, order.payment, order.operationsRevision),
      env.DB.prepare("INSERT INTO order_events(order_id,event_type,note,created_at) SELECT ?, 'local_payment_changed', ?, ? WHERE changes()=1")
        .bind(order.id, `Administrator (zajednički ključ) · Plaćanje: ${order.payment} → ${payment}.` + (order.status === "confirmed" ? " Instrukcije za uplatu su sačuvane za slanje." : ""), now)
    ], payload);
    if (!results[0].meta.changes) return json({ ok: false, error: "Podaci su promenjeni. Osvežite porudžbinu." }, 409, origin);
    return notificationResponse(env, order.id, origin);
  }

  if (request.method === "GET" && action === "ips-qr") {
    if (!isApprovedLocalDelivery(order) || order.payment !== LOCAL_PAYMENT_IPS) {
      return json({ ok: false, error: "IPS QR je dostupan samo za odobrenu lokalnu dostavu sa IPS plaćanjem." }, 409, origin);
    }
    const qr = await generateIpsQr(order);
    if (!qr.ok) return json({ ok: false, error: "IPS QR trenutno nije dostupan. Koristite instrukcije za uplatu na račun." }, 502, origin);
    return new Response(qr.buffer, {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="ips-${sanitizeHeaderFilename(order.id)}.png"`,
        "Cache-Control": "no-store"
      }
    });
  }

  if (request.method === "POST" && action === "local-schedule") {
    if (order.status !== "confirmed" || !isApprovedLocalDelivery(order)) {
      return json({ ok: false, error: "Termin se može dogovoriti samo za potvrđenu ličnu dostavu." }, 409, origin);
    }
    if (!isBankLocalPayment(order)) return json({ ok: false, error: "Prvo izaberite uplatu na račun za ličnu dostavu." }, 409, origin);
    let body; try { body = await request.json(); } catch { return json({ ok: false, error: "Neispravan zahtev." }, 400, origin); }
    const date = clean(body?.date, 10);
    const timeWindow = clean(body?.timeWindow, 80);
    const location = clean(body?.location, 300);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) return json({ ok: false, error: "Izaberite važeći datum lične isporuke." }, 400, origin);
    if (date < belgradeDateKey()) return json({ ok: false, error: "Datum isporuke ne može biti u prošlosti." }, 400, origin);
    if (!timeWindow) return json({ ok: false, error: "Unesite dogovoreno vreme ili vremenski okvir." }, 400, origin);
    if (!location) return json({ ok: false, error: "Unesite dogovoreno mesto isporuke." }, 400, origin);

    const previousSchedule = order.operations.localDelivery;
    if (previousSchedule && previousSchedule.date === date && previousSchedule.timeWindow === timeWindow && previousSchedule.location === location) {
      return notificationResponse(env, order.id, origin, true);
    }
    if (!env.RESEND_API_KEY) return json({ ok: false, error: "Resend API ključ nije podešen." }, 503, origin);
    const payload = {
      from: FROM_EMAIL,
      to: [order.customer.email],
      reply_to: BUSINESS_EMAIL,
      subject: `Dogovoren termin lične isporuke — ${order.id}`,
      html: localScheduleEmailHtml(order, { date, timeWindow, location }),
      tags: [
        { name: "category", value: "local_delivery_scheduled" },
        { name: "order_id", value: order.id }
      ]
    };
    const current = order.operations || {};
    const now = new Date().toISOString();
    const next = { ...current, localDelivery: { date, timeWindow, location, scheduledAt: now, notifiedAt: "", deliveredAt: current.localDelivery?.deliveredAt || "" } };
    const results = await commitNotification(env, order.id, [
      env.DB.prepare("UPDATE order_operations SET data_json=?, revision=revision+1 WHERE order_id=? AND revision=? AND EXISTS(SELECT 1 FROM orders WHERE id=order_operations.order_id AND status='confirmed' AND payment=?)")
        .bind(JSON.stringify(next), order.id, order.operationsRevision, order.payment),
      env.DB.prepare("INSERT INTO order_events(order_id,event_type,note,created_at) SELECT ?, 'local_delivery_scheduled', ?, ? WHERE changes()=1")
        .bind(order.id, `Administrator (zajednički ključ) · Termin lične isporuke: ${date}, ${timeWindow}; mesto: ${location}. Email je sačuvan za slanje.`, now)
    ], payload, { schedule: { date, timeWindow, location } });
    if (!results[0].meta.changes) return json({ ok: false, error: "Podaci su promenjeni. Osvežite porudžbinu." }, 409, origin);
    return notificationResponse(env, order.id, origin);
  }

  if (request.method === "POST" && action === "local-delivered") {
    if (order.status === "shipped" && order.operations?.fulfillment === "delivered") return notificationResponse(env, order.id, origin, true);
    if (order.status !== "confirmed" || !isApprovedLocalDelivery(order) || !order.operations?.localDelivery?.date) {
      return json({ ok: false, error: "Prvo potvrdite i zakažite ličnu dostavu." }, 409, origin);
    }
    if (!env.RESEND_API_KEY) return json({ ok: false, error: "Resend API ključ nije podešen." }, 503, origin);
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("multipart/form-data")) return json({ ok: false, error: "Očekivan je formular za završetak isporuke." }, 415, origin);
    let form; try { form = await request.formData(); } catch { return json({ ok: false, error: "Neispravan formular." }, 400, origin); }
    if (!isBankLocalPayment(order) || order.operations.paymentStatus === "refunded") {
      return json({ ok: false, error: "Lična isporuka zahteva važeću uplatu na račun." }, 409, origin);
    }
    const verification = verifiedBankPayment(order, {
      paymentConfirmed: form.get("paymentConfirmed"),
      remittanceDate: form.get("remittanceDate"), paymentReference: form.get("paymentReference")
    });
    if (!verification.ok) return json({ ok: false, error: verification.error }, 409, origin);

    let attachment = null;
    let receiptUploaded = false;
    let receiptKey = order.receiptKey || "";
    let receiptFilename = order.receiptFilename || "";
    const receipt = form.get("receipt");
    if (receipt && typeof receipt === "object" && typeof receipt.arrayBuffer === "function" && receipt.size > 0) {
      if (receipt.size > 5 * 1024 * 1024) return json({ ok: false, error: "PDF fiskalnog računa može imati najviše 5 MB." }, 413, origin);
      const filename = safePdfFilename(receipt.name || `fiskalni-racun-${order.id}.pdf`);
      if (!filename.toLowerCase().endsWith(".pdf") || (receipt.type && receipt.type !== "application/pdf")) return json({ ok: false, error: "Fiskalni račun mora biti PDF dokument." }, 400, origin);
      const buffer = await receipt.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return json({ ok: false, error: "Dokument nema ispravan PDF format." }, 400, origin);
      if (!env.RECEIPTS) return json({ ok: false, error: "R2 skladište za fiskalne račune nije povezano." }, 503, origin);
      receiptFilename = filename;
      receiptKey = `fiscal/${order.id}/${crypto.randomUUID()}-${filename}`;
      await env.RECEIPTS.put(receiptKey, buffer, { httpMetadata: { contentType: "application/pdf", contentDisposition: `attachment; filename="${sanitizeHeaderFilename(filename)}"` }, customMetadata: { orderId: order.id } });
      receiptUploaded = true;
      attachment = { filename, content: arrayBufferToBase64(buffer) };
    }
    if (!attachment && receiptKey) {
      if (!env.RECEIPTS) return json({ ok: false, error: "R2 skladište za fiskalne račune nije povezano." }, 503, origin);
      const savedReceipt = await env.RECEIPTS.get(receiptKey);
      if (!savedReceipt) return json({ ok: false, error: "Povezani fiskalni račun nije pronađen. Dodajte PDF ponovo." }, 409, origin);
      attachment = { filename: receiptFilename || `fiskalni-racun-${order.id}.pdf`, content: arrayBufferToBase64(await savedReceipt.arrayBuffer()) };
    }

    const payload = {
      from: FROM_EMAIL,
      to: [order.customer.email],
      reply_to: BUSINESS_EMAIL,
      subject: `Porudžbina ${order.id} je lično isporučena`,
      html: localDeliveredEmailHtml(order, Boolean(attachment || receiptKey)),
      tags: [{ name: "category", value: "local_delivery_delivered" }, { name: "order_id", value: order.id }]
    };
    if (attachment) payload.attachments = [{ filename: receiptFilename, r2Key: receiptKey }];

    const now = new Date().toISOString();
    const next = { ...order.operations, ...verification.data, fulfillment: "delivered", paymentStatus: "paid", localDelivery: { ...order.operations.localDelivery, deliveredAt: now } };
    const results = await commitNotification(env, order.id, [
      env.DB.prepare(`UPDATE orders SET status='shipped', shipped_at=?, updated_at=?, courier='Lična dostava', tracking_number='LIČNO', tracking_url=NULL, receipt_key=?, receipt_filename=? WHERE id=? AND status='confirmed' AND payment=? AND EXISTS(SELECT 1 FROM order_operations WHERE order_id=orders.id AND revision=?)`).bind(now, now, receiptKey || null, receiptFilename || null, order.id, order.payment, order.operationsRevision),
      env.DB.prepare("UPDATE order_operations SET data_json=?, revision=revision+1 WHERE order_id=? AND revision=? AND changes()=1").bind(JSON.stringify(next), order.id, order.operationsRevision),
      env.DB.prepare("INSERT INTO order_events(order_id,event_type,note,created_at) SELECT ?, 'local_delivery_delivered', ?, ? WHERE changes()=1").bind(order.id, `Administrator (zajednički ključ) · Lična isporuka završena. Uplata na račun proverena: ${next.remittanceDate}; referenca: ${next.paymentReference}. Email je sačuvan za slanje.`, now)
    ], payload).catch(async error => {
      if (receiptUploaded) await env.RECEIPTS.delete(receiptKey).catch(() => {});
      throw error;
    });
    if (!results[0].meta.changes) {
      if (receiptUploaded && env.RECEIPTS) await env.RECEIPTS.delete(receiptKey).catch(() => {});
      return json({ ok: false, error: "Podaci su promenjeni. Osvežite porudžbinu." }, 409, origin);
    }
    return notificationResponse(env, order.id, origin);
  }

  if (request.method === "POST" && action === "operations") {
    if (['rejected','cancelled'].includes(order.status)) {
      return json({ok:false,error:'Operativna evidencija odbijene ili otkazane porudžbine je zaključana.'},409,origin);
    }
    let body; try { body=await request.json(); } catch { return json({ok:false,error:'Neispravan zahtev.'},400,origin); }
    const current=order.operations;
    if (!Number.isInteger(body.revision) || body.revision!==order.operationsRevision) return json({ok:false,error:'Podaci su promenjeni. Osvežite porudžbinu.'},409,origin);
    const next={...current};
    const states={fulfillment:['pending','ready','shipped','delivered','returned','failed'],paymentStatus:['unpaid','paid','refunded'],riskReview:['pending','approved','rejected']};
    for(const [key,values] of Object.entries(states)) {
      if(body[key]!==undefined) { if(!values.includes(body[key])) return json({ok:false,error:'Neispravan status.'},400,origin); next[key]=body[key]; }
    }
    const allowed={pending:['ready'],ready:['pending'],shipped:['delivered','returned','failed'],failed:['delivered','returned'],delivered:['returned'],returned:[]};
    const previous=current.fulfillment || (order.shippedAt?'shipped':'pending');
    if(next.fulfillment!==previous && !(allowed[previous]||[]).includes(next.fulfillment)) return json({ok:false,error:'Nedozvoljena promena isporuke. Slanje se evidentira kroz Predaju kuriru.'},409,origin);
    if(['new','rejected','cancelled'].includes(order.status) && next.fulfillment==='ready') return json({ok:false,error:'Prvo potvrdite porudžbinu.'},409,origin);
    if(next.paymentStatus==='refunded' && !['paid','refunded'].includes(current.paymentStatus)) return json({ok:false,error:'Refundiranje zahteva evidentiranu naplatu.'},409,origin);
    for(const [key,max] of [['internalNote',2000],['paymentReference',160],['fiscalNumber',160],['fiscalProvider',100],['fiscalReference',160]]) if(body[key]!==undefined) next[key]=clean(body[key],max);
    if(body.remittanceDate!==undefined) { if(body.remittanceDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.remittanceDate)) return json({ok:false,error:'Neispravan datum.'},400,origin); next.remittanceDate=body.remittanceDate; }
    if (isApprovedLocalDelivery(order) && next.paymentStatus === 'paid') {
      if (!isBankLocalPayment(order)) {
        if (current.paymentStatus !== 'paid') return json({ok:false,error:'Prvo izaberite uplatu na račun za ličnu dostavu.'},409,origin);
        // Keep historical paid cash records unchanged; never create a new cash collection.
      } else if (current.paymentStatus !== 'paid' || !hasVerifiedBankPayment(current) || next.remittanceDate !== current.remittanceDate || next.paymentReference !== current.paymentReference) {
        if (!['confirmed','shipped'].includes(order.status)) return json({ok:false,error:'Prvo potvrdite porudžbinu.'},409,origin);
        const verification=verifiedBankPayment(order,body);
        if(!verification.ok) return json({ok:false,error:verification.error},409,origin);
        Object.assign(next,verification.data);
      }
    }
    if (isApprovedLocalDelivery(order) && current.paymentStatus === 'paid' && next.paymentStatus === 'unpaid') {
      next.paymentMethod=''; next.paymentVerifiedAt='';
    }
    // Manual linking only: issuing fiscal documents is reserved for the provider adapter.
    next.fiscalStatus=next.fiscalNumber?'linked':'not_linked';
    const reason=clean(body.reason,500);
    if(!reason) return json({ok:false,error:'Unesite razlog izmene.'},400,origin);
    const now=new Date().toISOString();
    const changed=Object.keys(next).filter(k=>JSON.stringify(next[k])!==JSON.stringify(current[k]));
    if(!changed.length) return json({ok:true,order},200,origin);
    const note=JSON.stringify({actor:'Administrator (zajednički ključ)',reason,changes:changed.map(key=>({key,before:current[key]??'',after:next[key]}))});
    const results=await env.DB.batch([
      env.DB.prepare("UPDATE order_operations SET data_json=?,revision=revision+1 WHERE order_id=? AND revision=? AND EXISTS (SELECT 1 FROM orders WHERE id=order_operations.order_id AND status NOT IN ('rejected','cancelled'))").bind(JSON.stringify(next),order.id,body.revision),
      env.DB.prepare("INSERT INTO order_events(order_id,event_type,note,created_at) SELECT ?, 'operations', ?, ? WHERE changes()=1").bind(order.id,note,now)
    ]);
    if(!results[0].meta.changes) return json({ok:false,error:'Podaci su promenjeni. Osvežite porudžbinu.'},409,origin);
    return json({ok:true,order:await getOrderById(env.DB,order.id)},200,origin);
  }
  if (request.method === "GET" && !action) {
    if (await mmStagingEnabled(env)) order.minimax = {enabled:true,ready:mmCredentialsReady(env)};
    return json({ ok: true, order }, 200, origin);
  }

  if (request.method === "GET" && action === "receipt") {
    if (!order.receiptKey) return json({ ok: false, error: "Fiskalni račun nije dodat." }, 404, origin);
    if (!env.RECEIPTS) return json({ ok: false, error: "R2 skladište nije povezano." }, 503, origin);
    const object = await env.RECEIPTS.get(order.receiptKey);
    if (!object) return json({ ok: false, error: "Fiskalni račun nije pronađen." }, 404, origin);
    const headers = corsHeaders(origin);
    return new Response(object.body, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": object.httpMetadata?.contentType || "application/pdf",
        "Content-Disposition": `attachment; filename="${sanitizeHeaderFilename(order.receiptFilename || "fiskalni-racun.pdf")}"`,
        "Cache-Control": "no-store"
      }
    });
  }

  if (request.method === "POST" && action === "confirm") {
    if (order.status === "shipped") {
      return json({ ok: false, error: "Porudžbina je već poslata." }, 409, origin);
    }
    if (order.status === "rejected") {
      return json({ ok: false, error: "Odbijena porudžbina ne može biti potvrđena." }, 409, origin);
    }
    if (order.status === "cancelled") {
      return json({ ok: false, error: "Otkazana porudžbina ne može biti potvrđena." }, 409, origin);
    }
    if (order.status === "confirmed") {
      return notificationResponse(env, order.id, origin, true);
    }

    const attachments = [
      { path: LEGAL_NOTICE_URL, filename: "Adriatic-Trade-Obavestenje-o-prodaji-na-daljinu.pdf" },
      { path: WITHDRAWAL_FORM_URL, filename: "Adriatic-Trade-Obrazac-za-odustanak.pdf" }
    ];
    if (isApprovedLocalDelivery(order) && !isBankLocalPayment(order)) {
      return json({ ok: false, error: "Prvo izaberite IPS ili uplatu na račun. Gotovina nije dostupna za ličnu dostavu." }, 409, origin);
    }
    let qrAttached = false;
    if (order.payment === LOCAL_PAYMENT_IPS) {
      const qr = await generateIpsQr(order);
      if (qr.ok) {
        attachments.push({ filename: `IPS-${order.id}.png`, content: arrayBufferToBase64(qr.buffer) });
        qrAttached = true;
      }
    }

    const payload = {
      from: FROM_EMAIL,
      to: [order.customer.email],
      reply_to: BUSINESS_EMAIL,
      subject: `Porudžbina ${order.id} je potvrđena`,
      html: statusConfirmedEmailHtml(order, qrAttached),
      attachments,
      tags: [
        { name: "category", value: "order_confirmed" },
        { name: "order_id", value: order.id }
      ]
    };

    const now = new Date().toISOString();
    const confirmationNote = "Administrator (zajednički ključ) · Porudžbina je potvrđena i email je sačuvan za slanje." + (isBankLocalPayment(order) ? (qrAttached ? " IPS QR i instrukcije za uplatu su pripremljeni." : " Pripremljene su instrukcije za bankarski transfer bez QR priloga.") : "");
    const results = await commitNotification(env, order.id, [
      env.DB.prepare("UPDATE orders SET status = 'confirmed', confirmed_at = ?, updated_at = ? WHERE id = ? AND status='new' AND payment=? AND total=?")
        .bind(now, now, order.id, order.payment, order.total),
      env.DB.prepare("INSERT INTO order_events(order_id,event_type,note,created_at) SELECT ?, 'confirmed', ?, ? WHERE changes()=1")
        .bind(order.id, confirmationNote, now)
    ], payload);
    if (!results[0].meta.changes) return json({ ok: false, error: "Porudžbina je u međuvremenu promenjena. Osvežite prikaz." }, 409, origin);
    return notificationResponse(env, order.id, origin);
  }

  if (request.method === "POST" && action === "reject") {
    if (order.status === "rejected") {
      return notificationResponse(env, order.id, origin, true);
    }
    if (order.status !== "new") {
      return json({ ok: false, error: "Samo nova porudžbina može biti odbijena." }, 409, origin);
    }

    const decision = await readDecisionReason(request);
    if (!decision.ok) return json({ ok: false, error: decision.error }, 400, origin);

    const payload = {
      from: FROM_EMAIL,
      to: [order.customer.email],
      reply_to: BUSINESS_EMAIL,
      subject: `Porudžbina ${order.id} nije potvrđena`,
      html: statusRejectedEmailHtml(order, decision.data),
      tags: [
        { name: "category", value: "order_rejected" },
        { name: "order_id", value: order.id }
      ]
    };
    const now = new Date().toISOString();
    const results = await commitNotification(env, order.id, [
      env.DB.prepare("UPDATE orders SET status=?, updated_at=? WHERE id=? AND status=? AND payment=? AND total=?")
        .bind("rejected", now, order.id, "new", order.payment, order.total),
      env.DB.prepare("INSERT INTO order_events(order_id,event_type,note,created_at) SELECT ?, ?, ?, ? WHERE changes()=1")
        .bind(order.id, "rejected", decisionEventNote("Porudžbina je odbijena", decision.data), now)
    ], payload);
    if (!results[0].meta.changes) return json({ ok: false, error: "Podaci su promenjeni. Osvežite porudžbinu." }, 409, origin);
    return notificationResponse(env, order.id, origin);
  }

  if (request.method === "POST" && action === "cancel") {
    if (order.status === "cancelled") {
      return notificationResponse(env, order.id, origin, true);
    }
    if (order.status === "shipped") {
      return json({ ok: false, error: "Poslata porudžbina ne može biti otkazana iz ovog panela." }, 409, origin);
    }
    if (order.status !== "confirmed") {
      return json({ ok: false, error: "Samo potvrđena, a neposlata porudžbina može biti otkazana." }, 409, origin);
    }

    const decision = await readDecisionReason(request);
    if (!decision.ok) return json({ ok: false, error: decision.error }, 400, origin);

    const payload = {
      from: FROM_EMAIL,
      to: [order.customer.email],
      reply_to: BUSINESS_EMAIL,
      subject: `Porudžbina ${order.id} je otkazana`,
      html: statusCancelledEmailHtml(order, decision.data),
      tags: [
        { name: "category", value: "order_cancelled" },
        { name: "order_id", value: order.id }
      ]
    };
    const now = new Date().toISOString();
    const results = await commitNotification(env, order.id, [
      env.DB.prepare("UPDATE orders SET status=?, updated_at=? WHERE id=? AND status=? AND payment=? AND total=?")
        .bind("cancelled", now, order.id, "confirmed", order.payment, order.total),
      env.DB.prepare("INSERT INTO order_events(order_id,event_type,note,created_at) SELECT ?, ?, ?, ? WHERE changes()=1")
        .bind(order.id, "cancelled", decisionEventNote("Porudžbina je otkazana", decision.data), now)
    ], payload);
    if (!results[0].meta.changes) return json({ ok: false, error: "Podaci su promenjeni. Osvežite porudžbinu." }, 409, origin);
    return notificationResponse(env, order.id, origin);
  }

  if (request.method === "POST" && action === "ship") {
    if (isApprovedLocalDelivery(order)) return json({ ok: false, error: "Lična dostava se završava kroz proveru uplate i ličnu isporuku." }, 409, origin);
    if (order.status === "shipped") {
      return notificationResponse(env, order.id, origin, true);
    }
    if (order.status !== "confirmed") {
      return json({ ok: false, error: "Prvo potvrdite porudžbinu." }, 409, origin);
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return json({ ok: false, error: "Očekivan je formular za slanje porudžbine." }, 415, origin);
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ ok: false, error: "Neispravan formular." }, 400, origin);
    }

    const courier = clean(form.get("courier"), 80);
    const trackingNumber = clean(form.get("trackingNumber"), 100);
    const trackingUrl = clean(form.get("trackingUrl"), 500);
    const receipt = form.get("receipt");

    if (!courier) return json({ ok: false, error: "Unesite kurirsku službu." }, 400, origin);
    if (!trackingNumber) return json({ ok: false, error: "Unesite broj pošiljke." }, 400, origin);
    if (trackingUrl && !/^https:\/\//i.test(trackingUrl)) {
      return json({ ok: false, error: "Link za praćenje mora početi sa https://" }, 400, origin);
    }

    let attachment = null;
    let receiptUploaded = false;
    let receiptKey = order.receiptKey || "";
    let receiptFilename = order.receiptFilename || "";

    if (receipt && typeof receipt === "object" && typeof receipt.arrayBuffer === "function" && receipt.size > 0) {
      if (receipt.size > 5 * 1024 * 1024) {
        return json({ ok: false, error: "PDF fiskalnog računa može imati najviše 5 MB." }, 413, origin);
      }
      const filename = safePdfFilename(receipt.name || `fiskalni-racun-${order.id}.pdf`);
      if (!filename.toLowerCase().endsWith(".pdf") || (receipt.type && receipt.type !== "application/pdf")) {
        return json({ ok: false, error: "Fiskalni račun mora biti PDF dokument." }, 400, origin);
      }

      const buffer = await receipt.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
        return json({ ok: false, error: "Dokument nema ispravan PDF format." }, 400, origin);
      }

      receiptFilename = filename;
      receiptKey = `fiscal/${order.id}/${crypto.randomUUID()}-${filename}`;
      if (!env.RECEIPTS) {
        return json({ ok: false, error: "R2 skladište za fiskalne račune nije povezano." }, 503, origin);
      }
      await env.RECEIPTS.put(receiptKey, buffer, {
        httpMetadata: {
          contentType: "application/pdf",
          contentDisposition: `attachment; filename="${sanitizeHeaderFilename(filename)}"`
        },
        customMetadata: { orderId: order.id }
      });
      receiptUploaded = true;
      attachment = { filename, content: arrayBufferToBase64(buffer) };
    }

    if (!attachment && receiptKey) {
      if (!env.RECEIPTS) return json({ ok: false, error: "R2 skladište nije povezano." }, 503, origin);
      const saved = await env.RECEIPTS.get(receiptKey);
      if (!saved) return json({ ok: false, error: "Povezani fiskalni račun nije pronađen." }, 409, origin);
      attachment = { filename: receiptFilename };
    }
    const shippedHtml = statusShippedEmailHtml(order, { courier, trackingNumber, trackingUrl, hasReceipt: Boolean(attachment || receiptKey) });
    const payload = {
      from: FROM_EMAIL,
      to: [order.customer.email],
      reply_to: BUSINESS_EMAIL,
      subject: `Porudžbina ${order.id} je poslata`,
      html: shippedHtml,
      tags: [
        { name: "category", value: "order_shipped" },
        { name: "order_id", value: order.id }
      ]
    };
    if (attachment) payload.attachments = [{ filename: receiptFilename, r2Key: receiptKey }];
    const now = new Date().toISOString();
    const results = await commitNotification(env, order.id, [
      env.DB.prepare(`UPDATE orders SET status='shipped', shipped_at=?, updated_at=?, courier=?, tracking_number=?, tracking_url=?, receipt_key=?, receipt_filename=?
        WHERE id=? AND status='confirmed' AND NOT EXISTS(SELECT 1 FROM order_events WHERE order_id=orders.id AND event_type='local_delivery_approved')`)
        .bind(now, now, courier, trackingNumber, trackingUrl || null, receiptKey || null, receiptFilename || null, order.id),
      env.DB.prepare("INSERT INTO order_events(order_id,event_type,note,created_at) SELECT ?, 'shipped', ?, ? WHERE changes()=1")
        .bind(order.id, `Porudžbina je poslata: ${courier}, broj pošiljke ${trackingNumber}. Email je sačuvan za slanje.`, now)
    ], payload).catch(async error => {
      if (receiptUploaded) await env.RECEIPTS.delete(receiptKey).catch(() => {});
      throw error;
    });
    if (!results[0].meta.changes) {
      if (receiptUploaded) await env.RECEIPTS.delete(receiptKey).catch(() => {});
      return json({ ok: false, error: "Podaci su promenjeni. Osvežite porudžbinu." }, 409, origin);
    }
    return notificationResponse(env, order.id, origin);
  }

  return json({ ok: false, error: "Method not allowed" }, 405, origin);
}

async function ensureNotificationSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS notification_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT, operation_key TEXT NOT NULL UNIQUE,
    order_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', payload_json TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}', attempts INTEGER NOT NULL DEFAULT 0,
    first_attempt_at INTEGER, next_attempt_at INTEGER NOT NULL DEFAULT 0,
    lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0, last_error TEXT,
    created_at TEXT NOT NULL, sent_at TEXT
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_notification_due ON notification_outbox(status,next_attempt_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_notification_order ON notification_outbox(order_id,id)').run();
}

// State, audit event and notification snapshot commit in the same D1 transaction.
// Caller statements propagate changes()=1, so a conflict never queues an email.
async function commitNotification(env, orderId, statements, payload, metadata = {}) {
  if (payload) {
    statements.push(env.DB.prepare(`INSERT INTO notification_outbox(operation_key,order_id,payload_json,metadata_json,created_at)
      SELECT ?,?,?,?,? WHERE changes()=1`).bind(`admin-email/${crypto.randomUUID()}`, orderId,
      JSON.stringify(payload), JSON.stringify(metadata), new Date().toISOString()));
  }
  return env.DB.batch(statements);
}

async function notificationResponse(env, orderId, origin, alreadyDone = false) {
  // A delivery outage is distinct from a saved order change. Never ask the operator
  // to repeat the state change or delete a persisted receipt after a send failure.
  try { await flushNotificationOutbox(env, orderId, true); }
  catch (error) { console.error('Saved notification retry failed', error.message); }
  const order = await getOrderById(env.DB, orderId);
  const emailPending = order.notifications.length > 0;
  return json({ ok: true, order, alreadyDone, emailPending,
    ...(emailPending ? { warning: 'Izmena je sačuvana. Email čeka slanje; proverite obaveštenja porudžbine.' } : {})
  }, 200, origin);
}

async function flushNotificationOutbox(env, orderId = null, force = false) {
  if (!env.DB) return;
  await ensureNotificationSchema(env.DB);
  const now = Date.now();
  // Resend idempotency lasts 24 h. Do not risk automatic duplicate delivery after
  // that window if the provider accepted a message but the acknowledgement was lost.
  await env.DB.prepare(`UPDATE notification_outbox SET status='attention', lease_token=NULL, lease_until=0,
    last_error='Potrebna provera u email servisu pre ponovnog slanja.'
    WHERE status IN ('pending','sending') AND first_attempt_at IS NOT NULL AND first_attempt_at<=? AND lease_until<=?`)
    .bind(now-23*60*60*1000, now).run();
  const visited = [];
  for (let count = 0; count < 10; count++) {
    const job = await env.DB.prepare(`SELECT * FROM notification_outbox
    WHERE (status='pending' OR (status='sending' AND lease_until<=?))
      AND (? IS NULL OR order_id=?) AND (?=1 OR next_attempt_at<=?)
      AND id NOT IN(SELECT value FROM json_each(?))
      AND NOT EXISTS(SELECT 1 FROM notification_outbox earlier WHERE earlier.order_id=notification_outbox.order_id
        AND earlier.id<notification_outbox.id AND earlier.status!='sent') ORDER BY id LIMIT 1`)
      .bind(now, orderId, orderId, force ? 1 : 0, now, JSON.stringify(visited)).first();
    if (!job) break;
    visited.push(job.id);
    const token = crypto.randomUUID(), claimedAt = Date.now();
    const claimed = await env.DB.prepare(`UPDATE notification_outbox SET status='sending', lease_token=?, lease_until=?,
      attempts=attempts+1, first_attempt_at=COALESCE(first_attempt_at,?)
      WHERE id=? AND (status='pending' OR (status='sending' AND lease_until<=?))
      AND NOT EXISTS(SELECT 1 FROM notification_outbox earlier WHERE earlier.order_id=notification_outbox.order_id
        AND earlier.id<notification_outbox.id AND earlier.status!='sent')`)
      .bind(token, claimedAt+90000, claimedAt, job.id, claimedAt).run();
    if (!claimed.meta.changes) continue;
    const claimedJob = await env.DB.prepare("SELECT attempts FROM notification_outbox WHERE id=? AND lease_token=?").bind(job.id, token).first();
    if (!claimedJob) continue;
    try {
      const payload = JSON.parse(job.payload_json);
      if (payload.attachments) payload.attachments = await Promise.all(payload.attachments.map(async attachment => {
        if (!attachment.r2Key) return attachment;
        const object = await env.RECEIPTS?.get(attachment.r2Key);
        if (!object) throw new Error('Fiskalni PDF nije dostupan za slanje.');
        return { filename: attachment.filename, content: arrayBufferToBase64(await object.arrayBuffer()) };
      }));
      if (!env.RESEND_API_KEY) throw new Error('Resend API ključ nije podešen.');
      const result = await sendEmail(env.RESEND_API_KEY, payload, job.operation_key);
      if (!result.ok) throw new Error(`Email servis HTTP ${result.status}.`);
      const sentAt = new Date().toISOString(), metadata = JSON.parse(job.metadata_json);
      const statements = [
        env.DB.prepare("UPDATE notification_outbox SET status='sent', sent_at=?, lease_token=NULL, lease_until=0, last_error=NULL, payload_json='{}' WHERE id=? AND lease_token=?")
          .bind(sentAt, job.id, token),
        env.DB.prepare("INSERT INTO order_events(order_id,event_type,note,created_at) SELECT ?, 'email_sent', ?, ? WHERE changes()=1")
          .bind(job.order_id, `Email servis je prihvatio obaveštenje: ${payload.subject}`, sentAt)
      ];
      if (metadata.schedule) {
        const schedule = metadata.schedule;
        statements.push(env.DB.prepare(`UPDATE order_operations SET data_json=json_set(data_json,'$.localDelivery.notifiedAt',?)
          WHERE order_id=? AND json_extract(data_json,'$.localDelivery.date')=?
          AND json_extract(data_json,'$.localDelivery.timeWindow')=? AND json_extract(data_json,'$.localDelivery.location')=?
          AND EXISTS(SELECT 1 FROM notification_outbox WHERE id=? AND status='sent' AND sent_at=?)`)
          .bind(sentAt, job.order_id, schedule.date, schedule.timeWindow, schedule.location, job.id, sentAt));
      }
      await env.DB.batch(statements);
    } catch (error) {
      const attempts = claimedJob.attempts;
      await env.DB.prepare(`UPDATE notification_outbox SET status=?, next_attempt_at=?, lease_token=NULL, lease_until=0, last_error=?
        WHERE id=? AND lease_token=?`).bind(attempts >= 8 ? 'attention' : 'pending', Date.now()+Math.min(3600000,60000*2**attempts),
          clean(error.message,200), job.id, token).run();
    }
  }
}

function isAdminAuthorized(request, env) {
  const expected = String(env.ADMIN_TOKEN || "");
  const auth = request.headers.get("Authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return expected.length >= 24 && constantTimeEqual(provided, expected);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function orderInsertStatement(db, order) {
  const now = order.createdAt;
  return db.prepare(`INSERT INTO orders (
    id, submission_id, created_at, updated_at, status,
    customer_first_name, customer_last_name, customer_email, customer_phone,
    delivery_method, address, postal_code, city, note, payment,
    items_json, goods_total, shipping, total, business_email_sent, customer_email_sent
  ) VALUES (?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`)
    .bind(
      order.id, order.submissionId, now, now,
      order.customer.firstName, order.customer.lastName, order.customer.email, order.customer.phone,
      order.delivery.method, order.delivery.address || null, order.delivery.postalCode, order.delivery.city,
      order.delivery.note || null, order.payment,
      JSON.stringify(order.items), order.goodsTotal, order.shipping, order.total
    );
}

async function insertOrder(db, order) {
  await orderInsertStatement(db, order).run();
}

// Bundles consume the same physical units as individual products. Never accept
// browser-supplied bundle contents or stock quantities.
const BUNDLE_COMPONENTS = {
  "PKT-PROBA": {"10086":1,"10306":1,"10307":1},
  "PKT-GURMAN": {"10240":1,"10306":1,"10307":1,"10086":1},
  "PKT-KOMPLET": {"10240":1,"10012":1,"10086":1}
};

const PHYSICAL_SKUS = Object.keys(PRODUCTS).filter(sku=>!Object.hasOwn(BUNDLE_COMPONENTS,sku));
const MAX_QUOTA = 10000;
const MAX_QUOTA_INCREASE = 100;

// One SQLite statement supplies a coherent snapshot even while orders arrive.
// Missing migration/control/gate is an error, never an implicit open state.
async function availabilitySnapshot(db) {
  const row=await db.prepare(`SELECT revision,
    (SELECT mode FROM checkout_intake WHERE id=1) mode,
    (SELECT json_group_array(json_object('sku',sku,'state',state,'remaining',remaining,'updatedAt',updated_at,'reason',reason)) FROM checkout_stock) stock,
    (SELECT json_group_array(json_object('operationId',operation_id,'action',action,'sku',sku,'before',json(before_json),'after',json(after_json),'reason',reason,'actor',actor,'createdAt',created_at))
      FROM (SELECT * FROM checkout_control_events ORDER BY created_at DESC,operation_id DESC LIMIT 20)) history
    FROM checkout_control WHERE id=1`).first();
  if (!row || !Number.isSafeInteger(row.revision) || !['paused','open'].includes(row.mode)) throw Error('Availability control missing');
  const stock=new Map(JSON.parse(row.stock).map(p=>[p.sku,p]));
  const products=PHYSICAL_SKUS.map(sku=>({sku,name:PRODUCTS[sku].name,...(stock.get(sku)||{state:'unknown',remaining:null,updatedAt:null,reason:''})}));
  const confirmed=p=>['available','unavailable'].includes(p.state)&&Number.isSafeInteger(p.remaining)&&p.remaining>=0&&p.remaining<=MAX_QUOTA;
  const bundles=Object.entries(BUNDLE_COMPONENTS).map(([sku,components])=>{
    const parts=Object.entries(components).map(([part,units])=>({product:products.find(p=>p.sku===part),units}));
    return {sku,name:PRODUCTS[sku].name,components,remaining:parts.every(({product})=>confirmed(product))
      ?Math.min(...parts.map(({product,units})=>product.state==='available'?Math.floor(product.remaining/units):0)):null};
  });
  return {revision:row.revision,mode:row.mode,products,bundles,history:JSON.parse(row.history),
    canOpen:products.every(confirmed)&&products.some(p=>p.state==='available'&&p.remaining>0),
    limits:{maxQuota:MAX_QUOTA,maxIncrease:MAX_QUOTA_INCREASE}};
}

async function availabilityHash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}

async function handleAvailability(request, env, origin) {
  const fail=(message,status=400,code='INVALID_AVAILABILITY_CHANGE')=>json({ok:false,code,error:message},status,origin);
  if (!['GET','POST'].includes(request.method)) return fail('Metod nije dozvoljen.',405);
  let snapshot;
  try {snapshot=await availabilitySnapshot(env.DB);} catch {return fail('Kontrola dostupnosti nije spremna. Potrebna je odobrena migracija; prodaja se ne otvara kroz ovaj panel.',503,'AVAILABILITY_NOT_READY');}
  if (request.method==='GET') return json({ok:true,...snapshot},200,origin);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||'')) return fail('Očekivan je JSON zahtev.',415);
  let b;try {b=await readInquiryBody(request,4096);}catch(error){return fail(error.message==='large'?'Zahtev je prevelik.':'Neispravan JSON.',error.message==='large'?413:400);}
  const allowed=['operationId','revision','action','sku','quantity','reason','confirmed','confirmation','increaseConfirmed','readinessConfirmed'];
  if (!b || Array.isArray(b) || typeof b!=='object' || Object.keys(b).some(k=>!allowed.includes(k))) return fail('Nepoznata polja zahteva.');
  if (typeof b.operationId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(b.operationId)||!Number.isSafeInteger(b.revision)||b.revision<0||
    !['pause','open','quantity'].includes(b.action)||typeof b.reason!=='string'||b.reason.trim().length<5||b.reason.length>500||b.confirmed!==true) return fail('Potvrdite promenu i unesite razlog (5–500 znakova).');
  const reason=b.reason.trim();
  if (b.action==='quantity') {
    if (!PHYSICAL_SKUS.includes(b.sku)||!Number.isSafeInteger(b.quantity)||b.quantity<0||b.quantity>MAX_QUOTA) return fail('Izaberite fizički proizvod i ceo broj od 0 do '+MAX_QUOTA+'.');
  } else if (b.sku!==undefined||b.quantity!==undefined) return fail('Status prodaje ne menja količine.');
  // Hash the complete canonical request. Replaying the same operation is safe,
  // while reusing its ID with different content is always a conflict.
  const canonical=JSON.stringify(Object.fromEntries(allowed.map(k=>[k,b[k]]).filter(([,v])=>v!==undefined)));
  const hash=await availabilityHash(canonical);
  const previous=()=>env.DB.prepare('SELECT request_hash FROM checkout_control_events WHERE operation_id=?').bind(b.operationId).first();
  const replay=async old=>old.request_hash===hash?json({ok:true,duplicate:true,operationId:b.operationId},200,origin):fail('Oznaka zahteva je već iskorišćena za drugu promenu.',409,'OPERATION_CONFLICT');
  const old=await previous();if (old) return replay(old);
  if (snapshot.revision!==b.revision) return fail('Podaci su promenjeni. Osvežite pregled i ponovo proverite količine.',409,'STALE_AVAILABILITY');
  let before,after;
  if (b.action==='quantity') {
    const p=snapshot.products.find(p=>p.sku===b.sku);
    before={state:p.state,remaining:p.remaining};after={state:b.quantity>0?'available':'unavailable',remaining:b.quantity};
    const increase=b.quantity-(p.state==='available'&&Number.isSafeInteger(p.remaining)?p.remaining:0);
    if (increase>MAX_QUOTA_INCREASE) return fail('Najveće povećanje po potvrdi je '+MAX_QUOTA_INCREASE+' komada. Za veće izdvajanje potrebna je posebna operativna provera.');
    if (increase>0&&(b.increaseConfirmed!==true||b.confirmation!==`${b.sku} ${b.quantity}`)) return fail('Potvrdite fizički proverenu slobodnu količinu i upišite SKU i novu kvotu.');
    if (before.state===after.state&&before.remaining===after.remaining) return fail('Količina je već evidentirana.');
  } else {
    before={mode:snapshot.mode};after={mode:b.action==='open'?'open':'paused'};
    if (before.mode===after.mode) return fail('Prodaja je već u izabranom statusu.');
    if (b.action==='open'&&(!snapshot.canOpen||b.readinessConfirmed!==true||b.confirmation!=='OTVORI PRODAJU')) return fail('Otvaranje zahteva svih pet potvrđenih kvota, raspoloživu robu i izričitu potvrdu operativne spremnosti.');
  }
  const now=new Date().toISOString();
  const actor='admin-key:'+(await availabilityHash(env.ADMIN_TOKEN)).slice(0,12);
  const guard=env.DB.prepare(`INSERT INTO checkout_control_events(operation_id,request_hash,action,sku,revision_before,before_json,after_json,reason,actor,created_at,applied)
    VALUES (?,?,?,?,?,?,?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM checkout_control WHERE id=1 AND revision=?)
      AND EXISTS(SELECT 1 FROM checkout_intake WHERE id=1) THEN 1 ELSE 0 END)`)
    .bind(b.operationId,hash,b.action,b.sku||null,b.revision,JSON.stringify(before),JSON.stringify(after),reason,actor,now,b.revision);
  const update=b.action==='quantity'
    ?env.DB.prepare(`INSERT INTO checkout_stock(sku,state,remaining,updated_at,reason) VALUES (?,?,?,?,?)
      ON CONFLICT(sku) DO UPDATE SET state=excluded.state,remaining=excluded.remaining,updated_at=excluded.updated_at,reason=excluded.reason`)
      .bind(b.sku,after.state,after.remaining,now,reason)
    :env.DB.prepare('UPDATE checkout_intake SET mode=?,updated_at=?,reason=? WHERE id=1').bind(after.mode,now,reason);
  try {await env.DB.batch([guard,update]);}
  catch {
    // Also recovers a successful commit whose response was lost.
    const existing=await previous();if (existing) return replay(existing);
    const current=await availabilitySnapshot(env.DB);
    if (current.revision!==b.revision) return fail('Podaci su promenjeni tokom čuvanja. Osvežite pregled i proverite promenu.',409,'STALE_AVAILABILITY');
    return fail('Promena nije potvrđena. Ponovite isti zahtev; ne pravite novu korekciju.',503,'AVAILABILITY_WRITE_FAILED');
  }
  return json({ok:true,duplicate:false,operationId:b.operationId},200,origin);
}

function stockRequirements(items) {
  const required = new Map();
  for (const {sku,qty} of items) {
    for (const [component,units] of Object.entries(Object.hasOwn(BUNDLE_COMPONENTS,sku) ? BUNDLE_COMPONENTS[sku] : {[sku]:1})) {
      required.set(component, (required.get(component) || 0) + qty * units);
    }
  }
  return [...required].sort(([a],[b])=>a.localeCompare(b)).map(([sku,qty])=>({sku,qty}));
}

function orderRequestKey(order) {
  const c=order.customer,d=order.delivery;
  return JSON.stringify([c.firstName,c.lastName,c.email,c.phone,d.method,d.address||"",d.postalCode,d.city,d.note||"",
    order.items.map(({sku,qty})=>[sku,qty]).sort(([a],[b])=>a.localeCompare(b))]);
}

function intakeError(origin) {
  return json({ok:false,code:"INTAKE_UNAVAILABLE",error:"Prijem novih porudžbina trenutno nije dostupan. Za pomoć koristite kontakt podatke na sajtu."},503,origin);
}

// This diagnostic read is only for the response message after a failed batch.
// Admission itself always evaluates the conditions inside the write transaction.
async function orderAvailability(db, items) {
  const gate=await db.prepare("SELECT mode FROM checkout_intake WHERE id=1").first();
  if (gate?.mode !== "open") return {status:503,body:{code:"SALES_PAUSED",error:"Internet prodaja je privremeno pauzirana. Kontakt i poslovni upiti su dostupni."}};
  const rows=await db.prepare("SELECT sku,state,remaining FROM checkout_stock").all();
  const bySku=new Map((rows.results||[]).map(row=>[row.sku,row]));
  for (const {sku,qty} of stockRequirements(items)) {
    const row=bySku.get(sku);
    if (!row || row.state==="unknown" || row.remaining===null) return {status:503,body:{code:"STOCK_UNKNOWN",error:"Raspoloživost jednog ili više proizvoda trenutno nije potvrđena. Pokušajte kasnije ili nas kontaktirajte."}};
    if (row.state!=="available" || row.remaining<qty) return {status:409,body:{code:"PRODUCT_UNAVAILABLE",error:"Jedan ili više proizvoda nisu dostupni u traženoj količini. Izmenite korpu ili nas kontaktirajte."}};
  }
  return null;
}

async function admitOrder(db, order) {
  const required=stockRequirements(order.items), requirements=JSON.stringify(required);
  // The CHECK guard forces a rollback, rather than silently skipping the insert.
  // D1 batch serializes all checks, quota debits, order and audit inserts. A UNIQUE
  // submission_id failure rolls back every debit, including simultaneous retries.
  const guard=db.prepare(`INSERT INTO checkout_admissions(submission_id,requirements_json,created_at,admitted)
    VALUES (?,?,?,CASE WHEN EXISTS(SELECT 1 FROM checkout_intake WHERE id=1 AND mode='open')
      AND NOT EXISTS(SELECT 1 FROM json_each(?) r LEFT JOIN checkout_stock s ON s.sku=json_extract(r.value,'$.sku')
        WHERE s.sku IS NULL OR s.state!='available' OR s.remaining IS NULL OR s.remaining<json_extract(r.value,'$.qty'))
      THEN 1 ELSE 0 END)`).bind(order.submissionId,requirements,order.createdAt,requirements);
  const statements=[guard,
    ...required.map(({sku,qty})=>db.prepare("UPDATE checkout_stock SET remaining=remaining-?,updated_at=? WHERE sku=?").bind(qty,order.createdAt,sku)),
    orderInsertStatement(db,order),
    db.prepare("INSERT INTO order_events(order_id,event_type,note,created_at) VALUES (?,'created',?,?)")
      .bind(order.id,"Porudžbina primljena uz serversku proveru i izdvajanje prodajne kvote.",order.createdAt)
  ];
  if (order.securityFlags?.length) statements.push(db.prepare("INSERT INTO order_events(order_id,event_type,note,created_at) VALUES (?,'security_flag',?,?)")
    .bind(order.id,`Bezbednosni signal: ${order.securityFlags.join("; ")}`,order.createdAt));
  await db.batch(statements);
}

// Replays always use the accepted snapshot, including its prices and package
// contents. No retry re-debits quotas or rebuilds a previously accepted order.
async function acceptOrder(db, order, beforeAdmission=async()=>{}) {
  let existing = await getOrderBySubmissionId(db, order.submissionId);
  if (!existing) {
    await beforeAdmission();
    try { await admitOrder(db, order); }
    catch (error) {
      existing = await getOrderBySubmissionId(db, order.submissionId);
      if (!existing) {
        const rejection = await orderAvailability(db, order.items);
        if (rejection) return {rejection};
        throw error;
      }
    }
  }
  if (existing && orderRequestKey(existing) !== orderRequestKey(order)) return {rejection:{status:409,body:{
    code:'SUBMISSION_CONFLICT',error:'Porudžbina sa ovim identifikatorom već postoji sa drugim podacima. Kontaktirajte nas radi provere.'}}};
  return {order:existing||order,duplicate:Boolean(existing)};
}

async function getOrderBySubmissionId(db, submissionId) {
  const row = await db.prepare("SELECT * FROM orders WHERE submission_id = ? LIMIT 1").bind(submissionId).first();
  return row ? rowToOrder(row) : null;
}

async function getOrderById(db, id) {
  const row = await db.prepare("SELECT * FROM orders WHERE id = ? LIMIT 1").bind(id).first();
  if (!row) return null;
  await db.prepare("INSERT OR IGNORE INTO order_operations(order_id) VALUES (?)").bind(id).run();
  const operations=await db.prepare('SELECT data_json,revision FROM order_operations WHERE order_id=?').bind(id).first();
  row.operations_json=operations?.data_json;
  const order = rowToOrder(row);
  order.operationsRevision=operations?.revision || 0;
  const events = await db.prepare("SELECT event_type, note, created_at FROM order_events WHERE order_id = ? ORDER BY id ASC").bind(id).all();
  order.events = events.results || [];
  await ensureNotificationSchema(db);
  const notifications = await db.prepare("SELECT id, status, attempts, last_error FROM notification_outbox WHERE order_id=? AND status!='sent' ORDER BY id").bind(id).all();
  order.notifications = notifications.results || [];
  if (isApprovedLocalDelivery(order)) order.bankTransfer = bankTransferDetails(order);
  return order;
}

function rowToOrder(row) {
  let items = [];
  try { items = JSON.parse(row.items_json || "[]"); } catch { items = []; }
  let operations={}; try { operations=JSON.parse(row.operations_json || '{}'); } catch {}
  operations={fulfillment:row.shipped_at?'shipped':'pending',paymentStatus:'unpaid',riskReview:'pending',...operations};
  if(row.shipped_at && ['pending','ready'].includes(operations.fulfillment)) operations.fulfillment='shipped';
  return {
    operations, securityFlagged:Boolean(row.security_flagged),
    id: row.id,
    submissionId: row.submission_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    customer: {
      firstName: row.customer_first_name,
      lastName: row.customer_last_name,
      email: row.customer_email,
      phone: row.customer_phone
    },
    delivery: {
      method: row.delivery_method,
      address: row.address || "",
      postalCode: row.postal_code,
      city: row.city,
      note: row.note || ""
    },
    items,
    goodsTotal: Number(row.goods_total || 0),
    shipping: Number(row.shipping || 0),
    total: Number(row.total || 0),
    payment: row.payment,
    businessEmailSent: Number(row.business_email_sent || 0),
    customerEmailSent: Number(row.customer_email_sent || 0),
    confirmedAt: row.confirmed_at || "",
    shippedAt: row.shipped_at || "",
    courier: row.courier || "",
    trackingNumber: row.tracking_number || "",
    trackingUrl: row.tracking_url || "",
    receiptKey: row.receipt_key || "",
    receiptFilename: row.receipt_filename || ""
  };
}

async function addOrderEvent(db, orderId, eventType, note) {
  try {
    await db.prepare("INSERT INTO order_events (order_id, event_type, note, created_at) VALUES (?, ?, ?, ?)")
      .bind(orderId, eventType, (eventType === "security_flag" || eventType === "created" ? note : "Administrator (zajednički ključ) · " + (note || "")) || null, new Date().toISOString()).run();
  } catch (error) {
    console.error("Unable to write order event", error);
  }
}

async function safeDbUpdate(db, sql, params) {
  if (!db) return;
  try { await db.prepare(sql).bind(...params).run(); } catch (error) { console.error("D1 update failed", error); }
}

function statusConfirmedEmailHtml(order, qrAttached = false) {
  const rows = customerOrderRows(order);
  const paymentNotice = isBankLocalPayment(order)
    ? `<div style="margin-top:18px;padding:16px 18px;background:#eef5f8;border:1px solid #d9e7ec;border-radius:12px;color:#40545f;font-size:14px;line-height:1.6;">
        <strong>Uplata na račun za besplatnu ličnu dostavu</strong>
        ${qrAttached ? `<p>U prilogu je PNG slika NBS IPS QR koda. Skenirajte je ili je uvezite iz galerije u aplikaciji svoje banke.</p>` : order.payment === LOCAL_PAYMENT_IPS ? `<p>IPS QR trenutno nije dostupan. Uplatu izvršite običnim bankarskim transferom prema sledećim instrukcijama.</p>` : ""}
        ${bankTransferEmailHtml(order)}
      </div>`
    : `<div style="margin-top:18px;padding:16px 18px;background:#f7f5f0;border-radius:12px;color:#4f5c65;font-size:14px;line-height:1.6;">Obavestićemo vas čim pošiljku preuzme kurirska služba. Plaćanje ostaje <strong>pouzećem</strong>.</div>`;
  return emailShell(`
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b69a69;font-weight:700;">Porudžbina je potvrđena</div>
    <h1 style="font-size:25px;line-height:1.22;margin:8px 0 10px;color:#10283d;">Vaša porudžbina je potvrđena.</h1>
    <p style="margin:0 0 22px;color:#4f5c65;font-size:15px;line-height:1.65;">Hvala, ${escapeHtml(order.customer.firstName)}. Porudžbina <strong>${escapeHtml(order.id)}</strong> je potvrđena i pripremamo je za slanje.</p>

    ${summaryTable(rows, order)}

    ${customerDeliveryBlock(order)}

    ${paymentNotice}
    <div style="margin-top:16px;padding:16px 18px;background:#eef5f8;border:1px solid #d9e7ec;border-radius:12px;color:#40545f;font-size:13px;line-height:1.6;">
      <strong style="display:block;color:#10283d;margin-bottom:4px;">Dokumentacija za kupovinu na daljinu</strong>
      U prilogu ovog emaila dostavljamo <strong>Obaveštenje o uslovima prodaje na daljinu</strong> i propisani <strong>Obrazac za odustanak od ugovora</strong>. Sačuvajte ih zajedno sa ovom potvrdom porudžbine.
    </div>
    <p style="margin:22px 0 0;color:#69747c;font-size:13px;line-height:1.6;">Ako imate pitanje, odgovorite na ovaj email ili pišite na <a href="mailto:${BUSINESS_EMAIL}" style="color:#0e3f67;">${BUSINESS_EMAIL}</a>.</p>
  `);
}

function statusShippedEmailHtml(order, shipment) {
  const rows = customerOrderRows(order);
  const tracking = shipment.trackingUrl
    ? `<a href="${escapeHtml(shipment.trackingUrl)}" style="display:inline-block;margin-top:14px;padding:11px 18px;border-radius:999px;background:#10283d;color:#ffffff;text-decoration:none;font-weight:700;">Prati pošiljku</a>`
    : "";
  const receiptText = shipment.hasReceipt
    ? `<p style="margin:18px 0 0;color:#4f5c65;font-size:13px;line-height:1.6;"><strong>Fiskalni račun je u prilogu ovog emaila.</strong></p>`
    : "";

  return emailShell(`
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b69a69;font-weight:700;">Porudžbina je poslata</div>
    <h1 style="font-size:25px;line-height:1.22;margin:8px 0 10px;color:#10283d;">Vaša porudžbina je na putu.</h1>
    <p style="margin:0 0 22px;color:#4f5c65;font-size:15px;line-height:1.65;">Hvala, ${escapeHtml(order.customer.firstName)}. Pošiljku za porudžbinu <strong>${escapeHtml(order.id)}</strong> preuzela je kurirska služba.</p>
    <div style="padding:18px 20px;background:#f7f5f0;border-radius:12px;color:#4f5c65;font-size:14px;line-height:1.65;">
      <strong style="color:#10283d;">Kurirska služba:</strong> ${escapeHtml(shipment.courier)}<br>
      <strong style="color:#10283d;">Broj pošiljke:</strong> ${escapeHtml(shipment.trackingNumber)}<br>
      <strong style="color:#10283d;">Plaćanje:</strong> ${escapeHtml(order.payment || "Pouzećem")}
      ${tracking}
    </div>

    <div style="margin:24px 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8b7650;font-weight:700;">Pregled poslate porudžbine</div>
    ${summaryTable(rows, order)}

    ${customerDeliveryBlock(order)}
    ${receiptText}
    <p style="margin:22px 0 0;color:#69747c;font-size:13px;line-height:1.6;">Za pitanja u vezi sa porudžbinom odgovorite na ovaj email ili pišite na <a href="mailto:${BUSINESS_EMAIL}" style="color:#0e3f67;">${BUSINESS_EMAIL}</a>.</p>
  `);
}

function formatLocalDeliveryDate(value) {
  try {
    return new Intl.DateTimeFormat("sr-RS", { timeZone: "Europe/Belgrade", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00+02:00`));
  } catch { return value; }
}

function localScheduleEmailHtml(order, schedule) {
  return emailShell(`
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b69a69;font-weight:700;">Lična isporuka</div>
    <h1 style="font-size:25px;line-height:1.22;margin:8px 0 10px;color:#10283d;">Termin isporuke je dogovoren.</h1>
    <p style="margin:0 0 20px;color:#4f5c65;font-size:15px;line-height:1.65;">Zdravo, ${escapeHtml(order.customer.firstName)}. Za porudžbinu <strong>${escapeHtml(order.id)}</strong> evidentirali smo sledeći dogovor:</p>
    <div style="padding:18px 20px;background:#f7f5f0;border-radius:12px;color:#4f5c65;font-size:14px;line-height:1.75;">
      <strong style="color:#10283d;">Datum:</strong> ${escapeHtml(formatLocalDeliveryDate(schedule.date))}<br>
      <strong style="color:#10283d;">Vreme:</strong> ${escapeHtml(schedule.timeWindow)}<br>
      <strong style="color:#10283d;">Mesto:</strong> ${escapeHtml(schedule.location)}<br>
      <strong style="color:#10283d;">Plaćanje:</strong> ${escapeHtml(order.payment)}
    </div>
    ${isBankLocalPayment(order) ? bankTransferEmailHtml(order) : ""}
    <p style="margin:20px 0 0;color:#69747c;font-size:13px;line-height:1.6;">Ako je potrebna promena, odgovorite na ovaj email ili pozovite broj naveden u kontaktima prodavca.</p>
  `);
}

function localDeliveredEmailHtml(order, hasReceipt) {
  return emailShell(`
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#5b8f3e;font-weight:700;">Lično isporučeno</div>
    <h1 style="font-size:25px;line-height:1.22;margin:8px 0 10px;color:#10283d;">Porudžbina je uspešno isporučena.</h1>
    <p style="margin:0 0 20px;color:#4f5c65;font-size:15px;line-height:1.65;">Hvala, ${escapeHtml(order.customer.firstName)}. Evidentirali smo da je porudžbina <strong>${escapeHtml(order.id)}</strong> lično preuzeta i plaćena.</p>
    ${summaryTable(customerOrderRows(order), order)}
    ${hasReceipt ? `<p style="margin:18px 0 0;color:#4f5c65;font-size:13px;line-height:1.6;"><strong>Fiskalni račun je u prilogu ovog emaila.</strong></p>` : ""}
    <p style="margin:20px 0 0;color:#69747c;font-size:13px;line-height:1.6;">Za pitanja odgovorite na ovaj email ili pišite na <a href="mailto:${BUSINESS_EMAIL}" style="color:#0e3f67;">${BUSINESS_EMAIL}</a>.</p>
  `);
}

const DECISION_REASONS = {
  unavailable: "Proizvod trenutno nije dostupan",
  delivery: "Isporuka na navedenu adresu ili lokaciju nije moguća",
  invalid: "Podaci porudžbine nisu potpuni ili ispravni",
  duplicate: "Dupla ili test porudžbina",
  customer_request: "Na zahtev kupca",
  other: "Drugo"
};

async function readDecisionReason(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return { ok: false, error: "Očekivan je JSON sa razlogom." };
  }
  let body;
  try { body = await request.json(); } catch { return { ok: false, error: "Neispravan JSON." }; }
  const code = clean(body?.reasonCode, 40).toLowerCase();
  const note = clean(body?.note, 500);
  if (!DECISION_REASONS[code]) return { ok: false, error: "Izaberite razlog." };
  if (code === "other" && !note) return { ok: false, error: "Za opciju 'Drugo' unesite kratku napomenu." };
  return { ok: true, data: { code, label: DECISION_REASONS[code], note } };
}

function decisionEventNote(prefix, decision) {
  return `${prefix}. Razlog: ${decision.label}${decision.note ? `. Napomena: ${decision.note}` : "."}`;
}

function decisionReasonBlock(decision) {
  return `<div style="margin:18px 0;padding:16px 18px;background:#fff6f3;border:1px solid #efd7d0;border-radius:12px;color:#594841;font-size:14px;line-height:1.6;">
    <strong style="display:block;color:#8a382e;margin-bottom:4px;">Razlog</strong>
    ${escapeHtml(decision.label)}${decision.note ? `<br><span style="color:#6c5e58;">${escapeHtml(decision.note)}</span>` : ""}
  </div>`;
}

function statusRejectedEmailHtml(order, decision) {
  const rows = customerOrderRows(order);
  return emailShell(`
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b06b60;font-weight:700;">Porudžbina nije potvrđena</div>
    <h1 style="font-size:25px;line-height:1.22;margin:8px 0 10px;color:#10283d;">Nismo u mogućnosti da potvrdimo ovu porudžbinu.</h1>
    <p style="margin:0 0 16px;color:#4f5c65;font-size:15px;line-height:1.65;">Hvala, ${escapeHtml(order.customer.firstName)}. Porudžbina <strong>${escapeHtml(order.id)}</strong> nije potvrđena.</p>
    ${decisionReasonBlock(decision)}
    <div style="margin:24px 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8b7650;font-weight:700;">Pregled porudžbine</div>
    ${summaryTable(rows, order)}
    ${order.payment && order.payment.toLowerCase().includes("pouze") ? `<div style="margin-top:18px;padding:15px 17px;background:#f7f5f0;border-radius:12px;color:#4f5c65;font-size:13px;line-height:1.6;">Plaćanje je bilo predviđeno <strong>pouzećem</strong>, zato po ovoj porudžbini nije izvršena naplata.</div>` : ""}
    <p style="margin:22px 0 0;color:#69747c;font-size:13px;line-height:1.6;">Ako imate pitanje ili želite da proverimo drugu opciju, odgovorite na ovaj email ili pišite na <a href="mailto:${BUSINESS_EMAIL}" style="color:#0e3f67;">${BUSINESS_EMAIL}</a>.</p>
  `);
}

function statusCancelledEmailHtml(order, decision) {
  const rows = customerOrderRows(order);
  return emailShell(`
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b06b60;font-weight:700;">Porudžbina je otkazana</div>
    <h1 style="font-size:25px;line-height:1.22;margin:8px 0 10px;color:#10283d;">Vaša porudžbina je otkazana pre slanja.</h1>
    <p style="margin:0 0 16px;color:#4f5c65;font-size:15px;line-height:1.65;">Porudžbina <strong>${escapeHtml(order.id)}</strong> više neće biti poslata.</p>
    ${decisionReasonBlock(decision)}
    <div style="margin:24px 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8b7650;font-weight:700;">Pregled otkazane porudžbine</div>
    ${summaryTable(rows, order)}
    ${order.payment && order.payment.toLowerCase().includes("pouze") ? `<div style="margin-top:18px;padding:15px 17px;background:#f7f5f0;border-radius:12px;color:#4f5c65;font-size:13px;line-height:1.6;">Plaćanje je bilo predviđeno <strong>pouzećem</strong>, zato po ovoj porudžbini nije izvršena naplata.</div>` : ""}
    <p style="margin:22px 0 0;color:#69747c;font-size:13px;line-height:1.6;">Za dodatne informacije odgovorite na ovaj email ili pišite na <a href="mailto:${BUSINESS_EMAIL}" style="color:#0e3f67;">${BUSINESS_EMAIL}</a>.</p>
  `);
}

function customerOrderRows(order) {
  return order.items.map(item => {
    const extraDetail = item.sku.startsWith("PKT-") && item.detail
      ? `<br><span style="display:block;margin-top:4px;color:#7a858d;font-size:12px;line-height:1.45;">${escapeHtml(item.detail)}</span>`
      : "";

    return `
    <tr>
      <td style="padding:13px 6px;border-bottom:1px solid #e8e3d8;vertical-align:top;line-height:1.35;">
        <strong style="display:block;color:#243746;font-size:14px;line-height:1.35;font-weight:700;">${escapeHtml(item.name)}</strong>${extraDetail}
      </td>
      <td width="40" style="padding:13px 4px;border-bottom:1px solid #e8e3d8;text-align:center;vertical-align:top;font-size:14px;line-height:1.35;">${item.qty}</td>
      <td width="88" style="padding:13px 4px 13px 8px;border-bottom:1px solid #e8e3d8;text-align:right;white-space:nowrap;vertical-align:top;font-size:14px;line-height:1.35;">${formatRsd(item.lineTotal)}</td>
    </tr>`;
  }).join("");
}

function customerDeliveryBlock(order) {
  const deliveryText = order.delivery.method === "Dostava na adresu"
    ? `${escapeHtml(order.delivery.address)}, ${escapeHtml(order.delivery.postalCode)} ${escapeHtml(order.delivery.city)}`
    : `Paketomat · ${escapeHtml(order.delivery.postalCode)} ${escapeHtml(order.delivery.city)}. Kurirska služba može poslati SMS/Viber poruku ili link za izbor dostupne lokacije.`;

  return `
    <div style="margin-top:20px;padding:16px 18px;background:#fbfaf7;border:1px solid #e8e3d8;border-radius:12px;color:#4f5c65;font-size:14px;line-height:1.6;">
      <strong style="display:block;margin-bottom:4px;color:#10283d;">Isporuka: ${escapeHtml(order.delivery.method)}</strong>
      ${deliveryText}<br>
      <strong style="color:#10283d;">Plaćanje:</strong> ${escapeHtml(order.payment || "Pouzećem")}
    </div>`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function isApprovedLocalDelivery(order) {
  return order.delivery.method === "Dostava na adresu"
    && normalizePlace(order.delivery.city) === "novi sad"
    && order.shipping === 0
    && (order.events || []).some(event => event.event_type === "local_delivery_approved");
}

function isBankLocalPayment(order) {
  return [LOCAL_PAYMENT_IPS, LOCAL_PAYMENT_BANK].includes(order.payment);
}

function bankTransferDetails(order) {
  const fields = ipsFields(order);
  return { account: fields.R, payee: fields.N.replace(/\r?\n/g, ", "), amount: Number(order.total),
    currency: "RSD", model: fields.RO.slice(0, 2), reference: fields.RO.slice(2), purpose: fields.S, paymentCode: fields.SF };
}

function bankTransferEmailHtml(order) {
  const b = bankTransferDetails(order);
  return `<div style="margin-top:14px;line-height:1.7;">${[
    ["Primalac", b.payee], ["Račun", b.account], ["Iznos", formatRsd(b.amount)],
    ["Šifra plaćanja", b.paymentCode], ["Model", b.model], ["Poziv na broj", b.reference], ["Svrha", b.purpose]
  ].map(([label, value]) => `<div><strong>${label}:</strong> ${escapeHtml(value)}</div>`).join("")}
  <p>Robu predajemo nakon provere evidentirane uplate na računu firme. Potvrda porudžbine ili generisanje QR koda ne znači da je uplata primljena.</p></div>`;
}

function hasVerifiedBankPayment(operations) {
  return operations.paymentStatus === "paid" && operations.paymentMethod === "bank_transfer"
    && Boolean(operations.paymentVerifiedAt && operations.remittanceDate && operations.paymentReference);
}

function verifiedBankPayment(order, body) {
  if (hasVerifiedBankPayment(order.operations)
      && (body.remittanceDate == null || body.remittanceDate === order.operations.remittanceDate)
      && (body.paymentReference == null || body.paymentReference === order.operations.paymentReference)) return { ok: true, data: {} };
  const remittanceDate = clean(body.remittanceDate, 10), paymentReference = clean(body.paymentReference, 160);
  if (body.paymentConfirmed !== "yes") return { ok: false, error: "Prvo proverite uplatu na računu firme i potvrdite da je evidentirana." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(remittanceDate) || !Number.isFinite(Date.parse(remittanceDate))
      || new Date(remittanceDate).toISOString().slice(0,10) !== remittanceDate || remittanceDate > belgradeDateKey() || !paymentReference) {
    return { ok: false, error: "Unesite važeći datum uplate na račun i referencu sa bankarskog izvoda." };
  }
  return { ok: true, data: { remittanceDate, paymentReference, paymentMethod: "bank_transfer", paymentVerifiedAt: new Date().toISOString() } };
}

function ipsReference(orderId) {
  const digits = String(orderId || "").replace(/\D/g, "");
  if (digits) return `00${digits.slice(-18)}`;
  let hash = 2166136261;
  for (const char of String(orderId || "")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return `00${String(hash).padStart(10, "0")}`;
}

function ipsFields(order) {
  return {
    K: "PR",
    V: "01",
    C: "1",
    R: IPS_ACCOUNT,
    N: IPS_PAYEE,
    I: `RSD${Number(order.total || 0).toFixed(2).replace(".", ",")}`,
    SF: "289",
    S: `PORUDZBINA ${String(order.id || "").slice(-23)}`.slice(0, 35),
    RO: ipsReference(order.id)
  };
}

async function generateIpsQr(order) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IPS_TIMEOUT_MS);
  try {
    const response = await fetch(IPS_GENERATOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "image/png" },
      signal: controller.signal,
      body: JSON.stringify(ipsFields(order))
    });
    const contentType = response.headers.get("Content-Type") || "";
    if (!response.ok || !contentType.toLowerCase().includes("image/png")) {
      console.error("NBS IPS QR generation failed", response.status, await response.text().catch(() => ""));
      return { ok: false };
    }
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 8 || ![137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value)) return { ok: false };
    return { ok: true, buffer };
  } catch (error) {
    console.error("NBS IPS QR generation failed", error);
    return { ok: false };
  } finally { clearTimeout(timeout); }
}

function safePdfFilename(name) {
  const cleaned = String(name || "fiskalni-racun.pdf")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "fiskalni-racun"}.pdf`;
}

function sanitizeHeaderFilename(name) {
  return String(name || "fiskalni-racun.pdf").replace(/["\\\r\n]/g, "-").slice(0, 140);
}



// Contact/B2B use the existing D1 + Resend services, separately from order state.
const INQUIRY_DAY = 24 * 60 * 60 * 1000;
function inquiryReady(env) {
  return Boolean(env.DB && env.RESEND_API_KEY && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY && env.SECURITY_PEPPER);
}
async function ensureInquirySchema(db) {
  // Deliberately not cached globally: different test/staging bindings remain isolated.
  await db.prepare(`CREATE TABLE IF NOT EXISTS inquiry_outbox (
    id TEXT PRIMARY KEY, submission_hash TEXT NOT NULL UNIQUE, content_hash TEXT UNIQUE,
    ip_hash TEXT, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL, first_attempt_at INTEGER, next_attempt_at INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0, lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_inquiry_ip ON inquiry_outbox(ip_hash,created_at)').run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS inquiry_attempts (
    ip_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL
  )`).run();
}
async function pruneInquiries(db, now = Date.now()) {
  await db.prepare("UPDATE inquiry_outbox SET payload_json='{}', content_hash=NULL, ip_hash=NULL, status=CASE WHEN status='sent' THEN 'sent' ELSE 'attention' END WHERE created_at<=?")
    .bind(now-INQUIRY_DAY).run();
  await db.prepare('DELETE FROM inquiry_outbox WHERE created_at<?').bind(now-7*INQUIRY_DAY).run();
  await db.prepare('DELETE FROM inquiry_attempts WHERE window_start<?').bind(now-INQUIRY_DAY).run();
}
async function inquirySignature(value, pepper) {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
}
async function inquiryTicket(env) {
  const value = `${Date.now()}.${crypto.randomUUID()}`;
  return `${value}.${await inquirySignature('inquiry-ticket/'+value, env.SECURITY_PEPPER)}`;
}
async function validInquiryTicket(env, ticket) {
  if (typeof ticket !== 'string' || !/^\d{13}\.[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(ticket)) return false;
  const [time, nonce, signature] = ticket.split('.');
  const age = Date.now()-Number(time);
  return age>=800 && age<INQUIRY_DAY && constantTimeEqual(signature,
    await inquirySignature(`inquiry-ticket/${time}.${nonce}`, env.SECURITY_PEPPER));
}
function validateInquiry(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const {type, fields, submissionId} = body;
  if (!['contact','b2b'].includes(type) || typeof submissionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId || '')) return null;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields) || fields.Saglasnost !== 'Da') return null;
  const limits = {Ime:120,email:160,Telefon:60,Poruka:5000,...(type==='b2b'?{Kompanija:160,'Tip saradnje':60}:{})};
  if (Object.keys(fields).some(key=>!Object.hasOwn(limits,key) && key!=='Saglasnost')) return null;
  const data = {};
  for (const [key,max] of Object.entries(limits)) {
    const value = fields[key] ?? '';
    if (typeof value !== 'string' || value.length>max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) return null;
    if (key!=='Poruka' && /[\r\n]/.test(value)) return null;
    data[key] = value.trim();
  }
  if (!data.Ime || !data.Poruka || !isEmail(data.email) || /[<>(),;:\"\[\]\\]/.test(data.email) || (type==='b2b' && !data.Kompanija)) return null;
  if (type==='b2b' && !['Maloprodaja','HoReCa','Specijalizovana prodavnica','Veleprodaja','Drugo'].includes(data['Tip saradnje'])) return null;
  data.email = data.email.toLowerCase();
  data.Saglasnost = 'Da';
  return {type,fields:data,submissionId:submissionId.toLowerCase()};
}
async function readInquiryBody(request, maxBytes=20000) {
  // Bound actual streamed bytes even without Content-Length (chunked requests).
  if (Number(request.headers.get('Content-Length'))>maxBytes) throw new Error('large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('json');
  let bytes = 0; const chunks = [];
  try {
    for (;;) {
      const {done,value} = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes>maxBytes) { await reader.cancel(); throw new Error('large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { merged.set(chunk,offset); offset+=chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(merged));
}
async function handleInquiry(request, env, origin, ctx) {
  const unavailable = () => json({ok:false,error:'Prijem upita trenutno nije dostupan. Pokušajte kasnije ili pišite na info@adriatictrade.rs.'},503,origin);
  if (!ALLOWED_ORIGINS.has(origin)) return json({ok:false,error:'Origin not allowed'},403,origin);
  if (!inquiryReady(env)) return unavailable();
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||'')) return json({ok:false,error:'Expected application/json'},415,origin);
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return unavailable(); // Never fail open when the rate limiter is unavailable.
  try {
    await ensureInquirySchema(env.DB);
    await pruneInquiries(env.DB);
    const now = Date.now(), ipHash = await securityHash('inquiry-ip/'+ip,env.SECURITY_PEPPER);
    // One serialized write; shared by contact and B2B, before Siteverify costs.
    const attempt = await env.DB.prepare(`INSERT INTO inquiry_attempts(ip_hash,window_start,count) VALUES(?,?,1)
      ON CONFLICT(ip_hash) DO UPDATE SET
        count=CASE WHEN window_start<=? THEN 1 ELSE count+1 END,
        window_start=CASE WHEN window_start<=? THEN excluded.window_start ELSE window_start END
      WHERE window_start<=? OR count<20`).bind(ipHash,now,now-600000,now-600000,now-600000).run();
    if (!attempt.meta.changes) return json({ok:false,error:'Previše pokušaja. Sačekajte 10 minuta ili nas kontaktirajte emailom.'},429,origin,{'Retry-After':'600'});
    let body;
    try { body = await readInquiryBody(request); }
    catch (error) { return json({ok:false,error:'Neispravni podaci upita.'},error.message==='large'?413:400,origin); }
    const data = validateInquiry(body);
    if (!data || body.security?.website !== '' || !await validInquiryTicket(env,body.security?.ticket)) {
      return json({ok:false,error:'Proverite obavezna polja i saglasnost. Ako je stranica dugo otvorena, osvežite je.'},400,origin);
    }
    const token = body.security?.turnstileToken;
    if (typeof token !== 'string' || !token || token.length>2048) return json({ok:false,error:'Ponovite bezbednosnu proveru.'},403,origin);
    const verified = await verifyTurnstile(request,env,token,`inquiry_${data.type}`,true);
    if (!verified.ok) return json({ok:false,error:'Bezbednosna provera nije uspela. Pokušajte ponovo.'},verified.status||403,origin);
    const submissionHash = await securityHash('inquiry-id/'+data.submissionId,env.SECURITY_PEPPER);
    const contentHash = await securityHash(JSON.stringify({type:data.type,fields:data.fields}),env.SECURITY_PEPPER);
    const previous = await env.DB.prepare('SELECT id,content_hash,status FROM inquiry_outbox WHERE submission_hash=?').bind(submissionHash).first();
    if (previous && previous.content_hash!==contentHash) return json({ok:false,error:'Ovaj pokušaj je već zabeležen. Osvežite stranicu za izmenjeni upit.'},409,origin);
    let row = previous || await env.DB.prepare('SELECT id,status FROM inquiry_outbox WHERE content_hash=?').bind(contentHash).first();
    if (!row) {
      const id = crypto.randomUUID();
      const payload = {from:FROM_EMAIL,to:[BUSINESS_EMAIL],reply_to:data.fields.email,
        subject:`${data.type==='b2b'?'B2B upit':'Kontakt'} sa adriatictrade.rs [${id}]`,
        text:Object.entries(data.fields).map(([key,value])=>`${key}: ${value}`).join('\n\n')};
      // Atomic rate admission + queue insert; UNIQUE constraints serialize duplicates.
      await env.DB.prepare(`INSERT OR IGNORE INTO inquiry_outbox(id,submission_hash,content_hash,ip_hash,payload_json,created_at)
        SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM inquiry_outbox WHERE ip_hash=? AND created_at>=?)<5`)
        .bind(id,submissionHash,contentHash,ipHash,JSON.stringify(payload),now,ipHash,now-3600000).run();
      row = await env.DB.prepare('SELECT id,status FROM inquiry_outbox WHERE content_hash=?').bind(contentHash).first();
      if (!row) {
        const conflict = await env.DB.prepare('SELECT id FROM inquiry_outbox WHERE submission_hash=?').bind(submissionHash).first();
        if (conflict) return json({ok:false,error:'Identifikator je već upotrebljen za drugi upit.'},409,origin);
        return json({ok:false,error:'Previše upita sa ove mreže. Pokušajte za sat vremena ili pišite na info@adriatictrade.rs.'},429,origin,{'Retry-After':'3600'});
      }
    }
    if (row.status==='attention') return unavailable();
    // Acceptance means durable receipt, not a promise of inbox delivery.
    if (ctx?.waitUntil) ctx.waitUntil(flushInquiryOutbox(env,row.id).catch(()=>console.error('Inquiry delivery deferred')));
    return json({ok:true,accepted:true,delivery:row.status==='sent'?'sent':'pending'},row.status==='sent'?200:202,origin);
  } catch {
    // Do not log request bodies, email addresses, IPs, tokens or provider errors.
    console.error('Inquiry service unavailable');
    return unavailable();
  }
}
async function flushInquiryOutbox(env, onlyId = null) {
  if (!env.DB) return;
  await ensureInquirySchema(env.DB);
  await pruneInquiries(env.DB);
  // Leave time before Resend's 24 h idempotency expiry, including request timeout.
  await env.DB.prepare(`UPDATE inquiry_outbox SET status='attention',lease_token=NULL,lease_until=0
    WHERE status IN ('pending','sending') AND first_attempt_at<=? AND lease_until<=?`)
    .bind(Date.now()-23*3600000,Date.now()).run();
  const jobs = await env.DB.prepare(`SELECT * FROM inquiry_outbox
    WHERE (status='pending' OR (status='sending' AND lease_until<=?))
      AND next_attempt_at<=? AND (? IS NULL OR id=?) ORDER BY created_at LIMIT 10`)
    .bind(Date.now(),Date.now(),onlyId,onlyId).all();
  for (const job of jobs.results) {
    const now = Date.now(), lease = crypto.randomUUID();
    const claimed = await env.DB.prepare(`UPDATE inquiry_outbox SET status='sending',lease_token=?,lease_until=?,
      first_attempt_at=COALESCE(first_attempt_at,?),attempts=attempts+1
      WHERE id=? AND created_at>? AND (first_attempt_at IS NULL OR first_attempt_at>?) AND next_attempt_at<=?
      AND (status='pending' OR (status='sending' AND lease_until<=?))`)
      .bind(lease,now+90000,now,job.id,now-INQUIRY_DAY,now-23*3600000,now,now).run();
    if (!claimed.meta.changes) continue;
    let sent = false;
    try {
      if (env.RESEND_API_KEY) {
        const result = await sendEmail(env.RESEND_API_KEY,JSON.parse(job.payload_json),`inquiry/${job.id}`);
        sent = result.ok && typeof result.data?.id==='string' && Boolean(result.data.id);
      }
    } catch { /* Preserve the same payload/key on an ambiguous failure. */ }
    await env.DB.prepare(`UPDATE inquiry_outbox SET status=?,payload_json=CASE WHEN ?=1 THEN '{}' ELSE payload_json END,
      next_attempt_at=?,lease_token=NULL,lease_until=0 WHERE id=? AND lease_token=?`)
      .bind(sent?'sent':'pending',sent?1:0,Date.now()+Math.min(3600000,60000*2**Math.min(job.attempts+1,6)),job.id,lease).run();
  }
}

async function ensureSecuritySchema(db) {
  if (!db || securitySchemaReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS security_order_attempts (
    ip_hash TEXT NOT NULL,
    submission_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(ip_hash, submission_hash)
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_security_order_attempts_ip_time ON security_order_attempts (ip_hash, created_at)").run();
  securitySchemaReady = true;
}

async function enforceOrderRateLimit(request, env, submissionId) {
  if (!env.DB) {
    console.warn("Rate limit degraded: D1 unavailable");
    return { ok: true, degraded: true };
  }
  const ip = clean(request.headers.get("CF-Connecting-IP"), 80);
  if (!ip) {
    console.warn("Rate limit degraded: CF-Connecting-IP unavailable");
    return { ok: true, degraded: true };
  }
  try {
    await ensureSecuritySchema(env.DB);
    const pepper = String(env.SECURITY_PEPPER || "");
    if (!pepper) console.warn("SECURITY_PEPPER is missing; IP is still SHA-256 hashed but not peppered");
    const ipHash = await securityHash(ip, pepper);
    const submissionHash = await securityHash(submissionId, pepper);
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    await env.DB.prepare("DELETE FROM security_order_attempts WHERE created_at < ?")
      .bind(now - 7 * 24 * 60 * 60 * 1000).run();
    const existing = await env.DB.prepare("SELECT 1 AS present FROM security_order_attempts WHERE ip_hash = ? AND submission_hash = ? LIMIT 1")
      .bind(ipHash, submissionHash).first();
    if (existing?.present) return { ok: true, duplicateAttempt: true };
    // A single SQLite write serializes concurrent requests. COUNT then INSERT
    // could let several different submissions pass the last available slot.
    const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO security_order_attempts (ip_hash, submission_hash, created_at)
      SELECT ?,?,? WHERE (SELECT COUNT(*) FROM security_order_attempts WHERE ip_hash=? AND created_at>=?) < ?`)
      .bind(ipHash, submissionHash, now, ipHash, cutoff, RATE_LIMIT_MAX).run();
    if (inserted.meta.changes) return { ok: true };
    const duplicate = await env.DB.prepare("SELECT 1 AS present FROM security_order_attempts WHERE ip_hash=? AND submission_hash=?")
      .bind(ipHash, submissionHash).first();
    return duplicate?.present ? { ok: true, duplicateAttempt: true } : { ok: false };
  } catch (error) {
    console.error("Rate limit check failed; Turnstile remains enforced", error);
    return { ok: true, degraded: true };
  }
}

async function securityHash(value, pepper = "") {
  const bytes = new TextEncoder().encode(`${pepper}|${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(request, env, rawToken, expectedAction = TURNSTILE_ACTION, bounded = false) {
  const secret = clean(env.TURNSTILE_SECRET_KEY, 200);
  if (!secret) return {ok:false,status:503};
  const token = clean(rawToken, 2048);
  if (!token) return {ok:false,status:403};
  const remoteip = clean(request.headers.get("CF-Connecting-IP"), 80);
  const controller = bounded ? new AbortController() : null;
  const timer = bounded ? setTimeout(() => controller.abort(),8000) : null;
  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: remoteip || undefined }),
      ...(controller ? {signal:controller.signal} : {})
    });
    if (!response.ok) return {ok:false,status:503};
    let result = null;
    try { result = await response.json(); } catch { return {ok:false,status:503}; }
    if (result?.success !== true || result.action !== expectedAction ||
        !ALLOWED_TURNSTILE_HOSTS.has(String(result.hostname || "").toLowerCase())) {
      return {ok:false,status:403};
    }
    return {ok:true};
  } catch {
    // Provider errors may contain request details; never log tokens or addresses.
    console.error("Turnstile verification unavailable");
    return {ok:false,status:503};
  } finally { if (timer !== null) clearTimeout(timer); }
}

function commonEmailTypoSuggestion(email) {
  const parts = String(email || "").split("@");
  if (parts.length !== 2) return "";
  const corrected = COMMON_EMAIL_DOMAIN_TYPOS[parts[1].toLowerCase()];
  return corrected ? `${parts[0]}@${corrected}` : "";
}

function getClientRiskFlags(email, startedAt) {
  const flags = [];
  const domain = String(email || "").split("@")[1]?.toLowerCase() || "";
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) flags.push("privremeni/disposable email domen");
  const started = Number(startedAt);
  if (Number.isFinite(started) && started > 0) {
    const age = Date.now() - started;
    if (age >= 0 && age < MIN_FORM_AGE_MS) flags.push("izuzetno brzo popunjavanje checkout forme");
  } else {
    flags.push("nedostaje vreme početka checkout forme");
  }
  return flags;
}

async function getVelocityRiskFlags(db, email, phone) {
  const flags = [];
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const emailRow = await db.prepare("SELECT COUNT(*) AS count FROM orders WHERE customer_email = ? AND created_at >= ?")
      .bind(email, since).first();
    if (Number(emailRow?.count || 0) >= 2) flags.push("više porudžbina sa istog emaila u poslednja 24 sata");
    const phoneRow = await db.prepare("SELECT COUNT(*) AS count FROM orders WHERE customer_phone = ? AND created_at >= ?")
      .bind(phone, since).first();
    if (Number(phoneRow?.count || 0) >= 2) flags.push("više porudžbina sa istog telefona u poslednja 24 sata");
  } catch (error) {
    console.error("Unable to calculate order velocity flags", error);
  }
  return flags;
}

function securityRiskBlock(flags) {
  if (!Array.isArray(flags) || !flags.length) return "";
  return `<div style="margin:0 0 20px;padding:14px 16px;background:#fff4e5;border:1px solid #efd4a7;border-radius:12px;color:#6b4b18;font-size:13px;line-height:1.55;">
    <strong style="display:block;margin-bottom:4px;">⚠ Proverite porudžbinu pre potvrde</strong>
    ${escapeHtml(flags.join("; "))}
  </div>`;
}

function validateOrder(body) {
  const firstName = clean(body?.customer?.firstName, 60);
  const lastName = clean(body?.customer?.lastName, 80);
  const email = clean(body?.customer?.email, 160).toLowerCase();
  const phone = clean(body?.customer?.phone, 40);
  const submissionId = clean(body?.submissionId, 80);

  if (!/^[A-Za-z0-9._:-]{12,80}$/.test(submissionId)) return fail("Nedostaje identifikator porudžbine.");
  if (!firstName || !lastName) return fail("Unesite ime i prezime.");
  if (!isEmail(email)) return fail("Unesite ispravnu email adresu.");
  const emailSuggestion = commonEmailTypoSuggestion(email);
  if (emailSuggestion) return fail(`Proverite email adresu. Da li ste mislili ${emailSuggestion}?`);
  if (!phone || phone.replace(/\D/g, "").length < 8) return fail("Unesite ispravan telefon.");

  const method = clean(body?.delivery?.method, 40);
  if (!['Dostava na adresu', 'Paketomat'].includes(method)) {
    return fail("Izaberite način isporuke.");
  }

  const address = clean(body?.delivery?.address, 140);
  const postalCode = clean(body?.delivery?.postalCode, 10);
  const city = clean(body?.delivery?.city, 80);
  const note = clean(body?.delivery?.note, 500);

  if (method === 'Dostava na adresu' && !address) return fail("Unesite adresu dostave.");
  if (!/^\d{5}$/.test(postalCode)) return fail("Poštanski broj mora imati 5 cifara.");
  if (!city) return fail("Unesite mesto.");

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > MAX_ITEMS) {
    return fail("Korpa nije ispravna.");
  }

  const merged = new Map();
  for (const raw of body.items) {
    const sku = clean(raw?.sku, 30);
    const qty = Number(raw?.qty);
    if (!Object.hasOwn(PRODUCTS,sku)) return fail("Korpa sadrži nepoznat proizvod.");
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) return fail("Količina proizvoda nije ispravna.");
    merged.set(sku, (merged.get(sku) || 0) + qty);
  }

  for (const qty of merged.values()) {
    if (qty > 10) return fail("Količina proizvoda nije ispravna.");
  }

  const items = [...merged.entries()].map(([sku, qty]) => ({ sku, qty }));

  if (items.reduce((sum, x) => sum + x.qty, 0) > 30) return fail("Porudžbina sadrži previše stavki.");

  return {
    ok: true,
    data: {
      submissionId,
      customer: { firstName, lastName, email, phone },
      delivery: { method, address, postalCode, city, note },
      items
    }
  };
}

function buildOrder(data) {
  const items = data.items.map(({ sku, qty }) => {
    const p = PRODUCTS[sku];
    const unitPrice = currentProductPrice(sku);
    return {
      sku,
      qty,
      name: p.name,
      detail: p.detail,
      unitPrice,
      lineTotal: unitPrice * qty,
      ...(Object.hasOwn(BUNDLE_COMPONENTS,sku) ? {packageVersion:'v1',bundleComponents:Object.entries(BUNDLE_COMPONENTS[sku]).map(([component,units])=>({sku:component,units,referenceUnitPrice:PRODUCTS[component].price}))} : {})
    };
  });

  const goodsTotal = items.reduce((sum, x) => sum + x.lineTotal, 0);
  const shipping = goodsTotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE;

  return {
    id: makeOrderId(data.submissionId),
    submissionId: data.submissionId,
    createdAt: new Date().toISOString(),
    customer: data.customer,
    delivery: data.delivery,
    items,
    goodsTotal,
    shipping,
    total: goodsTotal + shipping,
    payment: "Pouzećem"
  };
}

async function sendEmail(apiKey, payload, idempotencyKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: controller.signal,
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json",
        "User-Agent": "AdriaticTradeOrders/1.0", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: { error: controller.signal.aborted ? "Email timeout" : "Email network error" } };
  } finally { clearTimeout(timer); }
}

function businessEmailHtml(order) {
  const rows = order.items.map(item => `
    <tr>
      <td style="padding:12px 8px;border-bottom:1px solid #e8e3d8;vertical-align:top;">
        <strong>${escapeHtml(item.name)}</strong><br>
        <span style="color:#6c6c6c;font-size:13px;">SKU ${escapeHtml(item.sku)}${item.detail ? ' · ' + escapeHtml(item.detail) : ''}</span>
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid #e8e3d8;text-align:center;vertical-align:top;">${item.qty}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #e8e3d8;text-align:right;white-space:nowrap;vertical-align:top;">${formatRsd(item.lineTotal)}</td>
    </tr>`).join("");

  return emailShell(`
    <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8b7650;font-weight:700;">Nova porudžbina</div>
    <h1 style="font-size:26px;line-height:1.2;margin:8px 0 4px;color:#10283d;">${escapeHtml(order.id)}</h1>
    <p style="margin:0 0 24px;color:#69747c;">Web porudžbina · plaćanje pouzećem</p>
    ${securityRiskBlock(order.securityFlags)}

    ${summaryTable(rows, order)}

    <div style="margin-top:24px;padding:18px;background:#f7f5f0;border-radius:12px;">
      <h2 style="font-size:16px;line-height:1.3;margin:0 0 14px;color:#10283d;">Kupac i isporuka</h2>
      ${infoBlock("Ime i prezime", `${order.customer.firstName} ${order.customer.lastName}`)}
      ${infoBlock("Email", order.customer.email, `mailto:${order.customer.email}`)}
      ${infoBlock("Telefon", order.customer.phone, `tel:${order.customer.phone.replace(/\s+/g, '')}`)}
      ${infoBlock("Način isporuke", order.delivery.method)}
      ${order.delivery.method === 'Dostava na adresu' ? infoBlock("Adresa", order.delivery.address) : ''}
      ${infoBlock("Mesto", `${order.delivery.postalCode} ${order.delivery.city}`)}
      ${infoBlock("Napomena", order.delivery.note || "—")}
      ${infoBlock("Plaćanje", order.payment)}
    </div>

    <p style="margin:18px 0 0;color:#69747c;font-size:12px;line-height:1.55;">Odgovorom na ovaj email direktno odgovarate kupcu.</p>
  `);
}

function customerEmailHtml(order) {
  const rows = order.items.map(item => {
    const extraDetail = item.sku.startsWith("PKT-") && item.detail
      ? `<br><span style="display:block;margin-top:4px;color:#7a858d;font-size:12px;line-height:1.45;">${escapeHtml(item.detail)}</span>`
      : "";

    return `
    <tr>
      <td style="padding:13px 6px;border-bottom:1px solid #e8e3d8;vertical-align:top;line-height:1.35;">
        <strong style="display:block;color:#243746;font-size:14px;line-height:1.35;font-weight:700;">${escapeHtml(item.name)}</strong>${extraDetail}
      </td>
      <td width="40" style="padding:13px 4px;border-bottom:1px solid #e8e3d8;text-align:center;vertical-align:top;font-size:14px;line-height:1.35;">${item.qty}</td>
      <td width="88" style="padding:13px 4px 13px 8px;border-bottom:1px solid #e8e3d8;text-align:right;white-space:nowrap;vertical-align:top;font-size:14px;line-height:1.35;">${formatRsd(item.lineTotal)}</td>
    </tr>`;
  }).join("");

  return emailShell(`
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b69a69;font-weight:700;">Porudžbina je primljena</div>
    <h1 style="font-size:25px;line-height:1.22;margin:8px 0 10px;color:#10283d;">Hvala, ${escapeHtml(order.customer.firstName)}.</h1>
    <p style="margin:0 0 22px;color:#4f5c65;font-size:15px;line-height:1.65;">Primili smo vašu porudžbinu <strong>${escapeHtml(order.id)}</strong>. Plaćanje je pouzećem, a rok isporuke je do 5 radnih dana.</p>

    ${summaryTable(rows, order)}

    <div style="margin-top:24px;padding:18px 20px;background:#f7f5f0;border-radius:12px;color:#4f5c65;font-size:15px;line-height:1.6;">
      <strong style="color:#10283d;">Isporuka: ${escapeHtml(order.delivery.method)}</strong><br>
      ${order.delivery.method === 'Dostava na adresu'
        ? `${escapeHtml(order.delivery.address)}, ${escapeHtml(order.delivery.postalCode)} ${escapeHtml(order.delivery.city)}`
        : `Paketomat · ${escapeHtml(order.delivery.postalCode)} ${escapeHtml(order.delivery.city)}. Kurirska služba može poslati SMS/Viber poruku ili link za izbor dostupne lokacije.`}
    </div>

    <p style="margin:24px 0 0;color:#69747c;line-height:1.6;font-size:13px;">Ako imate pitanje u vezi sa porudžbinom, odgovorite na ovaj email ili pišite na <a href="mailto:${BUSINESS_EMAIL}" style="color:#0e3f67;">${BUSINESS_EMAIL}</a>.</p>

    ${customerBrandBlock()}
  `);
}

function summaryTable(rows, order) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed;">
      <thead>
        <tr>
          <th align="left" style="padding:10px 6px;border-bottom:2px solid #10283d;color:#10283d;font-size:13px;line-height:1.3;">Proizvod</th>
          <th align="center" width="40" style="padding:10px 4px;border-bottom:2px solid #10283d;color:#10283d;font-size:13px;line-height:1.3;">Kol.</th>
          <th align="right" width="88" style="padding:10px 4px 10px 8px;border-bottom:2px solid #10283d;color:#10283d;font-size:13px;line-height:1.3;">Iznos</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:16px;font-size:15px;color:#4f5c65;">
      <tbody>
        ${moneyLine("Vrednost robe", order.goodsTotal)}
        ${moneyLine("Dostava", order.shipping, order.shipping === 0 ? "Besplatna" : null)}
        <tr>
          <td style="padding:14px 8px 4px 8px;border-top:2px solid #10283d;color:#10283d;font-size:18px;font-weight:800;line-height:1.35;">Ukupno za plaćanje</td>
          <td width="118" align="right" style="padding:14px 8px 4px 18px;border-top:2px solid #10283d;color:#10283d;font-size:18px;font-weight:800;white-space:nowrap;line-height:1.35;">${formatRsd(order.total)}</td>
        </tr>
      </tbody>
    </table>`;
}

function moneyLine(label, amount, override) {
  return `
    <tr>
      <td style="padding:7px 8px;line-height:1.4;">${escapeHtml(label)}</td>
      <td align="right" style="padding:7px 8px 7px 18px;font-weight:700;white-space:nowrap;line-height:1.4;color:#243746;">${escapeHtml(override || formatRsd(amount))}</td>
    </tr>`;
}

function infoBlock(label, value, href = "") {
  const safeLabel = escapeHtml(label);
  const safeValue = escapeHtml(value);
  const valueHtml = href
    ? `<a href="${escapeHtml(href)}" style="color:#0e3f67;text-decoration:underline;font-size:14px;line-height:1.45;font-weight:700;word-break:break-word;">${safeValue}</a>`
    : `<div style="color:#243746;font-size:14px;line-height:1.45;font-weight:700;word-break:break-word;">${safeValue}</div>`;

  return `<div style="padding:7px 0;border-bottom:1px solid #e5e0d6;">
    <div style="margin:0 0 2px;color:#7a8084;font-size:11px;line-height:1.35;text-transform:uppercase;letter-spacing:.04em;">${safeLabel}</div>
    ${valueHtml}
  </div>`;
}

function customerBrandBlock() {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-top:30px;">
      <tr>
        <td style="padding:22px 20px;background:#102f47;border-radius:14px;text-align:center;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:16px;line-height:1.5;font-weight:700;color:#ffffff;margin:0 0 8px 0;">
            Hvala što birate proizvode prirodnog porekla i proverenog kvaliteta.
          </div>
          <div style="font-size:13px;line-height:1.55;color:#d5e0e7;margin:0 0 18px 0;">
            Želimo vam mnogo lepih trenutaka za stolom uz proizvode Solane Nin.
          </div>
          <div style="width:44px;height:1px;background:#c7a66b;margin:0 auto 16px auto;font-size:0;line-height:0;">&nbsp;</div>
          <div style="font-size:11px;line-height:1.4;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:#c7a66b;margin-bottom:8px;">
            Pratite nas na Instagramu
          </div>
          <a href="https://www.instagram.com/adriatictrade/" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 16px;border:1px solid #d8c18f;border-radius:999px;color:#ffffff;text-decoration:none;font-size:15px;line-height:1.2;font-weight:700;">
            @adriatictrade
          </a>
          <div style="font-size:12px;line-height:1.5;color:#aebbc5;margin-top:10px;">
            Novosti, proizvodi i priče iz sveta Solane Nin.
          </div>
        </td>
      </tr>
    </table>`;
}

function emailShell(content) {
  return `<!doctype html>
  <html lang="sr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
  </head>
  <body style="margin:0;padding:0;background:#f2f0ea;font-family:Arial,Helvetica,sans-serif;color:#243746;">
    <div style="padding:16px 8px;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e0d5;">
        <div style="padding:14px 22px;background:#10283d;text-align:center;">
          <img src="https://adriatictrade.rs/assets/img/adriatic-trade-logo-header.png" alt="Adriatic Trade" width="112" style="display:block;width:112px;max-width:112px;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none;">
        </div>
        <div style="padding:26px 22px;">${content}</div>
        <div style="padding:16px 22px;background:#f7f5f0;color:#70777c;font-size:12px;line-height:1.7;">
          <strong style="color:#4f5c65;">Adriatic Trade d.o.o.</strong><br>
          Cvetna 6, 21208 Sremska Kamenica<br>
          <a href="mailto:${BUSINESS_EMAIL}" style="color:#0e3f67;text-decoration:none;">${BUSINESS_EMAIL}</a> · <a href="tel:+381652169764" style="color:#0e3f67;text-decoration:none;">+381 65 216 9764</a><br>
          <a href="https://www.adriatictrade.rs" style="color:#0e3f67;">www.adriatictrade.rs</a>
        </div>
      </div>
    </div>
  </body>
  </html>`;
}

function makeOrderId(submissionId) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const embeddedDate = submissionId.match(/^(\d{8})[-_:]/)?.[1];
  const datePart = embeddedDate || `${map.year}${map.month}${map.day}`;

  // Deterministic suffix: the same submissionId always produces the same order ID.
  // This, together with Resend Idempotency-Key headers, prevents duplicate emails
  // when the same checkout submission is retried or double-clicked.
  let hash = 2166136261;
  for (let i = 0; i < submissionId.length; i++) {
    hash ^= submissionId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = String((hash >>> 0) % 1000000).padStart(6, "0");
  return `AT-${datePart}-${suffix}`;
}

function clean(value, max = 200) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizePlace(value) {
  return clean(value, 80)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 160;
}

function fail(error) {
  return { ok: false, error };
}

function formatRsd(value) {
  return new Intl.NumberFormat("sr-RS", {
    maximumFractionDigits: 0
  }).format(value) + " RSD";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Expose-Headers": "Retry-After",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
}

function json(data, status = 200, origin = "", extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  };
  if (ALLOWED_ORIGINS.has(origin)) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(data), { status, headers });
}


function courierCsv(orders,batch) {
  const header=['Izvozni paket','Datum izvoza','Porudžbina','Ime','Prezime','Telefon','Email','Adresa','Poštanski broj','Mesto','Način isporuke','Roba RSD','Dostava RSD','Ukupno RSD','Pouzeće RSD'];
  const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  const rows=orders.map(o=>[batch.id,batch.created_at,o.id,o.customer.firstName,o.customer.lastName,o.customer.phone,o.customer.email,o.delivery.address,o.delivery.postalCode,o.delivery.city,o.delivery.method,o.goodsTotal,o.shipping,o.total,isBankLocalPayment(o)||['paid','refunded'].includes(o.operations.paymentStatus)?0:o.total]);
  return '\uFEFF'+[header,...rows].map(row=>row.map(cell).join(';')).join('\r\n');
}

// Admin draft pilot. Disabled unless an isolated database explicitly identifies
// itself as staging. No issuing action, arbitrary API URL or automatic retry.
const MM_ITEMS = {
  '10086': [13473518,600,'Cvet soli 100 g – natron vrećica – BIO'],
  '10012': [13473554,800,'Cvet soli 125 g - kutija - BIO'],
  '10306': [13473557,299,'Sitna morska so 600 g - ZIP - BIO'],
  '10307': [13473558,299,'Gruba morska so 600 g - ZIP - BIO'],
  '10240': [13473560,550,'Sitna morska so 500 g - tuljak - BIO'],
  'DOSTAVA': [13473586,420,'Dostava']
};
const MM_API = 'https://moj.minimax.rs/RS/API/api/';
function mmDemand(ok,code) { if(!ok) throw new Error(code); }
function mmCents(n) {
  mmDemand(typeof n==='number' && Number.isFinite(n) && n>=0 && Number.isSafeInteger(Math.round(n*100)) && Math.abs(n*100-Math.round(n*100))<0.00001,'INVALID_AMOUNT');
  return Math.round(n*100);
}
async function mmStagingEnabled(env) {
  if(env.MINIMAX_MODE!=='draft' || env.MINIMAX_ENV!=='staging' || !env.DB) return false;
  try {return (await env.DB.prepare("SELECT name FROM minimax_environment WHERE id=1").first())?.name==='minimax-staging';} catch {return false;}
}
function mmCredentialsReady(env) {
  return env.MINIMAX_USERNAME==='adriatic-webshop' && ['MINIMAX_CLIENT_ID','MINIMAX_CLIENT_SECRET','MINIMAX_USERNAME','MINIMAX_PASSWORD'].every(k=>typeof env[k]==='string' && env[k].length>0 && env[k].length<=2000);
}
async function mmEnsureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS minimax_drafts (
    order_id TEXT PRIMARY KEY, operation_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL, payload_json TEXT NOT NULL, preview_hash TEXT NOT NULL,
    external_id INTEGER, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
}
// Allocate each saved package price in cents. Never reprice an accepted order.
function mmAllocate(total,components) {
  const weight=components.reduce((s,c)=>s+c.units*mmCents(c.referenceUnitPrice),0);
  mmDemand(weight>0,'INVALID_PACKAGE');
  const parts=components.map(c=>{
    const product=total*c.units*mmCents(c.referenceUnitPrice);
    mmDemand(Number.isSafeInteger(product),'INVALID_PACKAGE');
    return {...c,amount:Math.floor(product/weight),remainder:product%weight};
  });
  const extra=total-parts.reduce((s,c)=>s+c.amount,0);
  [...parts].sort((a,b)=>b.remainder-a.remainder||a.sku.localeCompare(b.sku)).slice(0,extra).forEach(c=>c.amount++);
  return parts;
}
function mmBuildPlan(order,day=belgradeDateKey()) {
  mmDemand(/^AT-MMTEST-[A-Z0-9-]{1,60}$/.test(order.id) && order.customer?.email==='minimax-test@example.invalid','TEST_ORDERS_ONLY');
  mmDemand(order.status==='confirmed','ORDER_NOT_CONFIRMED');
  mmDemand(order.payment==='TEST_BANK_TRANSFER','PAYMENT_MAPPING_REQUIRED');
  mmDemand(order.operations?.paymentStatus==='unpaid','PAYMENT_ALREADY_RECORDED');
  mmDemand(!(order.events||[]).some(e=>e.event_type==='security_flag') || order.operations?.riskReview==='approved','RISK_REVIEW_REQUIRED');
  mmDemand(Array.isArray(order.items) && order.items.length>0 && order.items.length<=20,'INVALID_ITEMS');
  mmDemand(/^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day,'INVALID_DATE');
  let goods=0,units=0; const rows=[],seen=new Set();
  function row(sku,qty,price,description='') {
    mmDemand(Object.hasOwn(MM_ITEMS,sku) && Number.isSafeInteger(qty) && qty>0 && qty<=200,'INVALID_ITEM');
    const [id,,name]=MM_ITEMS[sku];
    rows.push({RowNumber:rows.length+1,Item:{ID:id},ItemCode:sku,ItemName:name,Quantity:qty,UnitOfMeasurement:'kom',
      Price:Number((price/100/1.2).toFixed(6)),PriceWithVAT:price/100,Value:price*qty/100,
      VATPercent:20,VatRate:{ID:4},VatAccountingType:'3.2',Discount:0,DiscountPercent:0,
      Warehouse:sku==='DOSTAVA'?null:{ID:40999},OtherTaxesAndDuties:'N',...(description?{Description:description}:{})});
  }
  for(const item of order.items) {
    mmDemand(!seen.has(item.sku),'DUPLICATE_SKU');seen.add(item.sku);
    mmDemand(Number.isSafeInteger(item.qty) && item.qty>0 && item.qty<=20,'INVALID_QUANTITY');units+=item.qty;
    const unit=mmCents(item.unitPrice); mmDemand(unit>0 && unit<=2000000,'INVALID_AMOUNT');
    mmDemand(mmCents(item.lineTotal)===unit*item.qty,'LINE_TOTAL_MISMATCH');goods+=unit*item.qty;
    if(Object.hasOwn(BUNDLE_COMPONENTS,item.sku)) {
      mmDemand(item.packageVersion==='v1' && Array.isArray(item.bundleComponents),'PACKAGE_SNAPSHOT_REQUIRED');
      const expected=Object.entries(BUNDLE_COMPONENTS[item.sku]).sort();
      const actual=[...item.bundleComponents].sort((a,b)=>String(a.sku).localeCompare(String(b.sku)));
      mmDemand(actual.length===expected.length && actual.every((c,i)=>c.sku===expected[i][0] && c.units===expected[i][1] && c.referenceUnitPrice===MM_ITEMS[c.sku]?.[1]),'INVALID_PACKAGE_SNAPSHOT');
      for(const c of mmAllocate(unit,actual)) {
        const p=Math.floor(c.amount/c.units),remainder=c.amount%c.units;
        if(c.units>remainder)row(c.sku,(c.units-remainder)*item.qty,p,`Paket ${item.sku}; cena paketa ${item.unitPrice} RSD`);
        if(remainder)row(c.sku,remainder*item.qty,p+1,`Paket ${item.sku}; cena paketa ${item.unitPrice} RSD`);
      }
    } else {mmDemand(item.sku!=='DOSTAVA','INVALID_ITEM');row(item.sku,item.qty,unit);}
  }
  mmDemand(units<=20 && mmCents(order.goodsTotal)===goods,'GOODS_TOTAL_MISMATCH');
  const shipping=mmCents(order.shipping),total=mmCents(order.total);
  mmDemand([0,42000].includes(shipping) && total===goods+shipping && total<=20000000,'ORDER_TOTAL_MISMATCH');
  if(shipping)row('DOSTAVA',1,shipping);
  mmDemand(rows.reduce((s,r)=>s+mmCents(r.Value),0)===total,'ALLOCATION_MISMATCH');
  const payload={Status:'O',InvoiceType:'R',PricesOnInvoice:'D',DocumentNumbering:{ID:77630},Customer:{ID:9775669},Employee:{ID:408672},Currency:{ID:2},
    DateIssued:day,DateTransaction:day,DateTransactionFrom:day,DateDue:day,
    AddresseeName:'API probni kupac',AddresseeAddress:'/',AddresseePostalCode:'21208',AddresseeCity:'Sremska Kamenica',AddresseeCountry:{ID:3},
    Rabate:0,ExchangeRate:1,RecurringInvoice:'N',InvoiceForPeriod:'N',ForwardToCRF:'N',ForwardToSEF:'Zbirno',
    DocumentReference:`WEBSHOP:${order.id}`,DescriptionAbove:'PROBA API - NACRT. Ne izdavati. Nije stvarna porudžbina.',IssuedInvoiceRows:rows,
    IssuedInvoicePaymentMethods:[{PaymentMethod:{ID:622053},Amount:order.total,AmountInDomesticCurrency:order.total,AlreadyPaid:'N'}]};
  return {payload,total:order.total};
}
function mmSource(order) {
  return JSON.stringify({id:order.id,status:order.status,updatedAt:order.updatedAt,items:order.items,goodsTotal:order.goodsTotal,
    shipping:order.shipping,total:order.total,payment:order.payment,customer:order.customer,delivery:order.delivery,
    revision:order.operationsRevision,operations:order.operations,security:(order.events||[]).filter(e=>e.event_type==='security_flag')});
}
async function mmHash(text) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function mmView(job,plan,hash,changed=false) {
  return {ok:true,status:job?.status||'preview',previewHash:hash,sourceChanged:changed,invoiceId:job?.external_id||null,
    link:job?.external_id?`https://moj.minimax.rs/RS/VA/WebUI/IzdanRacun/IzdanRacunView.aspx?iracid=${job.external_id}&pgat=pgatv`:null,
    lastError:job?.last_error||null,total:plan.total,
    rows:plan.payload.IssuedInvoiceRows.map(r=>({sku:r.ItemCode,name:r.ItemName,qty:r.Quantity,price:r.PriceWithVAT,value:r.Value,description:r.Description||''}))};
}
async function mmReadBody(request) {
  mmDemand((request.headers.get('Content-Type')||'').split(';')[0]==='application/json','INVALID_REQUEST');
  mmDemand(request.body,'INVALID_REQUEST'); const reader=request.body.getReader(),decoder=new TextDecoder();let size=0,text='';
  try {while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;mmDemand(size<=8192,'REQUEST_TOO_LARGE');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();return JSON.parse(text);} catch {throw new Error('INVALID_REQUEST');} finally {await reader.cancel().catch(()=>{});}
}
async function mmRequest(url,options) {
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
  try {
    const response=await fetch(url,{...options,redirect:'manual',signal:abort.signal});
    if(!response.ok)throw Object.assign(new Error('MINIMAX_HTTP_ERROR'),{upstreamStatus:response.status});
    const text=await response.text();mmDemand(text.length<2000000,'MINIMAX_INVALID_RESPONSE');
    return {status:response.status,headers:response.headers,text};
  } catch(error) {
    const safe=new Error(['MINIMAX_HTTP_ERROR','MINIMAX_INVALID_RESPONSE'].includes(error.message)?error.message:abort.signal.aborted?'MINIMAX_TIMEOUT':'MINIMAX_NETWORK_ERROR');
    if(error.message==='MINIMAX_HTTP_ERROR' && Number.isInteger(error.upstreamStatus) && error.upstreamStatus>=300 && error.upstreamStatus<=599)safe.upstreamStatus=error.upstreamStatus;
    throw safe;
  }
  finally {clearTimeout(timer);}
}
function mmJson(text) {try{return JSON.parse(text);}catch {throw new Error('MINIMAX_INVALID_RESPONSE');}}
async function mmLogin(env) {
  mmDemand(mmCredentialsReady(env),'MINIMAX_SECRETS_REQUIRED');
  const response=await mmRequest('https://moj.minimax.rs/RS/AUT/oauth20/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
    body:new URLSearchParams({client_id:env.MINIMAX_CLIENT_ID,client_secret:env.MINIMAX_CLIENT_SECRET,username:env.MINIMAX_USERNAME,password:env.MINIMAX_PASSWORD,grant_type:'password',scope:'minimax.rs'}).toString()});
  const auth=mmJson(response.text);mmDemand(typeof auth.access_token==='string' && auth.access_token.length>0 && String(auth.token_type).toLowerCase()==='bearer','MINIMAX_INVALID_AUTH');
  return auth.access_token;
}
async function mmGet(token,path) {
  const result=await mmRequest(MM_API+path,{method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
  return mmJson(result.text);
}
async function mmPreflight(token,payload) {
  const orgs=await mmGet(token,'currentuser/orgs?CurrentPage=1&PageSize=100');
  mmDemand(orgs.Rows?.some(r=>r.Organisation?.ID===81179 && r.APIAccess==='D'),'MINIMAX_ORG_ACCESS_REQUIRED');
  const data=await mmGet(token,'orgs/81179/items/pricelists?CustomerId=9775669');
  mmDemand(Array.isArray(data.Rows) && Array.isArray(data.ValidationMessages) && !data.ValidationMessages.length,'MINIMAX_INVALID_PRICELIST');
  for(const sku of new Set(payload.IssuedInvoiceRows.map(r=>r.ItemCode))) {
    const [id,gross]=MM_ITEMS[sku];
    const rows=data.Rows.filter(r=>r.Item?.ID===id && r.Customer?.ID===9775669 && r.Warehouse==null);
    mmDemand(rows.length===1 && rows[0].Code===sku && rows[0].UnitOfMeasurement==='kom' && mmCents(rows[0].PriceWithVAT)===gross*100 &&
      typeof rows[0].PriceWithoutVAT==='number' && Math.abs(rows[0].PriceWithoutVAT-gross/1.2)<=0.000001,'MINIMAX_CUSTOMER_PRICE_CHANGED');
  }
}
// Observation only: no quota, reservation, invoice or schema writes on this route.
async function mmHandleStock(request,env,url,origin) {
  if(!await mmStagingEnabled(env))return json({ok:false,error:'Not found'},404,origin);
  if(request.method!=='GET')return json({ok:false,error:'Dozvoljeno je samo čitanje zaliha.'},405,origin,{Allow:'GET'});
  if(url.search)return json({ok:false,error:'Skladište i artikli su unapred određeni za ovu probu.'},400,origin);
  // Diagnostics are fixed labels/status numbers only, never provider bodies or headers.
  const observe=async(step,operation,sku=null)=>{
    try{return await operation();}
    catch(error){error.stockStep=step;error.stockSku=sku;throw error;}
  };
  try {
    const token=await observe('authentication',()=>mmLogin(env));
    await observe('organisation',async()=>{
      const orgs=await mmGet(token,'currentuser/orgs?CurrentPage=1&PageSize=100');
      mmDemand(orgs.Rows?.some(r=>r.Organisation?.ID===81179 && r.APIAccess==='D'),'MINIMAX_ORG_ACCESS_REQUIRED');
    });
    const startedAt=new Date().toISOString();
    // Item filters keep the pilot bounded regardless of the size of the full catalogue.
    // Mode=1 also requests items with historical stock. Missing rows are NOT zero.
    const rows=await Promise.all(Object.entries(MM_ITEMS).filter(([sku])=>sku!=='DOSTAVA').map(([sku,[id,,name]])=>observe('stock',async()=>{
      const data=await mmGet(token,`orgs/81179/stocks?WarehouseId=40999&ItemID=${id}&Mode=1&CurrentPage=1&PageSize=100`);
      mmDemand(Array.isArray(data.Rows) && data.CurrentPageNumber===1 && Number.isSafeInteger(data.PageSize) && data.PageSize>0 &&
        data.PageSize<=100 && data.TotalRows===data.Rows.length && data.Rows.length<=1 &&
        (data.ValidationMessages===undefined || (Array.isArray(data.ValidationMessages)&&data.ValidationMessages.length===0)),'MINIMAX_INVALID_STOCK');
      const row=data.Rows[0];
      if(!row)return {sku,itemId:id,name,quantity:null,state:'unreported'};
      mmDemand(row.Item?.ID===id && row.ItemCode===sku && row.UnitOfMeasurement==='kom' && (row.BatchNumber==null||row.BatchNumber===''),'MINIMAX_INVALID_STOCK');
      mmDemand(row.Quantity===null || (Number.isSafeInteger(row.Quantity)&&Math.abs(row.Quantity)<=1000000000),'MINIMAX_INVALID_STOCK');
      return {sku,itemId:id,name,quantity:row.Quantity,state:row.Quantity===null?'unreported':'reported'};
    },sku)));
    return json({ok:true,readOnly:true,organisationId:81179,warehouseId:40999,warehouseName:'VP skladište',startedAt,readAt:new Date().toISOString(),rows},200,origin);
  }catch(error){
    const codes=new Set(['MINIMAX_SECRETS_REQUIRED','MINIMAX_HTTP_ERROR','MINIMAX_INVALID_RESPONSE','MINIMAX_TIMEOUT','MINIMAX_NETWORK_ERROR','MINIMAX_INVALID_AUTH','MINIMAX_ORG_ACCESS_REQUIRED','MINIMAX_INVALID_STOCK']);
    const code=codes.has(error.message)?error.message:'MINIMAX_STOCK_UNAVAILABLE';
    const step=['authentication','organisation','stock'].includes(error.stockStep)?error.stockStep:'unknown';
    const sku=Object.hasOwn(MM_ITEMS,error.stockSku||'')&&error.stockSku!=='DOSTAVA'?error.stockSku:null;
    const upstreamStatus=Number.isInteger(error.upstreamStatus)&&error.upstreamStatus>=300&&error.upstreamStatus<=599?error.upstreamStatus:null;
    return json({ok:false,code,step,sku,upstreamStatus,error:'Stanje zaliha nije pouzdano učitano iz Minimax-a. Probne kvote nisu promenjene.'},502,origin);
  }
}
function mmLocation(value) {
  try {
    const url=new URL(value,MM_API),match=url.pathname.match(/^\/(?:RS\/API\/)?api\/orgs\/81179\/issuedinvoices\/([1-9]\d*)\/?$/i),id=Number(match?.[1]);
    const params=[...url.searchParams.entries()];
    mmDemand(url.origin==='https://moj.minimax.rs' && !url.username && !url.password && !url.hash && Number.isSafeInteger(id) && id>0 &&
      (!params.length || (params.length===1 && params[0][0]==='id' && params[0][1]===String(id))),'MINIMAX_LOCATION_UNCERTAIN');return id;
  }catch {throw new Error('MINIMAX_LOCATION_UNCERTAIN');}
}
function mmVerify(actual,expected,id) {
  mmDemand(actual?.IssuedInvoiceId===id && actual.Status==='O' && !(actual.InvoiceNumber>0),'MINIMAX_NOT_MATCHING_DRAFT');
  for(const key of ['Customer','DocumentNumbering','Employee','Currency','AddresseeCountry'])mmDemand(actual[key]?.ID===expected[key].ID,'MINIMAX_HEADER_MISMATCH');
  for(const key of ['DocumentReference','PricesOnInvoice','InvoiceType','Rabate','ExchangeRate','AddresseeName','AddresseeAddress','AddresseePostalCode','AddresseeCity','DescriptionAbove'])mmDemand(actual[key]===expected[key],'MINIMAX_HEADER_MISMATCH');
  for(const key of ['DateIssued','DateTransaction','DateTransactionFrom','DateDue'])mmDemand(typeof actual[key]==='string' && actual[key].slice(0,10)===expected[key],'MINIMAX_DATE_MISMATCH');
  mmDemand(Array.isArray(actual.IssuedInvoiceRows) && actual.IssuedInvoiceRows.length===expected.IssuedInvoiceRows.length,'MINIMAX_ROWS_MISMATCH');
  for(const row of expected.IssuedInvoiceRows) {
    const matches=actual.IssuedInvoiceRows.filter(r=>r.RowNumber===row.RowNumber);mmDemand(matches.length===1,'MINIMAX_ROWS_MISMATCH');const r=matches[0];
    mmDemand(r.Item?.ID===row.Item.ID && r.ItemCode===row.ItemCode && r.Quantity===row.Quantity && r.UnitOfMeasurement==='kom' && (r.Description||'')===(row.Description||''),'MINIMAX_ROWS_MISMATCH');
    mmDemand(mmCents(r.Value)===mmCents(row.Value) && mmCents(r.PriceWithVAT)===mmCents(row.PriceWithVAT) && typeof r.Price==='number' && Math.abs(r.Price-row.Price)<=0.000001,'MINIMAX_AMOUNT_MISMATCH');
    mmDemand(r.Discount===0 && r.DiscountPercent===0 && r.VATPercent===20 && r.VatRate?.ID===4 && r.VatAccountingType==='3.2' && (r.Warehouse?.ID||null)===(row.Warehouse?.ID||null) && r.AdditionalWarehouse==null,'MINIMAX_TAX_OR_WAREHOUSE_MISMATCH');
  }
  const p=actual.IssuedInvoicePaymentMethods;
  mmDemand(Array.isArray(p) && p.length===1 && p[0].PaymentMethod?.ID===622053 && p[0].AlreadyPaid==='N' && mmCents(p[0].Amount)===mmCents(expected.IssuedInvoicePaymentMethods[0].Amount) && mmCents(p[0].AmountInDomesticCurrency)===mmCents(p[0].Amount),'MINIMAX_PAYMENT_MISMATCH');
}
async function mmHandleDraft(request,env,order,origin) {
  if(!await mmStagingEnabled(env))return json({ok:false,error:'Minimax probni prenos nije uključen.'},404,origin);
  if(!['GET','POST'].includes(request.method))return json({ok:false,error:'Method not allowed'},405,origin);
  await mmEnsureSchema(env.DB);
  let job=await env.DB.prepare('SELECT * FROM minimax_drafts WHERE order_id=?').bind(order.id).first();
  try {
    const source=mmSource(order);
    const plan=job?JSON.parse(job.payload_json):{...mmBuildPlan(order),source};
    const hash=job?.preview_hash||await mmHash(JSON.stringify(plan));
    const changed=plan.source!==source;
    if(request.method==='GET')return json({...mmView(job,plan,hash,changed),ready:mmCredentialsReady(env)},200,origin);
    const body=await mmReadBody(request);
    mmDemand(body && ['create','verify'].includes(body.action) && body.confirm===true,'CONFIRMATION_REQUIRED');
    if(body.action==='create' && job)return json({...mmView(job,plan,hash,changed),ready:mmCredentialsReady(env)},200,origin);
    mmDemand(!changed,'ORDER_CHANGED_AFTER_TRANSFER');
    if(body.action==='create')mmDemand(body.previewHash===hash,'PREVIEW_EXPIRED');
    else mmDemand(job,'NO_PREVIOUS_ATTEMPT');
    const token=await mmLogin(env);
    if(body.action==='create') {
      await mmPreflight(token,plan.payload);
      const now=new Date().toISOString(),revision=order.operationsRevision;
      const result=await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO minimax_drafts (order_id,operation_key,status,payload_json,preview_hash,created_at,updated_at)
          SELECT id,?,'sending',?,?,?,? FROM orders WHERE id=? AND status=? AND updated_at=? AND items_json=? AND goods_total=? AND shipping=? AND total=? AND payment=?
          AND (SELECT revision FROM order_operations WHERE order_id=orders.id)=?`).bind(`minimax:draft:${order.id}`,JSON.stringify(plan),hash,now,now,order.id,order.status,order.updatedAt,JSON.stringify(order.items),order.goodsTotal,order.shipping,order.total,order.payment,revision),
        env.DB.prepare(`INSERT INTO order_events (order_id,event_type,note,created_at) SELECT ?,'minimax_draft_attempt','Probni prenos nacrta je zabeležen.',? WHERE changes()=1`).bind(order.id,now)
      ]);
      job=await env.DB.prepare('SELECT * FROM minimax_drafts WHERE order_id=?').bind(order.id).first();
      if(!result[0].meta.changes){mmDemand(job,'ORDER_CHANGED_RELOAD_PREVIEW');return json(mmView(job,JSON.parse(job.payload_json),job.preview_hash),200,origin);}
      // Once sending is durable, every outcome (including HTTP errors) blocks a
      // second POST. The only continuation is reading an existing draft by ID.
      try {
        const res=await mmRequest(MM_API+'orgs/81179/issuedinvoices',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(plan.payload)});
        mmDemand(res.status===201,'MINIMAX_CREATE_UNCERTAIN');const id=mmLocation(res.headers.get('Location'));
        await env.DB.prepare("UPDATE minimax_drafts SET external_id=?,status='created',updated_at=? WHERE order_id=?").bind(id,new Date().toISOString(),order.id).run();
        job.external_id=id;
      }catch(error){await env.DB.prepare("UPDATE minimax_drafts SET status='attention',last_error=?,updated_at=? WHERE order_id=?").bind(error.message,new Date().toISOString(),order.id).run();throw error;}
    }
    const id=job.external_id||Number(body.invoiceId);
    mmDemand(Number.isSafeInteger(id) && id>0,'EXISTING_INVOICE_ID_REQUIRED');
    const actual=await mmGet(token,`orgs/81179/issuedinvoices/${id}`);mmVerify(actual,plan.payload,id);
    const now=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE minimax_drafts SET status='verified',external_id=?,last_error=NULL,updated_at=? WHERE order_id=?").bind(id,now,order.id),
      env.DB.prepare("INSERT INTO order_events (order_id,event_type,note,created_at) VALUES (?,'minimax_draft_verified',?,?)").bind(order.id,`Proveren probni nacrt ${id}; nije izdat.`,now)
    ]);
    return json(mmView({...job,status:'verified',external_id:id,last_error:null},plan,hash),200,origin);
  }catch(error) {
    // Errors are controlled codes only; never return provider text or secrets.
    return json({ok:false,error:'Minimax: '+(/^[A-Z_]{3,70}$/.test(error.message)?error.message:'CHECK_REQUIRED')+'. Ne ponavljajte prenos; osvežite pregled i proverite postojeći nacrt.'},409,origin);
  }
}

// Operator-only synthetic admission into the same atomic quota/order service as
// checkout. This is not a public checkout endpoint or a bypass in /order.
const MM_PROBE_CARTS = {
  STANDARD:[{sku:'10086',qty:1},{sku:'10012',qty:1},{sku:'10306',qty:1},{sku:'10307',qty:1},{sku:'10240',qty:1}],
  PAKET:[{sku:'PKT-PROBA',qty:2},{sku:'10240',qty:1}],
  BESPLATNA:[{sku:'PKT-KOMPLET',qty:2}],
  GURMAN:[{sku:'PKT-GURMAN',qty:2}]
};
function mmProbeOrder(scenario) {
  const id='AT-MMTEST-FLOW-'+scenario;
  const validation=validateOrder({submissionId:id,customer:{firstName:'API proba',lastName:scenario,email:'minimax-test@example.invalid',phone:'0600000000'},
    delivery:{method:'Dostava na adresu',address:'Test 1',postalCode:'21208',city:'Sremska Kamenica',note:'Sintetička proba; ne slati.'},items:MM_PROBE_CARTS[scenario]});
  mmDemand(validation.ok,'INVALID_PROBE_CART');
  return {...buildOrder(validation.data),id,payment:'TEST_BANK_TRANSFER'};
}
async function mmHandleProbeOrder(request,env,url,origin) {
  if(!await mmStagingEnabled(env))return json({ok:false,error:'Not found'},404,origin);
  const base='/admin/probe-orders';
  if(url.pathname===base && request.method==='GET')return json({ok:true,scenarios:Object.keys(MM_PROBE_CARTS).map(scenario=>{
    const o=mmProbeOrder(scenario);return {scenario,id:o.id,items:o.items,goodsTotal:o.goodsTotal,shipping:o.shipping,total:o.total};
  })},200,origin);
  if(request.method!=='POST')return json({ok:false,error:'Method not allowed'},405,origin);
  const fail=(error,status=400)=>json({ok:false,error},status,origin);
  let body;try{body=await mmReadBody(request);}catch{return fail('Neispravan probni zahtev.');}
  if(!body || body.confirm!==true)return fail('Potvrdite probnu radnju.');
  if(url.pathname===base) {
    if(Object.keys(body).some(k=>!['scenario','confirm'].includes(k))||typeof body.scenario!=='string'||!Object.hasOwn(MM_PROBE_CARTS,body.scenario))return fail('Izaberite ponuđenu sintetičku probu.');
    try {
      const accepted=await acceptOrder(env.DB,mmProbeOrder(body.scenario));
      if(accepted.rejection)return json({ok:false,...accepted.rejection.body},accepted.rejection.status,origin);
      return json({ok:true,duplicate:accepted.duplicate,order:accepted.order},accepted.duplicate?200:201,origin);
    }catch{return intakeError(origin);}
  }
  const match=url.pathname.match(/^\/admin\/probe-orders\/(AT-MMTEST-FLOW-(?:STANDARD|PAKET|BESPLATNA|GURMAN))\/confirm$/);
  if(!match || Object.keys(body).some(k=>k!=='confirm'))return fail('Probna radnja nije dozvoljena.');
  const order=await getOrderById(env.DB,match[1]);
  if(!order)return fail('Prvo prihvatite probnu porudžbinu.',404);
  if(order.customer.email!=='minimax-test@example.invalid'||order.payment!=='TEST_BANK_TRANSFER')return fail('Dozvoljeni su samo probni podaci.',409);
  if(order.status==='confirmed')return json({ok:true,duplicate:true,order},200,origin);
  if(order.status!=='new')return fail('Probna porudžbina nije nova.',409);
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status='confirmed',confirmed_at=?,updated_at=? WHERE id=? AND status='new'").bind(now,now,order.id),
    env.DB.prepare("INSERT INTO order_events(order_id,event_type,note,created_at) SELECT ?,'probe_confirmed','Potvrđena sintetička porudžbina; bez slanja poruka.',? WHERE changes()=1").bind(order.id,now)
  ]);
  return json({ok:true,order:await getOrderById(env.DB,order.id)},200,origin);
}
