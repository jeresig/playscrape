CREATE TABLE `downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`recordId` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`file_size` integer,
	`file_name` text NOT NULL,
	`orig_format` text,
	`orig_url` text NOT NULL,
	`orig_cookies` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`recordId`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`action` text NOT NULL,
	`content` text,
	`cookies` text,
	`extracted` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`scraped_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `scrape_records` (
	`id` integer PRIMARY KEY NOT NULL,
	`scrapeId` integer NOT NULL,
	`recordId` text,
	`status` text NOT NULL,
	`status_text` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP,
	`ended_at` text,
	FOREIGN KEY (`scrapeId`) REFERENCES `scrapes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recordId`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scrapes` (
	`id` integer PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`total_records` integer DEFAULT 0 NOT NULL,
	`created_records` integer DEFAULT 0 NOT NULL,
	`no_changes_records` integer DEFAULT 0 NOT NULL,
	`updated_records` integer DEFAULT 0 NOT NULL,
	`failed_records` integer DEFAULT 0 NOT NULL,
	`status_text` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP,
	`ended_at` text
);
