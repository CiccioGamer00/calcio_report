-- Apply after the two Apple/entitlement schemas. No existing expiry is changed.
-- Records a non-Apple operation before delivery so retries reuse its first time.
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
