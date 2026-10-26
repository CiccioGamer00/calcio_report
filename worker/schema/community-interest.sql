-- Additive, repeatable. No changes to users, PRO rights or payment records.
-- Apply only to the live DB; review/test interest is never counted.
CREATE TABLE IF NOT EXISTS community_interest (
  account_id TEXT NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL CHECK (created_at > 0)
);
