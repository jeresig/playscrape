CREATE TABLE `downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`recordId` text NOT NULL,
	`width` integer NOT NULL,
	`file_size` integer,
	`file_name` text NOT NULL,
	`orig_format` text,
	`orig_url` text NOT NULL,
	`orig_cookies` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`recordId`) REFERENCES `records`(`id`)
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`action` text NOT NULL,
	`content` text,
	`cookies` text,
	`extracted` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
