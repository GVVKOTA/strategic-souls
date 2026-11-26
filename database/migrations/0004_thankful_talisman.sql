CREATE TABLE `x1_bodies` (
	`subject` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`bio` text NOT NULL,
	`avatar` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`subject`) REFERENCES `accounts`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x1_body_handle_unique` ON `x1_bodies` (`handle`);--> statement-breakpoint
CREATE TABLE `x1_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`parent_id` text,
	`author_subject` text,
	`author_handle` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	`edited_at` text,
	`deleted_at` text,
	`request_key` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `x1_group_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `x1_comments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x1_comment_request_unique` ON `x1_comments` (`post_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `x1_comment_post_created` ON `x1_comments` (`post_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `x1_group_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`soul_id` text NOT NULL,
	`revision` integer NOT NULL,
	`revision_id` text NOT NULL,
	`author_subject` text,
	`author_handle` text NOT NULL,
	`created_at` text NOT NULL,
	`hidden_at` text,
	FOREIGN KEY (`group_id`) REFERENCES `x1_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`soul_id`) REFERENCES `x1_group_souls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revision_id`) REFERENCES `x1_soul_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x1_post_revision_unique` ON `x1_group_posts` (`soul_id`,`revision`);--> statement-breakpoint
CREATE INDEX `x1_post_group_created` ON `x1_group_posts` (`group_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `x1_group_souls` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`revision` integer NOT NULL,
	`revision_id` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `x1_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `x1_soul_group` ON `x1_group_souls` (`group_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `x1_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_subject` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `x1_group_owner` ON `x1_groups` (`owner_subject`);--> statement-breakpoint
CREATE TABLE `x1_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`group_id` text NOT NULL,
	`invited_handle` text NOT NULL,
	`role` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_by` text,
	`accepted_at` text,
	`revoked_at` text,
	FOREIGN KEY (`group_id`) REFERENCES `x1_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accepted_by`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x1_invite_code_unique` ON `x1_invitations` (`code_hash`);--> statement-breakpoint
CREATE INDEX `x1_invite_group` ON `x1_invitations` (`group_id`);--> statement-breakpoint
CREATE TABLE `x1_memberships` (
	`group_id` text NOT NULL,
	`subject` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` text NOT NULL,
	PRIMARY KEY(`group_id`, `subject`),
	FOREIGN KEY (`group_id`) REFERENCES `x1_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `x1_membership_subject` ON `x1_memberships` (`subject`,`group_id`);--> statement-breakpoint
CREATE TABLE `x1_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`reporter_subject` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`post_id`) REFERENCES `x1_group_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reporter_subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x1_report_author_post_unique` ON `x1_reports` (`post_id`,`reporter_subject`);--> statement-breakpoint
CREATE TABLE `x1_soul_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`soul_id` text NOT NULL,
	`revision` integer NOT NULL,
	`title` text NOT NULL,
	`formula` text NOT NULL,
	`summary` text NOT NULL,
	`rule` text NOT NULL,
	`change_note` text NOT NULL,
	`author_subject` text,
	`author_handle` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`soul_id`) REFERENCES `x1_group_souls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x1_soul_revision_unique` ON `x1_soul_revisions` (`soul_id`,`revision`);--> statement-breakpoint
CREATE TABLE `x1_supers` (
	`post_id` text NOT NULL,
	`subject` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`post_id`, `subject`),
	FOREIGN KEY (`post_id`) REFERENCES `x1_group_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `x1_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`portfolio_id` text NOT NULL,
	`request_key` text NOT NULL,
	`payload` text NOT NULL,
	`digest` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`subject`) REFERENCES `accounts`(`subject`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`portfolio_id`) REFERENCES `x1_records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x1_ledger_retry` ON `x1_ledger` (`subject`,`request_key`);--> statement-breakpoint
CREATE INDEX `x1_ledger_portfolio` ON `x1_ledger` (`portfolio_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `x1_records` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`last_write` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`subject`) REFERENCES `accounts`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `x1_records_owner` ON `x1_records` (`subject`,`kind`,`archived`);--> statement-breakpoint
CREATE TABLE `x1_scan_events` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`scan_id` text NOT NULL,
	`kind` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`subject`) REFERENCES `accounts`(`subject`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scan_id`) REFERENCES `x1_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `x1_scan_events_owner` ON `x1_scan_events` (`subject`,`scan_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `x1_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`request_key` text NOT NULL,
	`mode` text NOT NULL,
	`name` text NOT NULL,
	`payload` text NOT NULL,
	`digest` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`subject`) REFERENCES `accounts`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x1_scan_retry` ON `x1_scans` (`subject`,`request_key`);--> statement-breakpoint
CREATE INDEX `x1_scans_owner` ON `x1_scans` (`subject`,`created_at`,`id`);