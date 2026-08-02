CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_month TEXT NOT NULL,
  active_view TEXT NOT NULL,
  currency TEXT NOT NULL,
  locale TEXT NOT NULL,
  opening_balance_cents INTEGER NOT NULL,
  projection_months INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  person TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('one-time', 'monthly', 'installment')),
  start_month TEXT NOT NULL,
  end_month TEXT,
  installments INTEGER NOT NULL CHECK (installments BETWEEN 1 AND 120),
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 0 AND 31),
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS occurrence_status (
  transaction_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status = 'paid'),
  PRIMARY KEY (transaction_id, month_key),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transactions_start_month
  ON transactions (start_month);

CREATE INDEX IF NOT EXISTS idx_transactions_kind
  ON transactions (kind);

CREATE INDEX IF NOT EXISTS idx_occurrence_status_month
  ON occurrence_status (month_key);

CREATE TRIGGER IF NOT EXISTS validate_transaction_months_insert
BEFORE INSERT ON transactions
WHEN NEW.start_month NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'
BEGIN
  SELECT RAISE(ABORT, 'invalid start_month');
END;

CREATE TRIGGER IF NOT EXISTS validate_occurrence_month_insert
BEFORE INSERT ON occurrence_status
WHEN NEW.month_key NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'
BEGIN
  SELECT RAISE(ABORT, 'invalid month_key');
END;

PRAGMA user_version = 2;
