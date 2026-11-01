-- Apply separately after approval. No real quantities are seeded and sales stay paused.
CREATE TABLE IF NOT EXISTS checkout_intake (
  id INTEGER PRIMARY KEY CHECK(id=1),
  mode TEXT NOT NULL DEFAULT 'paused' CHECK(mode IN ('paused','open')),
  updated_at TEXT NOT NULL,
  reason TEXT NOT NULL
);
INSERT OR IGNORE INTO checkout_intake(id,mode,updated_at,reason)
  VALUES(1,'paused',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Initial state: operational readiness not confirmed');

-- Manual webshop allocation, NOT an accounting inventory balance or Minimax write.
-- Only physical SKU units are stored here. Bundles share their component quotas.
CREATE TABLE IF NOT EXISTS checkout_stock (
  sku TEXT PRIMARY KEY CHECK(sku IN ('10086','10012','10306','10307','10240')),
  state TEXT NOT NULL DEFAULT 'unknown' CHECK(state IN ('unknown','available','unavailable')),
  remaining INTEGER CHECK(remaining IS NULL OR (typeof(remaining)='integer' AND remaining>=0)),
  updated_at TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkout_admissions (
  submission_id TEXT PRIMARY KEY,
  requirements_json TEXT NOT NULL CHECK(json_valid(requirements_json)),
  created_at TEXT NOT NULL,
  admitted INTEGER NOT NULL CHECK(admitted=1)
);
