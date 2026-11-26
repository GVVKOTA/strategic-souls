-- Published posts and private runs have independent identities. Preserve research copies and quotas.
CREATE INDEX x1_notification_target ON x2_notifications(target_id,kind);
--> statement-breakpoint
CREATE INDEX x1_public_soul_copy_source ON x51_web_souls(copied_from_post_id) WHERE copied_from_post_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER x1_cleanup_published_soul AFTER DELETE ON x51_web_souls
BEGIN
  DELETE FROM x2_notifications WHERE target_id=OLD.id
    AND kind IN ('SOUL_COMMENT','SOUL_REPLY','SOUL_LIKE','SOUL_SAVE');
  UPDATE x51_web_souls SET copied_from_post_id=NULL WHERE copied_from_post_id=OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER x1_cleanup_deleted_private_scan AFTER DELETE ON x1_scans
BEGIN
  DELETE FROM x2_notifications WHERE subject=OLD.subject AND target_id=OLD.id AND kind='SCAN_COMPLETE';
  DELETE FROM x1_account_notices WHERE subject=OLD.subject AND target_id=OLD.id AND kind='SCAN_COMPLETE';
  UPDATE x78_market_scan_jobs SET scan_id=NULL WHERE subject=OLD.subject AND scan_id=OLD.id;
END;
