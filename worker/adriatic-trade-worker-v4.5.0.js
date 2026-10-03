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
const LOCAL_PAYMENT_CASH = "Lična dostava — gotovina";

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
  async fetch(request, env) {
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
        version: "4.7.0",
        status: "ready",
        database: Boolean(env.DB),
        receipts: Boolean(env.RECEIPTS),
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

  const securityFlags = getClientRiskFlags(validation.data.customer.email, body?.security?.startedAt);
  if (env.DB) {
    securityFlags.push(...await getVelocityRiskFlags(env.DB, validation.data.customer.email, validation.data.customer.phone));
  }

  let order = buildOrder(validation.data);
  order.securityFlags = [...new Set(securityFlags)];
  let duplicate = false;
  let stored = false;
  let emailState = { business: false, customer: false };

  if (env.DB) {
    try {
      const existing = await getOrderBySubmissionId(env.DB, order.submissionId);
      if (existing) {
        order = existing;
        duplicate = true;
        stored = true;
        emailState.business = Boolean(existing.businessEmailSent);
        emailState.customer = Boolean(existing.customerEmailSent);
      } else {
        try {
          await insertOrder(env.DB, order);
          await addOrderEvent(env.DB, order.id, "created", "Porudžbina je kreirana preko web sajta.");
          if (order.securityFlags.length) {
            await addOrderEvent(env.DB, order.id, "security_flag", `Bezbednosni signal: ${order.securityFlags.join("; ")}`);
          }
          stored = true;
        } catch (error) {
          // A near-simultaneous duplicate can hit the UNIQUE submission_id constraint.
          const raced = await getOrderBySubmissionId(env.DB, order.submissionId);
          if (raced) {
            order = raced;
            duplicate = true;
            stored = true;
            emailState.business = Boolean(raced.businessEmailSent);
            emailState.customer = Boolean(raced.customerEmailSent);
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      // Keep checkout operational even if D1 is temporarily unavailable.
      console.error("D1 create/read failed; continuing email-only", error);
    }
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
  const exportReady="orders.status='confirmed' AND json_extract(order_operations.data_json,'$.fulfillment')='ready' AND NOT EXISTS(SELECT 1 FROM courier_export_orders WHERE order_id=orders.id)";
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
    if(actions[attention])conditions.push(actions[attention]);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const stmt = env.DB.prepare(`SELECT orders.*, (SELECT data_json FROM order_operations WHERE order_id=orders.id) AS operations_json, EXISTS(SELECT 1 FROM order_events WHERE order_id=orders.id AND event_type='security_flag') AS security_flagged FROM orders ${where} ORDER BY created_at DESC LIMIT ?`).bind(...params, limit);
    const result = await stmt.all();
    return json({ ok: true, orders: (result.results || []).map(rowToOrder) }, 200, origin);
  }

  const match = url.pathname.match(/^\/admin\/orders\/([^/]+)(?:\/(confirm|ship|reject|cancel|receipt|operations|local-delivery|local-payment|local-schedule|local-delivered|ips-qr))?$/);
  if (!match) return json({ ok: false, error: "Not found" }, 404, origin);

  const orderId = decodeURIComponent(match[1]);
  const action = match[2] || "";
  const order = await getOrderById(env.DB, orderId);
  if (!order) return json({ ok: false, error: "Porudžbina nije pronađena." }, 404, origin);

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
    const result = await env.DB.prepare("UPDATE orders SET shipping = 0, total = goods_total, payment = ?, updated_at = ? WHERE id = ? AND status = 'new' AND shipping > 0")
      .bind(LOCAL_PAYMENT_IPS, now, order.id).run();
    if (!Number(result.meta?.changes || 0)) {
      return json({ ok: false, error: "Porudžbina je u međuvremenu promenjena. Osvežite prikaz." }, 409, origin);
    }
    await addOrderEvent(env.DB, order.id, "local_delivery_approved", "Administrator · Odobrena besplatna lokalna dostava za Novi Sad. Ukupan iznos je umanjen za dostavu, a IPS plaćanje je izabrano kao podrazumevano.");
    return json({ ok: true, order: await getOrderById(env.DB, order.id) }, 200, origin);
  }

  if (request.method === "POST" && action === "local-payment") {
    if (order.status !== "new" || !isApprovedLocalDelivery(order)) {
      return json({ ok: false, error: "Način plaćanja može se menjati samo za odobrenu lokalnu dostavu pre potvrde porudžbine." }, 409, origin);
    }
    let body; try { body = await request.json(); } catch { return json({ ok: false, error: "Neispravan zahtev." }, 400, origin); }
    const method = body?.method === "cash" ? "cash" : body?.method === "ips" ? "ips" : "";
    if (!method) return json({ ok: false, error: "Izaberite IPS ili gotovinu." }, 400, origin);
    const payment = method === "ips" ? LOCAL_PAYMENT_IPS : LOCAL_PAYMENT_CASH;
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE orders SET payment = ?, updated_at = ? WHERE id = ? AND status = 'new'")
      .bind(payment, now, order.id).run();
    await addOrderEvent(env.DB, order.id, "local_payment_changed", `Administrator · Način plaćanja za ličnu dostavu: ${payment}.`);
    return json({ ok: true, order: await getOrderById(env.DB, order.id) }, 200, origin);
  }

  if (request.method === "GET" && action === "ips-qr") {
    if (!isApprovedLocalDelivery(order) || order.payment !== LOCAL_PAYMENT_IPS) {
      return json({ ok: false, error: "IPS QR je dostupan samo za odobrenu lokalnu dostavu sa IPS plaćanjem." }, 409, origin);
    }
    const qr = await generateIpsQr(order);
    if (!qr.ok) return json({ ok: false, error: "IPS QR trenutno nije moguće generisati." }, 502, origin);
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
    let body; try { body = await request.json(); } catch { return json({ ok: false, error: "Neispravan zahtev." }, 400, origin); }
    const date = clean(body?.date, 10);
    const timeWindow = clean(body?.timeWindow, 80);
    const location = clean(body?.location, 300);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: "Izaberite datum lične isporuke." }, 400, origin);
    if (date < belgradeDateKey()) return json({ ok: false, error: "Datum isporuke ne može biti u prošlosti." }, 400, origin);
    if (!timeWindow) return json({ ok: false, error: "Unesite dogovoreno vreme ili vremenski okvir." }, 400, origin);
    if (!location) return json({ ok: false, error: "Unesite dogovoreno mesto isporuke." }, 400, origin);

    const sendResult = await sendEmail(env.RESEND_API_KEY, {
      from: FROM_EMAIL,
      to: [order.customer.email],
      reply_to: BUSINESS_EMAIL,
      subject: `Dogovoren termin lične isporuke — ${order.id}`,
      html: localScheduleEmailHtml(order, { date, timeWindow, location }),
      tags: [
        { name: "category", value: "local_delivery_scheduled" },
        { name: "order_id", value: order.id }
      ]
    }, `local-schedule/${order.id}/${date}/${encodeURIComponent(timeWindow)}`);
    if (!sendResult.ok) return json({ ok: false, error: "Email kupcu nije poslat. Termin nije sačuvan." }, 502, origin);

    const current = order.operations || {};
    const now = new Date().toISOString();
    const next = { ...current, localDelivery: { date, timeWindow, location, notifiedAt: now, deliveredAt: current.localDelivery?.deliveredAt || "" } };
    await env.DB.prepare("UPDATE order_operations SET data_json=?, revision=revision+1 WHERE order_id=?")
      .bind(JSON.stringify(next), order.id).run();
    await addOrderEvent(env.DB, order.id, "local_delivery_scheduled", `Termin lične isporuke: ${date}, ${timeWindow}; mesto: ${location}. Kupac je obavešten.`);
    return json({ ok: true, order: await getOrderById(env.DB, order.id) }, 200, origin);
  }

  if (request.method === "POST" && action === "local-delivered") {
    if (order.status === "shipped" && order.operations?.fulfillment === "delivered") return json({ ok: true, order, alreadyDone: true }, 200, origin);
    if (order.status !== "confirmed" || !isApprovedLocalDelivery(order) || !order.operations?.localDelivery?.date) {
      return json({ ok: false, error: "Prvo potvrdite i zakažite ličnu dostavu." }, 409, origin);
    }
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("multipart/form-data")) return json({ ok: false, error: "Očekivan je formular za završetak isporuke." }, 415, origin);
    let form; try { form = await request.formData(); } catch { return json({ ok: false, error: "Neispravan formular." }, 400, origin); }
    const paymentConfirmed = form.get("paymentConfirmed") === "yes";
    if (!paymentConfirmed && order.operations.paymentStatus !== "paid") {
      return json({ ok: false, error: order.payment === LOCAL_PAYMENT_CASH ? "Potvrdite da je gotovina primljena." : "Prvo proverite uplatu na računu i potvrdite da je evidentirana." }, 409, origin);
    }

    let attachment = null;
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
      receiptKey = `fiscal/${order.id}/${Date.now()}-${filename}`;
      await env.RECEIPTS.put(receiptKey, buffer, { httpMetadata: { contentType: "application/pdf", contentDisposition: `attachment; filename="${sanitizeHeaderFilename(filename)}"` }, customMetadata: { orderId: order.id } });
      attachment = { filename, content: arrayBufferToBase64(buffer) };
    }

    const payload = {
      from: FROM_EMAIL,
      to: [order.customer.email],
      reply_to: BUSINESS_EMAIL,
      subject: `Porudžbina ${order.id} je lično isporučena`,
      html: localDeliveredEmailHtml(order, Boolean(attachment || receiptKey)),
      tags: [{ name: "category", value: "local_delivery_delivered" }, { name: "order_id", value: order.id }]
    };
    if (attachment) payload.attachments = [attachment];
    const sendResult = await sendEmail(env.RESEND_API_KEY, payload, `local-delivered/${order.id}`);
    if (!sendResult.ok) {
      if (attachment && env.RECEIPTS) await env.RECEIPTS.delete(receiptKey).catch(() => {});
      return json({ ok: false, error: "Email kupcu nije poslat. Status nije promenjen." }, 502, origin);
    }

    const now = new Date().toISOString();
    const next = { ...order.operations, fulfillment: "delivered", paymentStatus: "paid", localDelivery: { ...order.operations.localDelivery, deliveredAt: now } };
    await env.DB.batch([
      env.DB.prepare(`UPDATE orders SET status='shipped', shipped_at=?, updated_at=?, courier='Lična dostava', tracking_number='LIČNO', tracking_url=NULL, receipt_key=?, receipt_filename=? WHERE id=? AND status='confirmed'`).bind(now, now, receiptKey || null, receiptFilename || null, order.id),
      env.DB.prepare("UPDATE order_operations SET data_json=?, revision=revision+1 WHERE order_id=?").bind(JSON.stringify(next), order.id)
    ]);
    await addOrderEvent(env.DB, order.id, "local_delivery_delivered", "Lična dostava je završena, a naplata evidentirana. Kupac je obavešten.");
    return json({ ok: true, order: await getOrderById(env.DB, order.id) }, 200, origin);
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
      return json({ ok: true, order, alreadyDone: true }, 200, origin);
    }

    const attachments = [
      { path: LEGAL_NOTICE_URL, filename: "Adriatic-Trade-Obavestenje-o-prodaji-na-daljinu.pdf" },
      { path: WITHDRAWAL_FORM_URL, filename: "Adriatic-Trade-Obrazac-za-odustanak.pdf" }
    ];
    if (order.payment === LOCAL_PAYMENT_IPS) {
      const qr = await generateIpsQr(order);
      if (!qr.ok) return json({ ok: false, error: "IPS QR nije generisan. Porudžbina nije potvrđena; pokušajte ponovo." }, 502, origin);
      attachments.push({ filename: `IPS-${order.id}.png`, content: arrayBufferToBase64(qr.buffer) });
    }

    const sendResult = await sendEmail(env.RESEND_API_KEY, {
      from: FROM_EMAIL,
      to: [order.customer.email],
      reply_to: BUSINESS_EMAIL,
      subject: `Porudžbina ${order.id} je potvrđena`,
      html: statusConfirmedEmailHtml(order),
      attachments,
      tags: [
        { name: "category", value: "order_confirmed" },
        { name: "order_id", value: order.id }
      ]
    }, `status-confirmed/${order.id}`);

    if (!sendResult.ok) {
      console.error("Confirmation status email failed", sendResult.status, sendResult.data);
      return json({ ok: false, error: "Email kupcu nije poslat. Status nije promenjen." }, 502, origin);
    }

    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE orders SET status = 'confirmed', confirmed_at = ?, updated_at = ? WHERE id = ?")
      .bind(now, now, order.id).run();
    await addOrderEvent(env.DB, order.id, "confirmed", "Porudžbina je potvrđena i kupac je obavešten.");
    return json({ ok: true, order: await getOrderById(env.DB, order.id) }, 200, origin);
  }

  if (request.method === "POST" && action === "reject") {
    if (order.status === "rejected") {
      return json({ ok: true, order, alreadyDone: true }, 200, origin);
    }
    if (order.status !== "new") {
      return json({ ok: false, error: "Samo nova porudžbina može biti odbijena." }, 409, origin);
    }

    const decision = await readDecisionReason(request);
    if (!decision.ok) return json({ ok: false, error: decision.error }, 400, origin);

    const sendResult = await sendEmail(env.RESEND_API_KEY, {
      from: FROM_EMAIL,
      to: [order.customer.email],
      reply_to: BUSINESS_EMAIL,
      subject: `Porudžbina ${order.id} nije potvrđena`,
      html: statusRejectedEmailHtml(order, decision.data),
      tags: [
        { name: "category", value: "order_rejected" },
        { name: "order_id", value: order.id }
      ]
    }, `status-rejected/${order.id}`);

    if (!sendResult.ok) {
      console.error("Rejected status email failed", sendResult.status, sendResult.data);
      return json({ ok: false, error: "Email kupcu nije poslat. Status nije promenjen." }, 502, origin);
    }

    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE orders SET status = 'rejected', updated_at = ? WHERE id = ?")
      .bind(now, order.id).run();
    await addOrderEvent(env.DB, order.id, "rejected", decisionEventNote("Porudžbina je odbijena", decision.data));
    return json({ ok: true, order: await getOrderById(env.DB, order.id) }, 200, origin);
  }

  if (request.method === "POST" && action === "cancel") {
    if (order.status === "cancelled") {
      return json({ ok: true, order, alreadyDone: true }, 200, origin);
    }
    if (order.status === "shipped") {
      return json({ ok: false, error: "Poslata porudžbina ne može biti otkazana iz ovog panela." }, 409, origin);
    }
    if (order.status !== "confirmed") {
      return json({ ok: false, error: "Samo potvrđena, a neposlata porudžbina može biti otkazana." }, 409, origin);
    }

    const decision = await readDecisionReason(request);
    if (!decision.ok) return json({ ok: false, error: decision.error }, 400, origin);

    const sendResult = await sendEmail(env.RESEND_API_KEY, {
      from: FROM_EMAIL,
      to: [order.customer.email],
      reply_to: BUSINESS_EMAIL,
      subject: `Porudžbina ${order.id} je otkazana`,
      html: statusCancelledEmailHtml(order, decision.data),
      tags: [
        { name: "category", value: "order_cancelled" },
        { name: "order_id", value: order.id }
      ]
    }, `status-cancelled/${order.id}`);

    if (!sendResult.ok) {
      console.error("Cancelled status email failed", sendResult.status, sendResult.data);
      return json({ ok: false, error: "Email kupcu nije poslat. Status nije promenjen." }, 502, origin);
    }

    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?")
      .bind(now, order.id).run();
    await addOrderEvent(env.DB, order.id, "cancelled", decisionEventNote("Porudžbina je otkazana", decision.data));
    return json({ ok: true, order: await getOrderById(env.DB, order.id) }, 200, origin);
  }

  if (request.method === "POST" && action === "ship") {
    if (order.status === "shipped") {
      return json({ ok: true, order, alreadyDone: true }, 200, origin);
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
      receiptKey = `fiscal/${order.id}/${Date.now()}-${filename}`;
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
      attachment = { filename, content: arrayBufferToBase64(buffer) };
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
    if (attachment) payload.attachments = [attachment];

    const sendResult = await sendEmail(env.RESEND_API_KEY, payload, `status-shipped/${order.id}`);
    if (!sendResult.ok) {
      console.error("Shipped status email failed", sendResult.status, sendResult.data);
      if (attachment && env.RECEIPTS) await env.RECEIPTS.delete(receiptKey).catch(() => {});
      return json({ ok: false, error: "Email kupcu nije poslat. Status nije promenjen." }, 502, origin);
    }

    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE orders
      SET status = 'shipped', shipped_at = ?, updated_at = ?, courier = ?, tracking_number = ?, tracking_url = ?, receipt_key = ?, receipt_filename = ?
      WHERE id = ?`)
      .bind(now, now, courier, trackingNumber, trackingUrl || null, receiptKey || null, receiptFilename || null, order.id).run();
    await addOrderEvent(env.DB, order.id, "shipped", `Porudžbina je poslata: ${courier}, broj pošiljke ${trackingNumber}.`);
    return json({ ok: true, order: await getOrderById(env.DB, order.id) }, 200, origin);
  }

  return json({ ok: false, error: "Method not allowed" }, 405, origin);
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

async function insertOrder(db, order) {
  const now = order.createdAt;
  await db.prepare(`INSERT INTO orders (
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
    ).run();
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

function statusConfirmedEmailHtml(order) {
  const rows = customerOrderRows(order);
  const paymentNotice = order.payment === LOCAL_PAYMENT_IPS
    ? `<div style="margin-top:18px;padding:16px 18px;background:#eef5f8;border:1px solid #d9e7ec;border-radius:12px;color:#40545f;font-size:14px;line-height:1.6;">
        <strong style="display:block;color:#10283d;margin-bottom:4px;">IPS plaćanje na račun</strong>
        U prilogu je PNG slika NBS IPS QR koda za iznos <strong>${formatRsd(order.total)}</strong>. Skenirajte je drugim telefonom ili je sačuvajte pa uvezite iz galerije u aplikaciji svoje banke. Robu predajemo nakon provere evidentirane uplate.
      </div>`
    : order.payment === LOCAL_PAYMENT_CASH
      ? `<div style="margin-top:18px;padding:16px 18px;background:#f7f5f0;border-radius:12px;color:#4f5c65;font-size:14px;line-height:1.6;">Lična dostava je besplatna. Plaćanje je <strong>gotovinom prilikom preuzimanja</strong>.</div>`
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
  try {
    const response = await fetch(IPS_GENERATOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "image/png" },
      body: JSON.stringify(ipsFields(order))
    });
    const contentType = response.headers.get("Content-Type") || "";
    if (!response.ok || !contentType.toLowerCase().includes("image")) {
      console.error("NBS IPS QR generation failed", response.status, await response.text().catch(() => ""));
      return { ok: false };
    }
    return { ok: true, buffer: await response.arrayBuffer() };
  } catch (error) {
    console.error("NBS IPS QR generation failed", error);
    return { ok: false };
  }
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
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM security_order_attempts WHERE ip_hash = ? AND created_at >= ?")
      .bind(ipHash, cutoff).first();
    if (Number(row?.count || 0) >= RATE_LIMIT_MAX) return { ok: false };
    await env.DB.prepare("INSERT OR IGNORE INTO security_order_attempts (ip_hash, submission_hash, created_at) VALUES (?, ?, ?)")
      .bind(ipHash, submissionHash, now).run();
    return { ok: true };
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

async function verifyTurnstile(request, env, rawToken) {
  const secret = clean(env.TURNSTILE_SECRET_KEY, 200);
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is missing");
    return { ok: false, status: 503, error: "Zaštita porudžbine trenutno nije dostupna. Molimo pokušajte kasnije." };
  }
  const token = clean(rawToken, 2048);
  if (!token) return { ok: false, status: 403 };
  const remoteip = clean(request.headers.get("CF-Connecting-IP"), 80);
  let response;
  try {
    response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: remoteip || undefined })
    });
  } catch (error) {
    console.error("Turnstile network error", error);
    return { ok: false, status: 503, error: "Bezbednosna provera trenutno nije dostupna. Molimo pokušajte ponovo." };
  }
  if (!response.ok) {
    console.error("Turnstile Siteverify HTTP error", response.status);
    return { ok: false, status: 503, error: "Bezbednosna provera trenutno nije dostupna. Molimo pokušajte ponovo." };
  }
  let result = null;
  try { result = await response.json(); } catch {}
  if (!result?.success) {
    console.warn("Turnstile rejected order", result?.["error-codes"] || []);
    return { ok: false, status: 403 };
  }
  if (result.action !== TURNSTILE_ACTION) {
    console.warn("Turnstile action mismatch", result.action);
    return { ok: false, status: 403 };
  }
  if (!ALLOWED_TURNSTILE_HOSTS.has(String(result.hostname || "").toLowerCase())) {
    console.warn("Turnstile hostname mismatch", result.hostname);
    return { ok: false, status: 403 };
  }
  return { ok: true };
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
    if (!PRODUCTS[sku]) return fail("Korpa sadrži nepoznat proizvod.");
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
      lineTotal: unitPrice * qty
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
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "AdriaticTradeOrders/1.0",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = await response.text().catch(() => "");
  }

  return { ok: response.ok, status: response.status, data };
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
  const rows=orders.map(o=>[batch.id,batch.created_at,o.id,o.customer.firstName,o.customer.lastName,o.customer.phone,o.customer.email,o.delivery.address,o.delivery.postalCode,o.delivery.city,o.delivery.method,o.goodsTotal,o.shipping,o.total,['paid','refunded'].includes(o.operations.paymentStatus)?0:o.total]);
  return '\uFEFF'+[header,...rows].map(row=>row.map(cell).join(';')).join('\r\n');
}
