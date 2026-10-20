CREATE TABLE `git_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`secret` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_event_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `git_integrations_account_idx` ON `git_integrations` (`account_id`,`provider`);--> statement-breakpoint
CREATE TABLE `git_links` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`item_id` text NOT NULL,
	`board_id` text NOT NULL,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`repo` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`url` text,
	`author` text,
	`state` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_links_uq` ON `git_links` (`item_id`,`provider`,`repo`,`kind`,`external_id`);--> statement-breakpoint
CREATE INDEX `git_links_item_idx` ON `git_links` (`item_id`);--> statement-breakpoint
CREATE TABLE `retro_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `retro_votes_uq` ON `retro_votes` (`item_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `sprint_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`item_id` text NOT NULL,
	`board_id` text NOT NULL,
	`added_at` text NOT NULL,
	`removed_at` text,
	`added_after_start` integer DEFAULT false NOT NULL,
	`points` real DEFAULT 0 NOT NULL,
	`started_at` text,
	`done_at` text,
	`outcome` text,
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sprint_items_sprint_idx` ON `sprint_items` (`sprint_id`);--> statement-breakpoint
CREATE INDEX `sprint_items_item_idx` ON `sprint_items` (`item_id`);--> statement-breakpoint
CREATE TABLE `sprints` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`item_id` text,
	`name` text NOT NULL,
	`goal` text,
	`state` text DEFAULT 'planned' NOT NULL,
	`starts_on` text,
	`ends_on` text,
	`started_at` text,
	`completed_at` text,
	`committed` text,
	`result` text,
	`settings` text DEFAULT '{}' NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sprints_board_idx` ON `sprints` (`board_id`,`position`);