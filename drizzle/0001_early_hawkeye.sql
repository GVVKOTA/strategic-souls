ALTER TABLE `ownership` ADD `semantic_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `owner_semantic_unique` ON `ownership` (`subject`,`semantic_key`);