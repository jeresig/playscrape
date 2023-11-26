import {sql, InferModel} from "drizzle-orm";
import {sqliteTable, text, integer} from "drizzle-orm/sqlite-core";

export const records = sqliteTable("records", {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    action: text("action").notNull(),
    content: text("content"),
    cookies: text("cookies"),
    extracted: text("extracted"),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
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

export type Record = InferModel<typeof records, "select">;
export type NewRecord = InferModel<typeof records, "insert">;

export type Download = InferModel<typeof downloads, "select">;
export type NewDownload = InferModel<typeof downloads, "insert">;
