CREATE TABLE x1_price_alerts (
  id TEXT PRIMARY KEY NOT NULL,
  subject TEXT NOT NULL REFERENCES accounts(subject) ON DELETE CASCADE,
  instrument_id TEXT NOT NULL,
  rule TEXT NOT NULL CHECK (rule IN ('ABOVE','BELOW','RISE','FALL')),
  threshold REAL NOT NULL CHECK (threshold > 0),
  recurring INTEGER NOT NULL CHECK (recurring IN (0,1)),
  state TEXT NOT NULL CHECK (state IN ('ACTIVE','PAUSED','FIRED')),
  version INTEGER NOT NULL DEFAULT 1,
  checked_at INTEGER NOT NULL DEFAULT 0,
  last_session TEXT,
  trigger_session TEXT,
  trigger_value REAL,
  trigger_grant INTEGER,
  trigger_expires_at INTEGER,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX x1_price_alerts_owner ON x1_price_alerts(subject,created_at);
--> statement-breakpoint
CREATE INDEX x1_price_alerts_due ON x1_price_alerts(checked_at,id) WHERE state='ACTIVE';
--> statement-breakpoint
CREATE INDEX x1_price_alerts_trigger_expiry ON x1_price_alerts(trigger_expires_at) WHERE trigger_expires_at IS NOT NULL;
--> statement-breakpoint
CREATE TABLE x1_account_notices (
  id TEXT PRIMARY KEY NOT NULL,
  subject TEXT NOT NULL REFERENCES accounts(subject) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE(subject,event_key)
);
--> statement-breakpoint
CREATE INDEX x1_account_notices_owner ON x1_account_notices(subject,created_at,id);
--> statement-breakpoint
CREATE INDEX x1_account_notices_unread ON x1_account_notices(subject) WHERE read_at IS NULL;
--> statement-breakpoint
CREATE VIEW x1_all_notices AS
  SELECT id,subject,kind,target_id,event_key,created_at,read_at FROM x2_notifications
  UNION ALL SELECT id,subject,kind,target_id,event_key,created_at,read_at FROM x1_account_notices;
--> statement-breakpoint
CREATE TRIGGER x1_price_alert_notice AFTER UPDATE OF trigger_session ON x1_price_alerts
WHEN NEW.trigger_session IS NOT NULL AND NEW.trigger_session IS NOT OLD.trigger_session
BEGIN
  INSERT OR IGNORE INTO x1_account_notices(id,subject,kind,target_id,event_key,created_at)
  SELECT lower(hex(randomblob(16))),NEW.subject,'PRICE_ALERT',NEW.id,
    'price:'||NEW.id||':'||NEW.trigger_session,strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE COALESCE((SELECT notifications FROM x2_social_preferences WHERE subject=NEW.subject),1)=1;
END;
--> statement-breakpoint
CREATE TRIGGER x1_price_alert_cleanup AFTER DELETE ON x1_price_alerts
BEGIN
  DELETE FROM x1_account_notices WHERE kind='PRICE_ALERT' AND subject=OLD.subject AND target_id=OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER x1_scan_notice AFTER UPDATE OF scan_id ON x78_market_scan_jobs
WHEN NEW.scan_id IS NOT NULL AND NEW.scan_id IS NOT OLD.scan_id
BEGIN
  INSERT OR IGNORE INTO x1_account_notices(id,subject,kind,target_id,event_key,created_at)
  SELECT lower(hex(randomblob(16))),NEW.subject,'SCAN_COMPLETE',NEW.scan_id,
    'scan:'||NEW.scan_id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE COALESCE((SELECT notifications FROM x2_social_preferences WHERE subject=NEW.subject),1)=1;
END;
