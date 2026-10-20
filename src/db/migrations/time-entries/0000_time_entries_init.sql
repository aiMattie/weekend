CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`board_id` text NOT NULL,
	`user_id` text,
	`date` text NOT NULL,
	`minutes` integer NOT NULL,
	`description` text,
	`billable` integer DEFAULT true NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`synced_item_id` text,
	`synced_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `time_entries_item_idx` ON `time_entries` (`item_id`,`date`);--> statement-breakpoint
CREATE INDEX `time_entries_user_idx` ON `time_entries` (`user_id`,`date`);