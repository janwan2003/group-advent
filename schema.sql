-- Advent Together: storage schema (SQLite in a Durable Object; see worker/index.js)
CREATE TABLE IF NOT EXISTS cals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start TEXT NOT NULL,
  days INTEGER NOT NULL,
  tz TEXT NOT NULL,
  preset TEXT NOT NULL DEFAULT 'advent',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cals_exp ON cals(expires_at);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  cal_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  is_host INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS members_cal ON members(cal_id);
CREATE UNIQUE INDEX IF NOT EXISTS members_tok ON members(token_hash);
CREATE TABLE IF NOT EXISTS doors (
  cal_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  member_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'message',
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  has_photo INTEGER NOT NULL DEFAULT 0,
  claimed_at INTEGER NOT NULL,
  filled_at INTEGER,
  PRIMARY KEY (cal_id, day)
);
CREATE TABLE IF NOT EXISTS photos (
  cal_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (cal_id, day)
);
CREATE TABLE IF NOT EXISTS reactions (
  cal_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  member_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  PRIMARY KEY (cal_id, day, member_id)
);
CREATE TABLE IF NOT EXISTS rate (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
