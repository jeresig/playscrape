import {promises as fs, existsSync} from "node:fs";
import * as path from "node:path";
import {colorize} from "json-colorizer";
import * as jsonDiff from "json-diff";
import ora from "ora";
import type {InternalOptions} from "../shared/types.js";

export const testRecord = async ({
    id,
    extracted,
    options,
}: {id: string; extracted: any; options: InternalOptions}) => {
    const {testDir, indent} = options;

    if (!testDir) {
        throw new Error("Error: No test directory specified.");
    }

    const testSpinner = ora({
        text: "Testing record...",
        indent,
    }).start();

    const testFile = path.join(testDir, `${id}.json`);
    const extractedFormatted = JSON.stringify(extracted, null, 4);

    if (existsSync(testFile)) {
        const rawData = await fs.readFile(testFile, "utf8");
        const data = JSON.parse(rawData);
        const diff = jsonDiff.diffString(data, extracted);
        if (rawData !== extractedFormatted) {
            testSpinner.fail(`❌ Data mismatch for: ${id}`);
            console.log(diff);
            if (!options.overwrite) {
                process.exit(1);
            }
        } else {
            testSpinner.succeed("✅ Record test passed.");
        }
    } else {
        testSpinner.info("Snapshot file not found, creating.");
        console.log(colorize(extracted));
    }

    await fs.writeFile(testFile, extractedFormatted, "utf8");
};

export const testImages = async ({
    id,
    options,
    urls,
}: {
    id: string;
    options: InternalOptions;
    urls: Array<string>;
}) => {
    const {testDir, indent} = options;

    if (!testDir) {
        throw new Error("Error: No test directory specified.");
    }

    const testSpinner = ora({
        text: "Testing images...",
        indent,
    }).start();

    const imageFile = path.join(testDir, `${id}.images.json`);

    if (existsSync(imageFile)) {
        const rawData = await fs.readFile(imageFile, "utf8");
        const oldImages = JSON.parse(rawData);
        const diff = jsonDiff.diffString(oldImages, urls);

        if (oldImages.toString() !== urls.toString()) {
            testSpinner.fail(`❌ Image mismatch for: ${id}`);
            console.log(diff);
            if (!options.overwrite) {
                process.exit(1);
            }
        } else {
            testSpinner.succeed("✅ Image test passed.");
        }
    } else if (urls.length === 0) {
        testSpinner.warn("⚠️ No images found to download.");
    } else {
        testSpinner.info("Image snapshot file not found, creating.");
        console.log(colorize(urls));
    }

    await fs.writeFile(imageFile, JSON.stringify(urls), "utf8");
};
