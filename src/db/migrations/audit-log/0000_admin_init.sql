CREATE TABLE `account_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`base_role` text DEFAULT 'member' NOT NULL,
	`capabilities` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_roles_account_idx` ON `account_roles` (`account_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`actor_email` text,
	`event` text NOT NULL,
	`category` text DEFAULT 'admin' NOT NULL,
	`target_type` text,
	`target_id` text,
	`target_name` text,
	`details` text DEFAULT '{}' NOT NULL,
	`ip` text,
	`user_agent` text,
	`source` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_account_created_idx` ON `audit_log` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_event_idx` ON `audit_log` (`account_id`,`event`);--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_log` (`actor_id`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`recovery` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`revoked_reason` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `board_permissions` (
	`board_id` text PRIMARY KEY NOT NULL,
	`level` text DEFAULT 'edit_all' NOT NULL,
	`guest_view_ids` text,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `column_permissions` (
	`column_id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`edit` text DEFAULT '{"mode":"everyone","userIds":[],"teamIds":[]}' NOT NULL,
	`view` text DEFAULT '{"mode":"everyone","userIds":[],"teamIds":[]}' NOT NULL,
	FOREIGN KEY (`column_id`) REFERENCES `columns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `column_permissions_board_idx` ON `column_permissions` (`board_id`);--> statement-breakpoint
CREATE TABLE `guest_grants` (
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `workspace_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`role` text DEFAULT 'member' NOT NULL,
	`custom_role_id` text,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by` text,
	`workspace_id` text,
	`board_ids` text DEFAULT '[]' NOT NULL,
	`board_role` text DEFAULT 'viewer' NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`accepted_user_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitations_account_idx` ON `invitations` (`account_id`,`status`);--> statement-breakpoint
CREATE TABLE `recent_searches` (
	`user_id` text NOT NULL,
	`query` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recent_searches_uq` ON `recent_searches` (`user_id`,`query`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `account_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_security` (
	`user_id` text PRIMARY KEY NOT NULL,
	`totp_secret` text,
	`totp_enabled` integer DEFAULT false NOT NULL,
	`recovery_codes` text DEFAULT '[]' NOT NULL,
	`last_totp_step` integer,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`password_changed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspace_permissions` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`create_boards` text DEFAULT 'members' NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
