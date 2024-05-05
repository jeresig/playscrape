CREATE TABLE `scrape_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
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
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
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
--> statement-breakpoint
/*
 SQLite does not support "Dropping foreign key" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
/*
 SQLite does not support "Set autoincrement to a column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html
                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
/*
 SQLite does not support "Set default to column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html
                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
ALTER TABLE records ADD `scraped_at` text DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
/*
 SQLite does not support "Creating foreign key on existing column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html

 Due to that we don't generate migration automatically and it has to be done manually
*/