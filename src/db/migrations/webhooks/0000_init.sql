CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`board_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`token` text,
	`active` integer DEFAULT true NOT NULL,
	`last_event_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_token_unique` ON `integrations` (`token`);--> statement-breakpoint
CREATE INDEX `integrations_account_idx` ON `integrations` (`account_id`,`kind`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint_id` text NOT NULL,
	`event` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`response_status` integer,
	`response_body` text,
	`error` text,
	`delivered_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`endpoint_id`) REFERENCES `webhook_endpoints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webhook_deliveries_endpoint_idx` ON `webhook_deliveries` (`endpoint_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `webhook_deliveries_due_idx` ON `webhook_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `webhook_endpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`board_id` text,
	`url` text NOT NULL,
	`events` text DEFAULT '["*"]' NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`secret` text NOT NULL,
	`description` text,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `webhook_endpoints_account_idx` ON `webhook_endpoints` (`account_id`,`board_id`);