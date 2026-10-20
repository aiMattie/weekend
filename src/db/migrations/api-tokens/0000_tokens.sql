CREATE TABLE `api_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`token_id` text,
	`user_id` text,
	`channel` text NOT NULL,
	`name` text NOT NULL,
	`ok` integer DEFAULT true NOT NULL,
	`error` text,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`detail` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_calls_created_idx` ON `api_calls` (`created_at`);--> statement-breakpoint
CREATE INDEX `api_calls_token_idx` ON `api_calls` (`token_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`scopes` text DEFAULT '["read","write"]' NOT NULL,
	`workspace_ids` text,
	`daily_budget` integer,
	`last_used_at` text,
	`expires_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_tokens_user_idx` ON `api_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `api_usage` (
	`token_id` text NOT NULL,
	`day` text NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`token_id`, `day`)
);
