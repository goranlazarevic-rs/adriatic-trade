CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  customer_first_name TEXT NOT NULL,
  customer_last_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_method TEXT NOT NULL,
  address TEXT,
  postal_code TEXT NOT NULL,
  city TEXT NOT NULL,
  note TEXT,
  payment TEXT NOT NULL DEFAULT 'Pouzećem',
  items_json TEXT NOT NULL,
  goods_total INTEGER NOT NULL,
  shipping INTEGER NOT NULL,
  total INTEGER NOT NULL,
  business_email_sent INTEGER NOT NULL DEFAULT 0,
  customer_email_sent INTEGER NOT NULL DEFAULT 0,
  confirmed_at TEXT,
  shipped_at TEXT,
  courier TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  receipt_key TEXT,
  receipt_filename TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id, id);

CREATE TABLE IF NOT EXISTS notification_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT, operation_key TEXT NOT NULL UNIQUE,
    order_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', payload_json TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}', attempts INTEGER NOT NULL DEFAULT 0,
    first_attempt_at INTEGER, next_attempt_at INTEGER NOT NULL DEFAULT 0,
    lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0, last_error TEXT,
    created_at TEXT NOT NULL, sent_at TEXT
  );
CREATE INDEX IF NOT EXISTS idx_notification_due ON notification_outbox(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_notification_order ON notification_outbox(order_id,id);
