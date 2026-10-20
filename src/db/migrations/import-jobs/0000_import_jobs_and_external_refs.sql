CREATE TABLE `external_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_refs_source_ext_uq` ON `external_refs` (`source`,`entity_type`,`external_id`);--> statement-breakpoint
CREATE INDEX `external_refs_entity_idx` ON `external_refs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`mode` text DEFAULT 'dry_run' NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`options` text DEFAULT '{}' NOT NULL,
	`counts` text DEFAULT '{}' NOT NULL,
	`report` text DEFAULT '{}' NOT NULL,
	`error` text,
	`started_by` text,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`started_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `import_jobs_account_idx` ON `import_jobs` (`account_id`,`created_at`);