import * as fs from "node:fs";
import {eq} from "drizzle-orm";
import ora from "ora";

import {initDB} from "../shared/db.js";
import {records} from "../shared/schema.js";
import type {InternalOptions} from "../shared/types.js";

export const exportRecords = async ({
    options,
}: {
    options: InternalOptions;
}) => {
    if (!options.exportFile) {
        throw new Error("No export file specified.");
    }

    const db = await initDB({
        debug: options.debug,
        dbName: options.dbName,
    });

    const spinner = ora("Exporting records...").start();

    try {
        const results = await db.query.records.findMany({
            columns: {
                id: true,
                source: true,
                url: true,
                extracted: true,
                created_at: true,
                updated_at: true,
                scraped_at: true,
            },
            with: {
                downloads: {
                    columns: {
                        width: true,
                        height: true,
                        file_size: true,
                        file_name: true,
                        created_at: true,
                        updated_at: true,
                    },
                },
            },
            where: eq(records.source, options.source),
        });

        // We spread out the extracted field to the top level of the object
        // so that it's easier to view in the exported JSON file.
        const resultString = JSON.stringify(
            results.map(({extracted, ...rest}) => ({
                ...rest,
                ...(extracted || null),
            })),
        );

        if (options.exportFile) {
            fs.writeFileSync(options.exportFile, resultString, "utf-8");
        } else {
            console.log(resultString);
        }

        spinner.succeed(`Exported ${results.length} record(s).`);
    } catch (e) {
        spinner.fail("Failed to export records.");
        console.error(e);
        process.exit(1);
    }
};
