-- Custom SQL migration file, put your code below! --
CREATE TRIGGER x1_scan_snapshot_immutable BEFORE UPDATE ON x1_scans BEGIN SELECT RAISE(ABORT,'Scan snapshots are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER x1_ledger_immutable BEFORE UPDATE ON x1_ledger BEGIN SELECT RAISE(ABORT,'Ledger transactions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER x1_scan_event_immutable BEFORE UPDATE ON x1_scan_events BEGIN SELECT RAISE(ABORT,'Scan reviews are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER x1_soul_revision_immutable BEFORE UPDATE OF soul_id,revision,title,formula,summary,rule,change_note,created_at ON x1_soul_revisions BEGIN SELECT RAISE(ABORT,'Soul revisions are immutable'); END;
