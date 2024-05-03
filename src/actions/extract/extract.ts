import {eq, sql} from "drizzle-orm";
import {colorize} from "json-colorizer";
import jsonDiff from "json-diff";
import ora from "ora";

import {initDB} from "../../shared/db.js";
import {NewRecord, records} from "../../shared/schema.js";
import {
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
    oldRecord?: NewRecord;
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

    try {
        const domQuery = getDomQuery(content);

        const extracted = await action.extract({
            ...domQuery,
            url,
            content,
        });

        if (!extracted) {
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
            const saveSpinner = ora({text: "Saving record...", indent}).start();
            try {
                const record: NewRecord = {
                    id: extracted.id || hash(extracted.url || url),
                    url: extracted.url || url,
                    action: actionName,
                    content,
                    cookies,
                    extracted: JSON.stringify(extracted),
                };

                if (dryRun) {
                    if (oldRecord) {
                        if (oldRecord.id !== record.id) {
                            console.log(
                                `DRY RUN: Record ID changed. (old: ${oldRecord.id}, new: ${record.id})`,
                            );
                        }
                        if (oldRecord.extracted !== record.extracted) {
                            const diff = jsonDiff.diffString(
                                JSON.parse(oldRecord.extracted || "{}"),
                                extracted,
                            );
                            console.log(
                                `DRY RUN: Data updated for ${record.id}`,
                            );
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
                    if (oldRecord && oldRecord.extracted !== record.extracted) {
                        const diff = jsonDiff.diffString(
                            JSON.parse(oldRecord.extracted || "{}"),
                            extracted,
                        );

                        console.warn(`Data updated for ${record.id}`);
                        console.log(diff);
                    }
                    await db
                        .insert(records)
                        .values(record)
                        .onConflictDoUpdate({
                            target: records.id,
                            set: {
                                url,
                                cookies,
                                extracted: record.extracted,
                                updated_at: sql`CURRENT_TIMESTAMP`,
                            },
                        })
                        .run();

                    if (oldRecord && oldRecord.id !== record.id) {
                        console.log(
                            `Record ID changed. (old: ${oldRecord.id}, new: ${record.id})`,
                        );
                        await db
                            .delete(records)
                            .where(eq(records.id, oldRecord.id))
                            .run();
                    }

                    saveSpinner.succeed("Saved record.");
                }

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
            } catch (e) {
                saveSpinner.fail("Failed to save record.");
                console.error(e);
                return false;
            }
        }
    } catch (e) {
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

    try {
        let numUpdated = 0;

        const results = db
            .select({
                id: records.id,
                url: records.url,
                action: records.action,
                content: records.content,
                cookies: records.cookies,
                extracted: records.extracted,
            })
            .from(records)
            .all();

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
    } catch (e) {
        spinner.fail("Failed to re-extract records.");
        console.error(e);
        return;
    }
};
