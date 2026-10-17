-- Staged only. Apply after apple-purchase-ledger.sql to the isolated test DB.
-- All paid_until writers must use the new ledger before enabling purchases.
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
