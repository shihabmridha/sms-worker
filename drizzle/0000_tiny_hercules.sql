CREATE TABLE `admins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admins_username_unique` ON `admins` (`username`);--> statement-breakpoint
CREATE TABLE `app_providers` (
	`app_id` integer NOT NULL,
	`provider` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer NOT NULL,
	PRIMARY KEY(`app_id`, `provider`)
);
--> statement-breakpoint
CREATE TABLE `apps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apps_name_unique` ON `apps` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `apps_key_hash_unique` ON `apps` (`key_hash`);--> statement-breakpoint
CREATE TABLE `job_chunks` (
	`job_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	PRIMARY KEY(`job_id`, `chunk_index`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` integer NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`body` text,
	`template_id` integer,
	`masking_profile` text,
	`total` integer DEFAULT 0 NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`chunks_done` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `masking_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` integer NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`sender_id` text,
	`sender_name` text,
	`username` text,
	`api_key_enc` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `masking_profiles_app_provider_label_unique` ON `masking_profiles` (`app_id`,`provider`,`label`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`app_id` integer NOT NULL,
	`recipient` text NOT NULL,
	`body` text,
	`provider` text,
	`status` text NOT NULL,
	`reason` text,
	`tracking_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_app_created_idx` ON `messages` (`app_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_job_idx` ON `messages` (`job_id`);--> statement-breakpoint
CREATE INDEX `messages_created_idx` ON `messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `provider_settings` (
	`provider` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer NOT NULL,
	`sender_id` text,
	`api_key_enc` text,
	`username` text,
	`sender_name` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` integer NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `templates_app_name_unique` ON `templates` (`app_id`,`name`);