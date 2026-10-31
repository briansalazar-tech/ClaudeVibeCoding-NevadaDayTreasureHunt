CREATE TABLE `markers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'to-check' NOT NULL,
	`layer` text DEFAULT 'custom' NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
