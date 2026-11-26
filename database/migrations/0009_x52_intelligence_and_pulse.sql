CREATE TABLE IF NOT EXISTS `x52_market_polls` (
	`poll_id` text PRIMARY KEY NOT NULL,
	`underlying` text NOT NULL,
	`session_date` text NOT NULL,
	`opens_at_utc` text NOT NULL,
	`closes_at_utc` text NOT NULL,
	`status` text NOT NULL,
	`reference_label` text NOT NULL,
	`cutoff_note` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `x52_polls_underlying_date` ON `x52_market_polls` (`underlying`, `session_date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `x52_market_poll_votes` (
	`poll_id` text NOT NULL,
	`subject` text NOT NULL,
	`choice` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`poll_id`, `subject`),
	FOREIGN KEY (`poll_id`) REFERENCES `x52_market_polls`(`poll_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject`) REFERENCES `accounts`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `x52_poll_votes_poll` ON `x52_market_poll_votes` (`poll_id`, `choice`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `x52_group_pins` (
	`group_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`pinned_by` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`group_id`, `target_kind`, `target_id`),
	FOREIGN KEY (`group_id`) REFERENCES `x1_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pinned_by`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `x52_group_pins_order` ON `x52_group_pins` (`group_id`, `position`, `created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `x52_search_history` (
	`subject` text PRIMARY KEY NOT NULL,
	`recents_json` text NOT NULL,
	`favorites_json` text NOT NULL,
	`opted_out` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`subject`) REFERENCES `accounts`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `x52_watch_regions` (
	`subject` text PRIMARY KEY NOT NULL,
	`regions_json` text NOT NULL,
	`categories_json` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`subject`) REFERENCES `accounts`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `x52_intelligence_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`synopsis` text NOT NULL,
	`occurred_at` text NOT NULL,
	`date_precision` text NOT NULL,
	`first_published_at` text,
	`updated_at` text,
	`ingested_at` text NOT NULL,
	`source_url` text NOT NULL,
	`source_name` text NOT NULL,
	`lat` real,
	`lon` real,
	`geo_precision` text NOT NULL,
	`country_code` text,
	`region_id` text,
	`entities_json` text NOT NULL,
	`assets_json` text NOT NULL,
	`verified` integer DEFAULT 1 NOT NULL,
	`license_scope` text NOT NULL,
	`dedupe_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `x52_intel_dedupe` ON `x52_intelligence_events` (`dedupe_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `x52_intel_cat_time` ON `x52_intelligence_events` (`category`, `occurred_at`);
