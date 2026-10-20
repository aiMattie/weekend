CREATE TABLE `recent_boards` (
	`user_id` text NOT NULL,
	`board_id` text NOT NULL,
	`visited_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `board_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recent_boards_user_idx` ON `recent_boards` (`user_id`,`visited_at`);--> statement-breakpoint
CREATE TABLE `undo_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`undo_ops` text DEFAULT '[]' NOT NULL,
	`redo_ops` text DEFAULT '[]' NOT NULL,
	`undone` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `undo_board_user_idx` ON `undo_entries` (`board_id`,`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `update_reads` (
	`update_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`update_id`, `user_id`),
	FOREIGN KEY (`update_id`) REFERENCES `updates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
