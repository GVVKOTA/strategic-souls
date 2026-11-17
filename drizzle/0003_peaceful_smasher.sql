CREATE TABLE `notebook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`soul_id` text NOT NULL,
	`recorded_at` text NOT NULL,
	`payload` text NOT NULL,
	`digest` text NOT NULL,
	`dedupe_key` text NOT NULL,
	FOREIGN KEY (`soul_id`) REFERENCES `notebook_souls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notebook_event_dedupe` ON `notebook_events` (`soul_id`,`dedupe_key`);--> statement-breakpoint
CREATE TABLE `notebook_souls` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`created_at` text NOT NULL,
	`payload` text NOT NULL,
	`digest` text NOT NULL,
	`dedupe_key` text NOT NULL,
	FOREIGN KEY (`subject`) REFERENCES `accounts`(`subject`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notebook_owner_dedupe` ON `notebook_souls` (`subject`,`dedupe_key`);--> statement-breakpoint
CREATE TRIGGER notebook_souls_immutable BEFORE UPDATE ON notebook_souls BEGIN SELECT RAISE(ABORT, 'Notebook Souls are immutable; create a new version.'); END;
--> statement-breakpoint
CREATE TRIGGER notebook_events_immutable BEFORE UPDATE ON notebook_events BEGIN SELECT RAISE(ABORT, 'Notebook events are append-only.'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_strategy_immutable BEFORE UPDATE ON workspace_records WHEN OLD.kind='strategy' BEGIN SELECT RAISE(ABORT, 'Strategy versions are immutable.'); END;
--> statement-breakpoint
CREATE INDEX notebook_owner_created ON notebook_souls(subject,created_at,id);
--> statement-breakpoint
CREATE INDEX notebook_event_created ON notebook_events(soul_id,recorded_at,id);
