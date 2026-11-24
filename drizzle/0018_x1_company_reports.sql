CREATE TABLE x1_company_reports (
  instrument_id TEXT PRIMARY KEY NOT NULL,
  config_version INTEGER NOT NULL,
  payload TEXT,
  retrieved_at INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER NOT NULL DEFAULT 0,
  lease TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX x1_company_report_expiry ON x1_company_reports(expires_at) WHERE payload IS NOT NULL;
