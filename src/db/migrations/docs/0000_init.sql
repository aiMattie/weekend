CREATE TABLE `doc_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`doc_id` text NOT NULL,
	`block_id` text,
	`parent_id` text,
	`user_id` text,
	`body` text NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`doc_id`) REFERENCES `docs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `doc_comments_doc_idx` ON `doc_comments` (`doc_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `doc_members` (
	`doc_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	PRIMARY KEY(`doc_id`, `user_id`),
	FOREIGN KEY (`doc_id`) REFERENCES `docs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `doc_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`doc_id` text NOT NULL,
	`title` text NOT NULL,
	`blocks` text NOT NULL,
	`user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`doc_id`) REFERENCES `docs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `doc_versions_doc_idx` ON `doc_versions` (`doc_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `docs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`item_id` text,
	`board_id` text,
	`column_id` text,
	`title` text DEFAULT 'Naamloos document' NOT NULL,
	`blocks` text DEFAULT '{"type":"doc","content":[]}' NOT NULL,
	`cover` text,
	`icon` text,
	`visibility` text DEFAULT 'main' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`owner_id` text,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `docs_ws_idx` ON `docs` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `docs_item_idx` ON `docs` (`item_id`);--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`to_user_id` text,
	`to_email` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`kind` text DEFAULT 'digest' NOT NULL,
	`sent_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `email_outbox_user_idx` ON `email_outbox` (`to_user_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `email_outbox_id_uq` ON `email_outbox` (`id`);--> statement-breakpoint
CREATE TABLE `notification_bookmarks` (
	`notification_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`notification_id`, `user_id`),
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notification_settings` (
	`user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`in_app` integer DEFAULT true NOT NULL,
	`email` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`user_id`, `event_type`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `whiteboards` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text DEFAULT 'Nieuw whiteboard' NOT NULL,
	`data` text DEFAULT '{"elements":[]}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`owner_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `whiteboards_ws_idx` ON `whiteboards` (`workspace_id`);