import * as fs from "node:fs";
import ora from "ora";
import {initDB} from "../shared/db.js";
import {records} from "../shared/schema.js";
import {InternalOptions} from "../shared/types.js";

export const exportRecords = async ({
    options,
}: {
    options: InternalOptions;
}) => {
    if (!options.exportFile) {
        console.error("No export file specified.");
        return;
    }

    const db = initDB({
        debug: options.debug,
        dbName: options.dbName,
    });

    const spinner = ora("Exporting records...").start();

    try {
        const results = db
            .select({
                id: records.id,
                url: records.url,
                data: records.extracted,
            })
            .from(records)
            .all();

        const finalResults: Array<{
            id: string;
            url: string;
        }> = [];

        for (const result of results) {
            finalResults.push({
                id: result.id,
                url: result.url,
                ...(result.data ? result.data : null),
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
        return;
    }
};
