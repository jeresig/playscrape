import {type InferInsertModel, type InferSelectModel, sql} from "drizzle-orm";
import {integer, sqliteTable, text} from "drizzle-orm/sqlite-core";

export const records = sqliteTable("records", {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    action: text("action").notNull(),
    content: text("content"),
    cookies: text("cookies"),
    extracted: text("extracted", {mode: "json"}),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
    scraped_at: text("scraped_at").default(sql`CURRENT_TIMESTAMP`),
});

export const downloads = sqliteTable("downloads", {
    id: text("id").primaryKey(),
    recordId: text("recordId")
        .references(() => records.id)
        .notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    file_size: integer("file_size"),
    file_name: text("file_name").notNull(),
    orig_format: text("orig_format"),
    orig_url: text("orig_url").notNull(),
    orig_cookies: text("orig_cookies"),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const scrapes = sqliteTable("scrapes", {
    id: integer("id", {mode: "number"}).primaryKey({autoIncrement: true}),
    status: text("status", {
        enum: ["running", "completed", "failed"],
    }).notNull(),
    total_records: integer("total_records").notNull().default(0),
    created_records: integer("created_records").notNull().default(0),
    no_changes_records: integer("no_changes_records").notNull().default(0),
    updated_records: integer("updated_records").notNull().default(0),
    failed_records: integer("failed_records").notNull().default(0),
    statusText: text("status_text"),
    started_at: text("started_at").default(sql`CURRENT_TIMESTAMP`),
    ended_at: text("ended_at"),
});

export const scrapeRecords = sqliteTable("scrape_records", {
    id: integer("id", {mode: "number"}).primaryKey({autoIncrement: true}),
    scrapeId: integer("scrapeId")
        .references(() => scrapes.id)
        .notNull(),
    recordId: text("recordId").references(() => records.id),
    status: text("status", {
        enum: ["running", "created", "noChanges", "updated", "failed"],
    }).notNull(),
    statusText: text("status_text"),
    started_at: text("started_at").default(sql`CURRENT_TIMESTAMP`),
    ended_at: text("ended_at"),
});

export type Record = InferSelectModel<typeof records>;
export type NewRecord = InferInsertModel<typeof records>;

export type Download = InferSelectModel<typeof downloads>;
export type NewDownload = InferInsertModel<typeof downloads>;

export type Scrape = InferSelectModel<typeof scrapes>;
export type NewScrape = InferInsertModel<typeof scrapes>;

export type ScrapeRecord = InferSelectModel<typeof scrapeRecords>;
export type NewScrapeRecord = InferInsertModel<typeof scrapeRecords>;
