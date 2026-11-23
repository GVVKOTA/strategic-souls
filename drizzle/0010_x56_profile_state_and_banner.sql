ALTER TABLE `auth_users` ADD COLUMN `avatar_id` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `x56_profile_metadata` (
	`subject` text PRIMARY KEY NOT NULL,
	`state_code` text,
	`banner_id` text,
	`banner_align` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`subject`) REFERENCES `accounts`(`subject`) ON UPDATE no action ON DELETE cascade
);
