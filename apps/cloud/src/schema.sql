PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS owners (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS installations (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  api_key_hash TEXT NOT NULL,
  pairing_code TEXT NOT NULL,
  owner_id TEXT,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  claimed_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES owners(id)
);

CREATE INDEX IF NOT EXISTS idx_inst_owner ON installations(owner_id);
CREATE INDEX IF NOT EXISTS idx_inst_pair ON installations(pairing_code);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  local_id TEXT NOT NULL,
  ticket_number TEXT NOT NULL,
  tariff_ref TEXT NOT NULL,
  tariff_name TEXT NOT NULL,
  duration_value INTEGER NOT NULL,
  duration_unit TEXT NOT NULL,
  price_fcfa INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'CASH',
  amount_received INTEGER,
  change_fcfa INTEGER NOT NULL DEFAULT 0,
  cashier_id TEXT,
  cashier_name TEXT NOT NULL,
  status TEXT NOT NULL,
  sold_at TEXT NOT NULL,
  cancelled_at TEXT,
  cancelled_by_name TEXT,
  cancel_reason TEXT,
  refunded_at TEXT,
  refunded_by_name TEXT,
  refund_reason TEXT,
  received_at TEXT NOT NULL,
  UNIQUE (installation_id, local_id),
  UNIQUE (installation_id, ticket_number),
  FOREIGN KEY (installation_id) REFERENCES installations(id)
);

CREATE INDEX IF NOT EXISTS idx_sales_inst_sold ON sales(installation_id, sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_sold ON sales(sold_at);

CREATE TABLE IF NOT EXISTS tariffs (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  local_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  name TEXT NOT NULL,
  duration_value INTEGER NOT NULL,
  duration_unit TEXT NOT NULL,
  price_fcfa INTEGER NOT NULL,
  is_active INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (installation_id, local_id),
  FOREIGN KEY (installation_id) REFERENCES installations(id)
);

CREATE TABLE IF NOT EXISTS cashiers (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  local_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active INTEGER NOT NULL,
  UNIQUE (installation_id, local_id),
  FOREIGN KEY (installation_id) REFERENCES installations(id)
);

CREATE TABLE IF NOT EXISTS cash_closures (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  local_id TEXT NOT NULL,
  cashier_name TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  theoretical_amount INTEGER NOT NULL,
  declared_amount INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  tickets_count INTEGER NOT NULL,
  notes TEXT,
  closed_by_name TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  UNIQUE (installation_id, local_id),
  FOREIGN KEY (installation_id) REFERENCES installations(id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  local_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  operation TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (installation_id, local_id),
  FOREIGN KEY (installation_id) REFERENCES installations(id)
);
