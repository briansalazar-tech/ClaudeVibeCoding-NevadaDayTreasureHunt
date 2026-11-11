CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`actor_id` integer,
	`action` text NOT NULL,
	`target_id` integer,
	`detail` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` integer NOT NULL,
	`body` text NOT NULL,
	`created_by` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_target` ON `comments` (`target_kind`,`target_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer NOT NULL,
	`temporary_expires_at` text,
	`disabled_at` text,
	`removed_at` text,
	`last_sign_in_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
ALTER TABLE `markers` ADD `created_by` integer;--> statement-breakpoint
ALTER TABLE `pages` ADD `created_by` integer;--> statement-breakpoint
ALTER TABLE `pages` ADD `updated_by` integer;--> statement-breakpoint
ALTER TABLE `pages` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `created_by` integer;--> statement-breakpoint
ALTER TABLE `place_notes` ADD `created_by` integer;