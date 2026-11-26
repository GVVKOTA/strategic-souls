CREATE TABLE `accounts` (
	`subject` text PRIMARY KEY NOT NULL,
	`alias` text NOT NULL,
	`consent_at` text NOT NULL,
	`consent_version` text NOT NULL,
	`adult_confirmed` integer NOT NULL,
	`last_active` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`soul_id` text NOT NULL,
	`recorded_at` text NOT NULL,
	`available_at` text NOT NULL,
	`payload` text NOT NULL,
	`digest` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outcomes_soul_id_unique` ON `outcomes` (`soul_id`);--> statement-breakpoint
CREATE TABLE `ownership` (
	`subject` text NOT NULL,
	`soul_id` text NOT NULL,
	PRIMARY KEY(`subject`, `soul_id`)
);
--> statement-breakpoint
CREATE TABLE `support_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `souls` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`snapshot_at` text NOT NULL,
	`instrument` text NOT NULL,
	`model_version` text NOT NULL,
	`payload` text NOT NULL,
	`digest` text NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER souls_no_update BEFORE UPDATE ON souls BEGIN SELECT RAISE(ABORT, 'Original analysis is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER souls_no_delete BEFORE DELETE ON souls BEGIN SELECT RAISE(ABORT, 'Original analysis is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER outcomes_no_update BEFORE UPDATE ON outcomes BEGIN SELECT RAISE(ABORT, 'Outcomes are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER outcomes_no_delete BEFORE DELETE ON outcomes BEGIN SELECT RAISE(ABORT, 'Outcomes are append-only'); END;
