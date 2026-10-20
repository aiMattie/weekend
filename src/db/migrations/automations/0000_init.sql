CREATE TABLE `automation_fired` (
	`automation_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`automation_id`, `dedupe_key`),
	FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`account_id` text NOT NULL,
	`board_id` text,
	`item_id` text,
	`status` text DEFAULT 'running' NOT NULL,
	`error` text,
	`attempt` integer DEFAULT 1 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`pc` integer DEFAULT 0 NOT NULL,
	`next_retry_at` text,
	`depth` integer DEFAULT 0 NOT NULL,
	`origin_id` text,
	`chain` text DEFAULT '[]' NOT NULL,
	`trigger` text NOT NULL,
	`snapshot` text DEFAULT '[]' NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`approval` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `automation_runs_auto_idx` ON `automation_runs` (`automation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `automation_runs_board_idx` ON `automation_runs` (`board_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `automation_runs_account_idx` ON `automation_runs` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `automation_runs_retry_idx` ON `automation_runs` (`status`,`next_retry_at`);--> statement-breakpoint
CREATE TABLE `automations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`board_id` text,
	`name` text NOT NULL,
	`description` text,
	`kind` text DEFAULT 'automation' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`definition` text NOT NULL,
	`graph` text DEFAULT '{}' NOT NULL,
	`recipe_id` text,
	`run_count` integer DEFAULT 0 NOT NULL,
	`last_run_at` text,
	`state` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `automations_board_idx` ON `automations` (`board_id`,`state`);--> statement-breakpoint
CREATE INDEX `automations_account_idx` ON `automations` (`account_id`,`state`);