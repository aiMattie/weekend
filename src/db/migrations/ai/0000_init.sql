CREATE TABLE `agent_knowledge` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text NOT NULL,
	`access` text DEFAULT 'read' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_knowledge_uq` ON `agent_knowledge` (`agent_id`,`kind`,`ref_id`);--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`account_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`trigger_type` text DEFAULT 'manual' NOT NULL,
	`trigger` text DEFAULT '{}' NOT NULL,
	`started_by` text,
	`transcript` text DEFAULT '[]' NOT NULL,
	`tool_calls` text DEFAULT '[]' NOT NULL,
	`result` text,
	`error` text,
	`steps` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`chain` text DEFAULT '[]' NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_runs_agent_idx` ON `agent_runs` (`agent_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_runs_account_idx` ON `agent_runs` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`name` text NOT NULL,
	`instruction` text DEFAULT '' NOT NULL,
	`tools` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_skills_agent_idx` ON `agent_skills` (`agent_id`);--> statement-breakpoint
CREATE TABLE `agent_triggers` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`type` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_fired_key` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_triggers_agent_idx` ON `agent_triggers` (`agent_id`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`avatar` text DEFAULT '#a25ddc' NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`model` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`owner_id` text,
	`user_id` text,
	`owns_user` integer DEFAULT false NOT NULL,
	`template_key` text,
	`max_steps` integer DEFAULT 8 NOT NULL,
	`max_tokens` integer DEFAULT 20000 NOT NULL,
	`max_runs_per_hour` integer DEFAULT 30 NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agents_account_idx` ON `agents` (`account_id`,`state`);--> statement-breakpoint
CREATE TABLE `ai_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT 'Nieuw gesprek' NOT NULL,
	`context` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_conv_user_idx` ON `ai_conversations` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`kind` text DEFAULT 'text' NOT NULL,
	`content` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_msg_conv_idx` ON `ai_messages` (`conversation_id`,`seq`);--> statement-breakpoint
CREATE TABLE `ai_pending_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`input` text NOT NULL,
	`summary` text NOT NULL,
	`preview` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`error` text,
	`created_at` text NOT NULL,
	`decided_at` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_pending_conv_idx` ON `ai_pending_actions` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_settings` (
	`account_id` text PRIMARY KEY NOT NULL,
	`account_monthly_credits` integer,
	`user_monthly_credits` integer,
	`agents_enabled` integer DEFAULT true NOT NULL,
	`ai_enabled` integer DEFAULT true NOT NULL,
	`model` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`user_id` text,
	`source` text NOT NULL,
	`ref_id` text,
	`model` text DEFAULT '' NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_usage_account_idx` ON `ai_usage` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_user_idx` ON `ai_usage` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`title` text NOT NULL,
	`held_at` text NOT NULL,
	`workspace_id` text,
	`client_name` text,
	`attendees` text DEFAULT '[]' NOT NULL,
	`transcript` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`decisions` text DEFAULT '[]' NOT NULL,
	`action_items` text DEFAULT '[]' NOT NULL,
	`method` text DEFAULT 'fallback' NOT NULL,
	`doc_id` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `meetings_account_idx` ON `meetings` (`account_id`,`held_at`);