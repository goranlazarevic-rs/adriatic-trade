-- Apply only after separate approval, after checkout-availability-v1.
-- No changes to intake mode or real stock allocations.
CREATE TABLE IF NOT EXISTS checkout_control (
  id INTEGER PRIMARY KEY CHECK(id=1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
INSERT OR IGNORE INTO checkout_control(id,revision) VALUES(1,0);

-- Every admission and manual SQL change invalidates an admin's old snapshot.
CREATE TRIGGER IF NOT EXISTS checkout_stock_insert_revision AFTER INSERT ON checkout_stock
BEGIN UPDATE checkout_control SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS checkout_stock_update_revision AFTER UPDATE ON checkout_stock
BEGIN UPDATE checkout_control SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS checkout_stock_delete_revision AFTER DELETE ON checkout_stock
BEGIN UPDATE checkout_control SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS checkout_intake_insert_revision AFTER INSERT ON checkout_intake
BEGIN UPDATE checkout_control SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS checkout_intake_update_revision AFTER UPDATE ON checkout_intake
BEGIN UPDATE checkout_control SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS checkout_intake_delete_revision AFTER DELETE ON checkout_intake
BEGIN UPDATE checkout_control SET revision=revision+1 WHERE id=1; END;

CREATE TABLE IF NOT EXISTS checkout_control_events (
  operation_id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('pause','open','quantity')),
  sku TEXT,
  revision_before INTEGER NOT NULL,
  before_json TEXT NOT NULL CHECK(json_valid(before_json)),
  after_json TEXT NOT NULL CHECK(json_valid(after_json)),
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  applied INTEGER NOT NULL CHECK(applied=1)
);
CREATE INDEX IF NOT EXISTS checkout_control_events_time ON checkout_control_events(created_at DESC);
