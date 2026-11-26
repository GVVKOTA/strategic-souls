-- Strategic Souls V3 Release Candidate — Additive D1 Migration
-- Preserves all existing tables and historical user data untouched.

CREATE TABLE IF NOT EXISTS `v3_formula_pins` (
	`subject` text NOT NULL,
	`formula_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`subject`, `formula_id`),
	FOREIGN KEY (`subject`) REFERENCES `accounts`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `v3_formula_pins_subject_idx` ON `v3_formula_pins` (`subject`, `created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v3_auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`token_hash` text NOT NULL,
	`target_email` text,
	`expires_at` integer NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `v3_auth_tokens_hash_unique` ON `v3_auth_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `v3_auth_tokens_user_idx` ON `v3_auth_tokens` (`user_id`, `purpose`, `expires_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v3_session_meta` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_label` text NOT NULL,
	`user_agent` text NOT NULL,
	`ip_hint` text,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`token_hash`) REFERENCES `auth_sessions`(`token_hash`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `v3_session_meta_user_idx` ON `v3_session_meta` (`user_id`, `last_seen_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v3_user_email_verification` (
	`user_id` text PRIMARY KEY NOT NULL,
	`verified_email` text,
	`verified_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v3_post_likes` (
	`post_id` text NOT NULL,
	`subject` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`post_id`, `subject`),
	FOREIGN KEY (`post_id`) REFERENCES `x51_web_souls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject`) REFERENCES `accounts`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `v3_post_likes_post_idx` ON `v3_post_likes` (`post_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v3_post_views` (
	`post_id` text NOT NULL,
	`viewer_key` text NOT NULL,
	`day_bucket` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`post_id`, `viewer_key`, `day_bucket`),
	FOREIGN KEY (`post_id`) REFERENCES `x51_web_souls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `v3_post_views_post_idx` ON `v3_post_views` (`post_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v3_post_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`actor_key` text NOT NULL,
	`channel` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `x51_web_souls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `v3_post_shares_post_idx` ON `v3_post_shares` (`post_id`);
