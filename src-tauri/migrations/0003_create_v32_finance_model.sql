CREATE TABLE IF NOT EXISTS occurrence_records (
  transaction_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  planned_amount_cents INTEGER NOT NULL CHECK (planned_amount_cents > 0),
  series_amount_cents INTEGER NOT NULL CHECK (series_amount_cents > 0),
  actual_amount_cents INTEGER CHECK (actual_amount_cents > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'skipped')),
  effective_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  person TEXT NOT NULL,
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 0 AND 31),
  note TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('one-time', 'monthly', 'installment')),
  installment_index INTEGER NOT NULL CHECK (installment_index BETWEEN 0 AND 120),
  installments INTEGER NOT NULL CHECK (installments BETWEEN 1 AND 120),
  PRIMARY KEY (transaction_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_occurrence_records_month
  ON occurrence_records (month_key);

CREATE TABLE IF NOT EXISTS closed_months (
  month_key TEXT PRIMARY KEY,
  closed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projection_origins (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  opening_balance_month TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  month_key TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  UNIQUE (month_key, category COLLATE NOCASE)
);

CREATE INDEX IF NOT EXISTS idx_budgets_month
  ON budgets (month_key);

CREATE TRIGGER IF NOT EXISTS validate_occurrence_record_month_insert
BEFORE INSERT ON occurrence_records
WHEN NEW.month_key NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'
BEGIN
  SELECT RAISE(ABORT, 'invalid occurrence month_key');
END;

CREATE TRIGGER IF NOT EXISTS validate_closed_month_insert
BEFORE INSERT ON closed_months
WHEN NEW.month_key NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'
BEGIN
  SELECT RAISE(ABORT, 'invalid closed month_key');
END;

CREATE TRIGGER IF NOT EXISTS validate_budget_month_insert
BEFORE INSERT ON budgets
WHEN NEW.month_key NOT GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'
BEGIN
  SELECT RAISE(ABORT, 'invalid budget month_key');
END;

PRAGMA user_version = 3;
