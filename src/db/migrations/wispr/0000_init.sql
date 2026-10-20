CREATE TABLE `wispr_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`client_id` text,
	`redirect_uri` text,
	`access_token` text,
	`refresh_token` text,
	`expires_at` text,
	`pending_state` text,
	`pending_verifier` text,
	`pending_at` text,
	`label` text,
	`connected_at` text,
	`last_sync_at` text,
	`last_error` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `wispr_meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`started_at` text,
	`attendees` text DEFAULT '[]' NOT NULL,
	`preview` text DEFAULT '' NOT NULL,
	`calendar_id` text,
	`status` text DEFAULT 'new' NOT NULL,
	`workspace_id` text,
	`board_id` text,
	`item_id` text,
	`meeting_id` text,
	`doc_id` text,
	`saved_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wispr_meetings_ext_uq` ON `wispr_meetings` (`user_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `wispr_meetings_user_idx` ON `wispr_meetings` (`user_id`,`started_at`);