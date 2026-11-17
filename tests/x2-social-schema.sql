CREATE TABLE `x2_blocks` (
	`subject` text NOT NULL,
	`target` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`subject`, `target`),
	FOREIGN KEY (`subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `x2_block_reverse` ON `x2_blocks` (`target`,`subject`);--> statement-breakpoint
CREATE TABLE `x2_bookmarks` (
	`subject` text NOT NULL,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`subject`, `kind`, `target_id`),
	FOREIGN KEY (`subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `x2_conversation_views` (
	`conversation_id` text NOT NULL,
	`subject` text NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`muted` integer DEFAULT 0 NOT NULL,
	`read_at` text,
	PRIMARY KEY(`conversation_id`, `subject`),
	FOREIGN KEY (`conversation_id`) REFERENCES `x2_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `x2_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`first_subject` text NOT NULL,
	`second_subject` text NOT NULL,
	`requested_by` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`first_subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`second_subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x2_conversation_pair` ON `x2_conversations` (`first_subject`,`second_subject`);--> statement-breakpoint
CREATE INDEX `x2_conversation_first` ON `x2_conversations` (`first_subject`,`updated_at`);--> statement-breakpoint
CREATE INDEX `x2_conversation_second` ON `x2_conversations` (`second_subject`,`updated_at`);--> statement-breakpoint
CREATE TABLE `x2_discussions` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`parent_id` text,
	`author` text NOT NULL,
	`content` text NOT NULL,
	`source_url` text,
	`source_as_of` text,
	`request_key` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`group_id`) REFERENCES `x1_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x2_discussion_retry` ON `x2_discussions` (`group_id`,`author`,`request_key`);--> statement-breakpoint
CREATE INDEX `x2_discussion_group_time` ON `x2_discussions` (`group_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `x2_group_directory` (
	`group_id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`discoverable` integer DEFAULT 0 NOT NULL,
	`pinned_soul` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `x1_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pinned_soul`) REFERENCES `x1_group_souls`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x2_group_handle_unique` ON `x2_group_directory` (`handle`);--> statement-breakpoint
CREATE TABLE `x2_join_requests` (
	`group_id` text NOT NULL,
	`subject` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`group_id`, `subject`),
	FOREIGN KEY (`group_id`) REFERENCES `x1_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `x2_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender` text NOT NULL,
	`content` text NOT NULL,
	`request_key` text NOT NULL,
	`reference_soul` text,
	`reference_revision` integer,
	`created_at` text NOT NULL,
	`edited_at` text,
	`retracted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `x2_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x2_message_retry` ON `x2_messages` (`conversation_id`,`sender`,`request_key`);--> statement-breakpoint
CREATE INDEX `x2_message_thread_time` ON `x2_messages` (`conversation_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `x2_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`event_key` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x2_notification_event` ON `x2_notifications` (`subject`,`event_key`);--> statement-breakpoint
CREATE INDEX `x2_notification_owner_time` ON `x2_notifications` (`subject`,`created_at`);--> statement-breakpoint
CREATE TABLE `x2_social_preferences` (
	`subject` text PRIMARY KEY NOT NULL,
	`discoverable` integer DEFAULT 0 NOT NULL,
	`messages` text DEFAULT 'REQUESTS' NOT NULL,
	`receipts` integer DEFAULT 0 NOT NULL,
	`notifications` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`subject`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `x2_social_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter` text NOT NULL,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`reporter`) REFERENCES `x1_bodies`(`subject`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `x2_report_author` ON `x2_social_reports` (`reporter`,`created_at`);