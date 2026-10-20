CREATE TABLE `form_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`column_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`required` integer DEFAULT false NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `form_questions_form_idx` ON `form_questions` (`form_id`,`position`);--> statement-breakpoint
CREATE TABLE `form_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`item_id` text,
	`user_id` text,
	`ip_hash` text,
	`answers` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `form_submissions_form_idx` ON `form_submissions` (`form_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `form_submissions_user_idx` ON `form_submissions` (`form_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `forms` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`board_id` text NOT NULL,
	`group_id` text,
	`name` text NOT NULL,
	`token` text NOT NULL,
	`is_published` integer DEFAULT false NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forms_token_uq` ON `forms` (`token`);--> statement-breakpoint
CREATE INDEX `forms_board_idx` ON `forms` (`board_id`);--> statement-breakpoint
CREATE INDEX `forms_ws_idx` ON `forms` (`workspace_id`);