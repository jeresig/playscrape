import {
    type InferInsertModel,
    type InferSelectModel,
    relations,
    sql,
} from "drizzle-orm";
import {index, integer, sqliteTable, text} from "drizzle-orm/sqlite-core";

export const records = sqliteTable(
    "records",
    {
        id: text("id").primaryKey(),
        source: text("source").notNull(),
        url: text("url").notNull(),
        action: text("action").notNull(),
        content: text("content").notNull(),
        cookies: text("cookies"),
        extracted: text("extracted", {mode: "json"}).notNull(),
        created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
        updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
        scraped_at: text("scraped_at").default(sql`CURRENT_TIMESTAMP`),
    },
    (records) => ({
        sourceIndex: index("source_index").on(records.source),
        updatedIndex: index("updated_index").on(records.updated_at),
    }),
);

export const recordsRelations = relations(records, ({many}) => ({
    downloads: many(downloads),
}));

export const downloads = sqliteTable(
    "downloads",
    {
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
    },
    (downloads) => ({
        recordIdIndex: index("record_id_index").on(downloads.recordId),
    }),
);

export const downloadsRelations = relations(downloads, ({one}) => ({
    record: one(records, {
        fields: [downloads.recordId],
        references: [records.id],
    }),
}));

export const scrapes = sqliteTable(
    "scrapes",
    {
        id: integer("id", {mode: "number"}).primaryKey(),
        source: text("source").notNull(),
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
    },
    (scrapes) => ({
        sourceIndex: index("source_index").on(scrapes.source),
    }),
);

export const scrapesRelations = relations(scrapes, ({many}) => ({
    scrapeRecords: many(scrapeRecords),
}));

export const scrapeRecords = sqliteTable(
    "scrape_records",
    {
        id: integer("id", {mode: "number"}).primaryKey(),
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
    },
    (scrapeRecords) => ({
        scrapeIdIndex: index("scrape_id_index").on(scrapeRecords.scrapeId),
    }),
);

export const scrapeRecordsRelations = relations(scrapeRecords, ({one}) => ({
    scrape: one(scrapes, {
        fields: [scrapeRecords.scrapeId],
        references: [scrapes.id],
    }),

    record: one(records, {
        fields: [scrapeRecords.recordId],
        references: [records.id],
    }),
}));

export type Record = InferSelectModel<typeof records>;
export type NewRecord = InferInsertModel<typeof records>;

export type Download = InferSelectModel<typeof downloads>;
export type NewDownload = InferInsertModel<typeof downloads>;

export type Scrape = InferSelectModel<typeof scrapes>;
export type NewScrape = InferInsertModel<typeof scrapes>;

export type ScrapeRecord = InferSelectModel<typeof scrapeRecords>;
export type NewScrapeRecord = InferInsertModel<typeof scrapeRecords>;
