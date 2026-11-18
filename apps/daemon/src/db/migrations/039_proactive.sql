CREATE TABLE proactive_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL,
  services_json TEXT NOT NULL,
  next_due_at INTEGER NOT NULL,
  interval_minutes INTEGER NOT NULL
);
CREATE TABLE proactive_accounts (
  service TEXT NOT NULL,
  account_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  last_attempt_at INTEGER,
  last_success_at INTEGER,
  covered_until INTEGER,
  cursor_json TEXT,
  status TEXT NOT NULL,
  reason TEXT,
  incident_id TEXT,
  PRIMARY KEY (service, account_id)
);
CREATE TABLE proactive_services (
  service TEXT PRIMARY KEY,
  searched_at INTEGER NOT NULL
);
CREATE TABLE proactive_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision INTEGER NOT NULL,
  service TEXT NOT NULL,
  account_id TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  status TEXT NOT NULL,
  reason TEXT,
  items INTEGER NOT NULL DEFAULT 0,
  decision_id INTEGER,
  from_at INTEGER,
  until_at INTEGER,
  evidence_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE proactive_seen (
  service TEXT NOT NULL,
  account_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  version TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (service, account_id, item_id)
);

ALTER TABLE digest_items ADD COLUMN proactive_revision INTEGER;

CREATE INDEX proactive_runs_service_time ON proactive_runs(service, started_at DESC);
