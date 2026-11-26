CREATE TABLE IF NOT EXISTS `auth_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text,
	`password_salt` text,
	`auth_provider` text DEFAULT 'email' NOT NULL,
	`google_sub` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `auth_users_email_unique` ON `auth_users` (`email`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `auth_users_google_sub_unique` ON `auth_users` (`google_sub`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `auth_sessions_expires_idx` ON `auth_sessions` (`expires_at`);
