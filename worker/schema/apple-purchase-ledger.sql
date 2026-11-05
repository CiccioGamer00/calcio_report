-- Staged schema, NOT a deployed migration. Apply only to an isolated test DB
-- until verification, entitlement delivery, retention and deletion are approved.
-- users must already exist. No email, payment details or signed payloads stored.
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

-- Preserve ownership tombstones when an account is deleted. They must never
-- attach to a new user with the same email. No FK cascade from users.
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

-- Refund/reconciliation events will live separately; never rewrite a purchase.
CREATE TRIGGER apple_purchase_immutable BEFORE UPDATE ON apple_purchase_ledger
BEGIN
  SELECT RAISE(ABORT, 'APPLE_PURCHASE_IMMUTABLE');
END;
