-- Bootstrap for the EMPTY calcio_users_review database only. Run once.
-- No account data or secrets included.

-- Source: tests/fixtures/account-schema.sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  pass_hash TEXT,
  trial_ends_at INTEGER,
  paid_until INTEGER,
  created_at INTEGER,
  note TEXT,
  last_seen_at INTEGER DEFAULT 0,
  paid_activated_at INTEGER DEFAULT 0,
  disabled INTEGER DEFAULT 0
);
CREATE TABLE trial_search_log (
  email TEXT,
  search_id TEXT,
  created_at INTEGER,
  PRIMARY KEY (email, search_id)
);
CREATE TABLE trial_usage (
  email TEXT PRIMARY KEY,
  day_key TEXT,
  daily_used INTEGER DEFAULT 0,
  total_used INTEGER DEFAULT 0,
  updated_at INTEGER
);

-- Source: worker/schema/apple-purchase-ledger.sql
CREATE TABLE apple_account_tokens (
  environment TEXT NOT NULL CHECK (environment IN ('Sandbox', 'Production')),
  account_id TEXT NOT NULL,
  app_account_token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  retired_at INTEGER,
  PRIMARY KEY (environment, account_id)
);

CREATE TABLE apple_purchase_ledger (
  environment TEXT NOT NULL CHECK (environment IN ('Sandbox', 'Production')),
  transaction_id TEXT NOT NULL,
  original_transaction_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  app_account_token TEXT NOT NULL,
  product_id TEXT NOT NULL,
  purchased_at INTEGER NOT NULL,
  signed_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms = 2592000000),
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY (environment, transaction_id),
  FOREIGN KEY (environment, account_id)
    REFERENCES apple_account_tokens(environment, account_id)
);

CREATE TRIGGER apple_retire_deleted_account AFTER DELETE ON users
BEGIN
  UPDATE apple_account_tokens SET retired_at = unixepoch('now') * 1000
  WHERE account_id = OLD.id AND retired_at IS NULL;
END;

CREATE TRIGGER apple_token_identity_immutable
BEFORE UPDATE OF environment, account_id, app_account_token, created_at ON apple_account_tokens
BEGIN
  SELECT RAISE(ABORT, 'APPLE_TOKEN_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER apple_token_retirement_irreversible
BEFORE UPDATE OF retired_at ON apple_account_tokens WHEN OLD.retired_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'APPLE_TOKEN_RETIRED');
END;

CREATE TRIGGER apple_purchase_immutable BEFORE UPDATE ON apple_purchase_ledger
BEGIN
  SELECT RAISE(ABORT, 'APPLE_PURCHASE_IMMUTABLE');
END;

-- Source: worker/schema/pro-entitlements.sql
CREATE TABLE pro_entitlement_accounts (
  environment TEXT NOT NULL CHECK(environment IN ('Sandbox','Production')),
  account_id TEXT NOT NULL,
  account_created_at INTEGER NOT NULL,
  baseline_until INTEGER NOT NULL CHECK(baseline_until >= 0),
  projected_until INTEGER NOT NULL CHECK(projected_until >= 0),
  revision TEXT NOT NULL,
  PRIMARY KEY(environment, account_id),
  FOREIGN KEY(environment, account_id) REFERENCES apple_account_tokens(environment, account_id)
);
CREATE TABLE pro_entitlement_events (
  environment TEXT NOT NULL,
  account_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_json TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY(environment, event_id),
  FOREIGN KEY(environment, account_id) REFERENCES pro_entitlement_accounts(environment, account_id)
);
CREATE INDEX pro_entitlement_account_events ON pro_entitlement_events(environment, account_id);
CREATE TRIGGER pro_entitlement_event_immutable BEFORE UPDATE ON pro_entitlement_events
BEGIN
  SELECT RAISE(ABORT, 'PRO_EVENT_IMMUTABLE');
END;

-- Source: worker/schema/pro-payment-operations.sql
CREATE TABLE pro_payment_operations (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  environment TEXT NOT NULL CHECK(environment IN ('Sandbox','Production')),
  operation_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  event_json TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  UNIQUE(environment, operation_id),
  FOREIGN KEY(environment, account_id) REFERENCES apple_account_tokens(environment, account_id)
);
CREATE TRIGGER pro_payment_operation_immutable BEFORE UPDATE ON pro_payment_operations
BEGIN
  SELECT RAISE(ABORT, 'PRO_PAYMENT_OPERATION_IMMUTABLE');
END;

SELECT COUNT(*) AS tabelle_create FROM sqlite_master WHERE type = 'table' AND name IN ('users','trial_search_log','trial_usage','apple_account_tokens','apple_purchase_ledger','pro_entitlement_accounts','pro_entitlement_events','pro_payment_operations');
