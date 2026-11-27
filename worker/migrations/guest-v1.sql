CREATE TABLE IF NOT EXISTS guest_analysis (
  id TEXT PRIMARY KEY, fixture INTEGER NOT NULL, snapshot TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS guest_expiry ON guest_analysis(expires);
CREATE TABLE IF NOT EXISTS guest_budget (
  scope TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS guest_budget_expiry ON guest_budget(expires);
CREATE TABLE IF NOT EXISTS guest_history (
  guest TEXT NOT NULL REFERENCES guest_analysis(id) ON DELETE CASCADE,
  source TEXT NOT NULL, ids TEXT NOT NULL, PRIMARY KEY (guest, source)
);
CREATE TABLE IF NOT EXISTS guest_candidate (
  ticket TEXT PRIMARY KEY, guest TEXT NOT NULL, fixture INTEGER NOT NULL,
  snapshot TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS guest_candidate_expiry ON guest_candidate(expires);
