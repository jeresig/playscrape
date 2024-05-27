CREATE TABLE IF NOT EXISTS "downloads" (
	"id" text PRIMARY KEY NOT NULL,
	"recordId" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"file_size" integer,
	"file_name" text NOT NULL,
	"orig_format" text,
	"orig_url" text NOT NULL,
	"orig_cookies" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "records" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"action" text NOT NULL,
	"content" text NOT NULL,
	"cookies" text,
	"extracted" json NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"scraped_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scrape_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"scrapeId" integer NOT NULL,
	"recordId" text,
	"status" text NOT NULL,
	"status_text" text,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scrapes" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"total_records" integer DEFAULT 0 NOT NULL,
	"created_records" integer DEFAULT 0 NOT NULL,
	"no_changes_records" integer DEFAULT 0 NOT NULL,
	"updated_records" integer DEFAULT 0 NOT NULL,
	"failed_records" integer DEFAULT 0 NOT NULL,
	"status_text" text,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "downloads_record_id_index" ON "downloads" ("recordId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "records_source_index" ON "records" ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "records_updated_index" ON "records" ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scrape_records_scrape_id_index" ON "scrape_records" ("scrapeId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scrapes_source_index" ON "scrapes" ("source");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "downloads" ADD CONSTRAINT "downloads_recordId_records_id_fk" FOREIGN KEY ("recordId") REFERENCES "records"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scrape_records" ADD CONSTRAINT "scrape_records_scrapeId_scrapes_id_fk" FOREIGN KEY ("scrapeId") REFERENCES "scrapes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scrape_records" ADD CONSTRAINT "scrape_records_recordId_records_id_fk" FOREIGN KEY ("recordId") REFERENCES "records"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
