PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('CASHIER', 'ADMIN')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tariffs (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  duration_value INTEGER NOT NULL CHECK (duration_value > 0),
  duration_unit TEXT NOT NULL CHECK (duration_unit IN ('HOURS', 'WEEKS')),
  price_fcfa INTEGER NOT NULL CHECK (price_fcfa >= 0),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tariff_history (
  id TEXT PRIMARY KEY,
  tariff_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  name TEXT NOT NULL,
  duration_value INTEGER NOT NULL,
  duration_unit TEXT NOT NULL,
  price_fcfa INTEGER NOT NULL,
  is_active INTEGER NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  reason TEXT,
  FOREIGN KEY (tariff_id) REFERENCES tariffs(id)
);

CREATE TABLE IF NOT EXISTS ticket_sequences (
  period TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  period TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  tariff_id TEXT,
  tariff_ref TEXT NOT NULL,
  tariff_name TEXT NOT NULL,
  duration_value INTEGER NOT NULL,
  duration_unit TEXT NOT NULL,
  price_fcfa INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'ORANGE_MONEY', 'MOOV_MONEY', 'CARD')),
  amount_received INTEGER,
  change_fcfa INTEGER NOT NULL DEFAULT 0,
  cashier_id TEXT NOT NULL,
  cashier_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SOLD', 'CANCELLED', 'REFUNDED')),
  sold_at TEXT NOT NULL,
  print_status TEXT NOT NULL DEFAULT 'PENDING',
  printed_at TEXT,
  print_error TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT,
  cancelled_by_name TEXT,
  cancel_reason TEXT,
  refunded_at TEXT,
  refunded_by TEXT,
  refunded_by_name TEXT,
  refund_reason TEXT,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  sync_attempts INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  sync_error TEXT,
  UNIQUE (period, sequence)
);

CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_sales_sync ON sales(sync_status);

CREATE TABLE IF NOT EXISTS cash_closures (
  id TEXT PRIMARY KEY,
  cashier_id TEXT,
  cashier_name TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  theoretical_amount INTEGER NOT NULL,
  declared_amount INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  tickets_count INTEGER NOT NULL,
  notes TEXT,
  closed_by_id TEXT NOT NULL,
  closed_by_name TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  operation TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'PENDING'
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
