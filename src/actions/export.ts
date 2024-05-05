import * as fs from "node:fs";
import ora from "ora";
import {initDB} from "../shared/db.js";
import type {InternalOptions} from "../shared/types.js";

export const exportRecords = async ({
    options,
}: {
    options: InternalOptions;
}) => {
    if (!options.exportFile) {
        throw new Error("No export file specified.");
    }

    const db = initDB({
        debug: options.debug,
        dbName: options.dbName,
    });

    const spinner = ora("Exporting records...").start();

    try {
        const results = await db.query.records.findMany({
            columns: {
                id: true,
                url: true,
                extracted: true,
            },
        });

        const finalResults: Array<{
            id: string;
            url: string;
        }> = [];

        for (const result of results) {
            finalResults.push({
                id: result.id,
                url: result.url,
                ...(result.extracted ? result.extracted : null),
            });
        }

        const resultString = JSON.stringify(finalResults);

        if (options.exportFile) {
            fs.writeFileSync(options.exportFile, resultString, "utf-8");
        } else {
            console.log(resultString);
        }

        spinner.succeed(`Exported ${finalResults.length} record(s).`);
    } catch (e) {
        spinner.fail("Failed to export records.");
        console.error(e);
        process.exit(1);
    }
};
