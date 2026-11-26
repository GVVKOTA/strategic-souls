CREATE TABLE IF NOT EXISTS x8_shared_history_plan (
  provider TEXT PRIMARY KEY,
  config_version INTEGER NOT NULL,
  paused_until INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  failures INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS x8_shared_history_task (
  provider TEXT NOT NULL,
  config_version INTEGER NOT NULL,
  instrument_id TEXT NOT NULL,
  interval TEXT NOT NULL,
  next_attempt INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  latest_event TEXT,
  last_checked INTEGER,
  last_error TEXT,
  PRIMARY KEY(provider,config_version,instrument_id,interval)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS x8_shared_history_due ON x8_shared_history_task(provider,config_version,next_attempt);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS x8_shared_history_snapshot (
  provider TEXT NOT NULL,
  config_version INTEGER NOT NULL,
  instrument_id TEXT NOT NULL,
  interval TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  first_event TEXT NOT NULL,
  last_event TEXT NOT NULL,
  bar_count INTEGER NOT NULL,
  last_close REAL NOT NULL,
  prior_close REAL,
  prior_event TEXT,
  last_volume REAL,
  bars TEXT NOT NULL,
  PRIMARY KEY(provider,config_version,instrument_id,interval,received_at)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS x8_shared_history_expiry ON x8_shared_history_snapshot(expires_at);
--> statement-breakpoint
ALTER TABLE x78_market_scan_jobs ADD COLUMN coverage TEXT;
--> statement-breakpoint
ALTER TABLE x78_market_scan_jobs ADD COLUMN last_batch_at TEXT;
--> statement-breakpoint
ALTER TABLE x78_market_scan_jobs ADD COLUMN scope_members TEXT;
--> statement-breakpoint
ALTER TABLE x78_market_scan_jobs ADD COLUMN selected_count INTEGER NOT NULL DEFAULT 500;
--> statement-breakpoint
INSERT OR IGNORE INTO x78_market_universes (version,effective_date,validated_at,provenance,constituents)
VALUES ('x8-scoped-v1','1900-01-01','1900-01-01T00:00:00.000Z','Private or separately scoped instrument selection','[]');
