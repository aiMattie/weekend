CREATE TABLE `dashboards` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`board_ids` text DEFAULT '[]' NOT NULL,
	`filters` text DEFAULT '[]' NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`visibility` text DEFAULT 'main' NOT NULL,
	`member_ids` text DEFAULT '[]' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`owner_id` text,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `dashboards_ws_idx` ON `dashboards` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `widgets` (
	`id` text PRIMARY KEY NOT NULL,
	`dashboard_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`layout` text DEFAULT '{"x":0,"y":0,"w":6,"h":4}' NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`dashboard_id`) REFERENCES `dashboards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `widgets_dashboard_idx` ON `widgets` (`dashboard_id`);