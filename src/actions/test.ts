import {existsSync, promises as fs} from "node:fs";
import * as path from "node:path";
import {colorize} from "json-colorizer";
import * as jsonDiff from "json-diff";
import {InternalOptions} from "../shared/types.js";

export const testRecord = async ({
    id,
    extracted,
    options,
}: {id: string; extracted: any; options: InternalOptions}) => {
    const {testDir} = options;

    if (!testDir) {
        console.error("Error: No test directory specified.");
        process.exit(1);
    }

    const testFile = path.join(testDir, `${id}.json`);

    if (existsSync(testFile)) {
        const rawData = await fs.readFile(testFile, "utf8");
        const data = JSON.parse(rawData);
        const diff = jsonDiff.diffString(data, extracted);
        if (/^[+-]/s.test(diff)) {
            console.warn(`Data mismatch for: ${id}`);
            console.log(diff);
            if (!options.overwrite) {
                process.exit(1);
            }
        }
    } else {
        console.warn("Snapshot file not found, creating.");
        console.log(colorize(extracted));
    }

    await fs.writeFile(testFile, JSON.stringify(extracted, null, 4), "utf8");
};
