-- Application tables transcribed from calcio_users schema supplied on 2026-10-10.
-- For an EMPTY, ISOLATED test database only. Contains no production user data.
-- _cf_KV is managed by Cloudflare and must not be copied or modified here.
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
