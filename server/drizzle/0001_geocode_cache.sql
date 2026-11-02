CREATE TABLE `geocode_cache` (
	`query` text PRIMARY KEY NOT NULL,
	`source` text,
	`results` text NOT NULL,
	`created_at` text NOT NULL
);
