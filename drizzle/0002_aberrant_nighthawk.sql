CREATE TABLE `workspace_records` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text NOT NULL,
	`payload` text NOT NULL,
	`digest` text NOT NULL,
	`dedupe_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_owner_dedupe` ON `workspace_records` (`subject`,`kind`,`dedupe_key`);