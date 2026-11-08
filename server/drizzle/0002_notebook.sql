CREATE TABLE `links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_kind` text NOT NULL,
	`source_id` integer NOT NULL,
	`target_key` text NOT NULL,
	`target_title` text NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `links_target_key` ON `links` (`target_key`);--> statement-breakpoint
CREATE INDEX `links_source` ON `links` (`source_kind`,`source_id`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`title_key` text NOT NULL,
	`type` text DEFAULT 'note' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`place_id` text,
	`place_layer` text,
	`place_name` text,
	`place_lng` real,
	`place_lat` real,
	`spot_lng` real,
	`spot_lat` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_title_key` ON `pages` (`title_key`);--> statement-breakpoint
CREATE INDEX `pages_place_id` ON `pages` (`place_id`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer,
	`place_id` text,
	`place_layer` text,
	`place_name` text,
	`place_lng` real,
	`place_lat` real,
	`file` text NOT NULL,
	`content_type` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photos_page_id` ON `photos` (`page_id`);--> statement-breakpoint
CREATE INDEX `photos_place_id` ON `photos` (`place_id`);--> statement-breakpoint
CREATE TABLE `place_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`place_id` text NOT NULL,
	`place_layer` text NOT NULL,
	`place_name` text NOT NULL,
	`place_lng` real NOT NULL,
	`place_lat` real NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `place_notes_place_id` ON `place_notes` (`place_id`);