CREATE TABLE IF NOT EXISTS `x51_scan_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`tier` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`ist_day` text NOT NULL,
	`state` text NOT NULL,
	`lease_expires_at` text NOT NULL,
	`completed_at` text,
	`scan_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`subject`) REFERENCES `accounts`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `x51_scan_res_idemp` ON `x51_scan_reservations` (`subject`, `idempotency_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `x51_scan_res_classic_day` ON `x51_scan_reservations` (`subject`, `tier`, `ist_day`, `state`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `x51_scan_res_adv_time` ON `x51_scan_reservations` (`subject`, `tier`, `state`, `completed_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `x51_follows` (
	`follower_subject` text NOT NULL,
	`target_subject` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`follower_subject`, `target_subject`),
	FOREIGN KEY (`follower_subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `x51_follows_target` ON `x51_follows` (`target_subject`, `state`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `x51_web_souls` (
	`id` text PRIMARY KEY NOT NULL,
	`author_subject` text NOT NULL,
	`author_handle` text NOT NULL,
	`scan_id` text NOT NULL,
	`soul_version` integer DEFAULT 1 NOT NULL,
	`mode` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`formula` text NOT NULL,
	`blueprint_json` text NOT NULL,
	`timeframe` text NOT NULL,
	`universe_label` text NOT NULL,
	`matched_symbols_json` text NOT NULL,
	`evidence_status` text NOT NULL,
	`source_attribution` text NOT NULL,
	`risk_note` text NOT NULL,
	`audience` text NOT NULL,
	`group_id` text,
	`idempotency_key` text NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`source_digest` text NOT NULL,
	`copied_from_post_id` text,
	`copied_from_handle` text,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`author_subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `x51_web_souls_idemp` ON `x51_web_souls` (`author_subject`, `idempotency_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `x51_web_souls_feed` ON `x51_web_souls` (`audience`, `deleted_at`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `x51_web_souls_author` ON `x51_web_souls` (`author_subject`, `deleted_at`, `pinned`, `created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `x51_web_soul_saves` (
	`subject` text NOT NULL,
	`post_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`subject`, `post_id`),
	FOREIGN KEY (`subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `x51_web_souls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `x51_web_soul_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`author_subject` text NOT NULL,
	`author_handle` text NOT NULL,
	`content` text NOT NULL,
	`request_key` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`post_id`) REFERENCES `x51_web_souls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `x51_web_comment_idemp` ON `x51_web_soul_comments` (`post_id`, `author_subject`, `request_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `x51_web_comment_post` ON `x51_web_soul_comments` (`post_id`, `created_at`);
