ALTER TABLE x1_account_notices ADD COLUMN rights_expires_at INTEGER;
--> statement-breakpoint
ALTER TABLE x1_account_notices ADD COLUMN provider_version INTEGER;
--> statement-breakpoint
CREATE TRIGGER x1_price_notice_rights AFTER INSERT ON x1_account_notices
WHEN NEW.kind='PRICE_ALERT'
BEGIN
  UPDATE x1_account_notices SET
    rights_expires_at=(SELECT trigger_expires_at FROM x1_price_alerts WHERE id=NEW.target_id AND subject=NEW.subject),
    provider_version=(SELECT trigger_grant FROM x1_price_alerts WHERE id=NEW.target_id AND subject=NEW.subject)
  WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE VIEW x1_visible_notices AS
  SELECT id,subject,kind,target_id,event_key,created_at,read_at FROM x2_notifications
  UNION ALL
  SELECT n.id,n.subject,n.kind,n.target_id,n.event_key,n.created_at,n.read_at FROM x1_account_notices n
  WHERE n.kind<>'PRICE_ALERT' OR (n.rights_expires_at>unixepoch('now')*1000 AND EXISTS(
    SELECT 1 FROM x2_providers p WHERE p.provider='INDIANAPI' AND p.version=n.provider_version
      AND json_extract(p.payload,'$.enabled')=1 AND json_extract(p.payload,'$.rights.verified')=1
      AND json_extract(p.payload,'$.rights.derivedDisplay')=1
  ));
