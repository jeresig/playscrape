import {eq, sql} from "drizzle-orm";
import {colorize} from "json-colorizer";
import * as jsonDiff from "json-diff";
import ora from "ora";

import {initDB} from "../../shared/db.js";
import type {NewRecord, Record} from "../../shared/schema.js";
import {records, scrapeRecords} from "../../shared/schema.js";
import type {
    ExtractAction,
    InternalOptions,
    Playscrape,
} from "../../shared/types.js";
import {hash} from "../../shared/utils.js";
import {testRecord} from "../test.js";
import {getDomQuery} from "./dom-query.js";
import {downloadImages} from "./downloads.js";

export const handleExtract = async ({
    action,
    content,
    url,
    actionName,
    cookies,
    playscrape,
    options,
    oldRecord,
}: {
    action: ExtractAction;
    content: string;
    url: string;
    actionName: string;
    cookies: string;
    playscrape: Playscrape;
    options: InternalOptions;
    oldRecord?: Record;
}) => {
    const {indent, dryRun, test} = options;
    const {db} = playscrape;

    if (!action || !action.extract) {
        return false;
    }

    const extractSpinner = ora({
        text: "Extracting data...",
        indent,
    }).start();

    if (oldRecord) {
        playscrape.currentRecordId = oldRecord.id;
    }

    startRecordScrape({playscrape, options});

    try {
        const domQuery = getDomQuery(content);

        const extracted = await action.extract({
            ...domQuery,
            url,
            content,
        });

        if (!extracted) {
            endRecordScrape({
                playscrape,
                options,
                status: "failed",
                statusText: "No data extracted.",
            });
            extractSpinner.warn("No data extracted.");
            return false;
        }

        const extractedRecords = Array.isArray(extracted)
            ? extracted
            : [extracted];

        extractSpinner.succeed(
            `Extracted ${extractedRecords.length} record(s).`,
        );

        for (const extracted of extractedRecords) {
            const record: NewRecord = {
                id: extracted.id || hash(extracted.url || url),
                url: extracted.url || url,
                action: actionName,
                content,
                cookies,
                extracted,
            };

            playscrape.currentRecordId = record.id;

            if (!playscrape.currentRecordScrapeId) {
                startRecordScrape({playscrape, options});
            }

            // Download the images first, so that we don't save the record
            // if the images fail to download.
            await downloadImages({
                ...domQuery,
                action,
                record,
                url,
                content,
                cookies,
                playscrape,
                options,
            });

            const saveSpinner = ora({text: "Saving record...", indent}).start();

            let status: "created" | "noChanges" | "updated" = "created";
            let statusText: string | undefined;

            if (dryRun) {
                if (oldRecord) {
                    if (oldRecord.id !== record.id) {
                        console.log(
                            `DRY RUN: Record ID changed. (old: ${oldRecord.id}, new: ${record.id})`,
                        );
                    }
                    if (oldRecord.extracted !== record.extracted) {
                        const diff = jsonDiff.diffString(
                            oldRecord.extracted,
                            extracted,
                        );
                        console.log(`DRY RUN: Data updated for ${record.id}`);
                        console.log(diff);
                    }
                } else {
                    console.log("DRY RUN: Record would be saved here.");
                    console.log(colorize(record));
                }
            } else if (test) {
                await testRecord({id: record.id, extracted, options});
                saveSpinner.succeed("Record tested.");
            } else {
                if (oldRecord) {
                    const updated =
                        oldRecord &&
                        JSON.stringify(oldRecord.extracted) !==
                            JSON.stringify(record.extracted);

                    if (updated) {
                        console.warn(`Data updated for ${record.id}`);
                        console.log(
                            jsonDiff.diffString(oldRecord.extracted, extracted),
                        );
                        statusText = jsonDiff.diffString(
                            oldRecord.extracted,
                            extracted,
                            {color: false},
                        );
                    }

                    status = updated ? "updated" : "noChanges";
                }

                await db
                    .insert(records)
                    .values(record)
                    .onConflictDoUpdate({
                        target: records.id,
                        set: {
                            action: actionName,
                            url,
                            cookies,
                            extracted: record.extracted,
                            scraped_at: sql`CURRENT_TIMESTAMP`,
                            ...(status === "updated"
                                ? {updated_at: sql`CURRENT_TIMESTAMP`}
                                : {}),
                        },
                    });

                if (oldRecord && oldRecord.id !== record.id) {
                    console.log(
                        `Record ID changed. (old: ${oldRecord.id}, new: ${record.id})`,
                    );
                    await db
                        .delete(records)
                        .where(eq(records.id, oldRecord.id));
                }

                saveSpinner.succeed("Saved record.");
            }

            endRecordScrape({
                playscrape,
                options,
                status,
                statusText,
            });
        }
    } catch (e) {
        endRecordScrape({
            playscrape,
            options,
            status: "failed",
            statusText: e.message,
        });

        extractSpinner.fail(`Failed to extract data from ${url}.`);
        console.error(e);
        return false;
    }

    return true;
};

export const reExtractData = async ({
    options,
    actions,
}: {
    actions: {
        [actionName: string]: ExtractAction;
    };
    options: InternalOptions;
}) => {
    const db = initDB({
        debug: options.debug,
        dbName: options.dbName,
    });

    const spinner = ora("Re-extracting records...").start();

    let numUpdated = 0;

    const results = await db.select().from(records);

    for (const result of results) {
        const {id, url, action: actionName, content, cookies} = result;
        const action = actions[actionName];

        if (!action) {
            console.warn(`No action found for ${actionName}. Skipping.`);
            continue;
        }

        if (!content) {
            console.warn(`No contents found for ${id}. Skipping.`);
            continue;
        }

        const playscrape: Playscrape = {
            db,
        };

        await handleExtract({
            action,
            content,
            url,
            actionName,
            cookies: cookies || "",
            playscrape,
            options,
            oldRecord: result,
        });

        numUpdated += 1;
    }

    spinner.succeed(`Re-extracted ${numUpdated} record(s).`);
};

export const startRecordScrape = async ({
    playscrape,
    options,
}: {playscrape: Playscrape; options: InternalOptions}) => {
    if (options.test) {
        return;
    }

    if (!playscrape.currentScrapeId || !playscrape.currentRecordId) {
        console.error("Scrape has not started yet.");
        process.exit(1);
    }

    if (options.dryRun) {
        playscrape.currentRecordScrapeId = 1;
        return;
    }

    const [result] = await playscrape.db
        .insert(scrapeRecords)
        .values({
            status: "running",
            scrapeId: playscrape.currentScrapeId,
            recordId: playscrape.currentRecordId,
        })
        .returning({id: scrapeRecords.id});

    if (!result?.id) {
        console.error("Failed to start record scrape.");
        process.exit(1);
    }

    playscrape.currentRecordScrapeId = result.id;
};

export const endRecordScrape = async ({
    status,
    statusText,
    playscrape,
    options,
}: {
    status: "created" | "noChanges" | "updated" | "failed";
    statusText?: string;
    playscrape: Playscrape;
    options: InternalOptions;
}) => {
    if (options.test) {
        return;
    }

    if (!playscrape.currentRecordScrapeId) {
        console.error("No current record scrape to end.");
        process.exit(1);
    }

    if (options.dryRun) {
        console.log(`DRY RUN: Record scrape ended: ${status} ${statusText}`);
        playscrape.currentRecordScrapeId = undefined;
        return;
    }

    const result = await playscrape.db
        .update(scrapeRecords)
        .set({
            recordId: playscrape.currentRecordId,
            status,
            statusText,
            ended_at: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(scrapeRecords.id, playscrape.currentRecordScrapeId))
        .returning({id: scrapeRecords.id});

    if (result.length === 0 || !result[0].id) {
        console.error("Failed to end record scrape.");
        process.exit(1);
    }

    if (playscrape.scrapeStats) {
        playscrape.scrapeStats[status] += 1;
        if (status !== "failed") {
            playscrape.scrapeStats.total += 1;
        }
    }

    playscrape.currentRecordScrapeId = undefined;
};
