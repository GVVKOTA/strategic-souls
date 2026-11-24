CREATE TABLE IF NOT EXISTS x78_market_universes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  effective_date TEXT NOT NULL,
  validated_at TEXT NOT NULL,
  provenance TEXT NOT NULL,
  constituents TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS x78_market_scan_jobs (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL REFERENCES accounts(subject) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  universe_version TEXT NOT NULL REFERENCES x78_market_universes(version),
  input TEXT NOT NULL,
  cutoff TEXT NOT NULL,
  deadline TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('QUEUED','RUNNING','COMPLETE','PARTIAL','FAILED','CANCELLED')),
  cursor INTEGER NOT NULL DEFAULT 0,
  evaluated INTEGER NOT NULL DEFAULT 0,
  lease TEXT,
  lease_until TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  scan_id TEXT,
  UNIQUE(subject, request_key)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS x78_market_scan_schedule ON x78_market_scan_jobs(state, cutoff);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS x78_shared_quota_day ON x51_scan_reservations(subject, ist_day, state);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS x78_market_scan_batches (
  job_id TEXT NOT NULL REFERENCES x78_market_scan_jobs(id) ON DELETE CASCADE,
  cursor INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(job_id,cursor)
);
