#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import {Command} from "@commander-js/extra-typings";

import {exportRecords} from "./actions/export.js";
import {reExtractData} from "./actions/extract/extract.js";
import {scrapeWithBrowser} from "./actions/scrape/browser.js";
import {MIRROR_ACTION, scrapeMirroredFiles} from "./actions/scrape/mirror.js";
import type {
    BrowserAction,
    InternalOptions,
    MirrorAction,
    Options,
} from "./shared/types.js";

const parseActionFile = async (
    fileName: string,
    extraOptions: {
        test?: boolean;
        debug?: boolean;
        dryRun?: boolean;
        timeout?: number;
        delay?: number;
        overwrite?: boolean;
    },
): Promise<{
    browser: BrowserAction;
    mirror: MirrorAction;
    options: InternalOptions;
}> => {
    if (!fileName) {
        console.error("No action file specified.");
        process.exit(1);
    }

    const resolvedActionFileName = fs.realpathSync(fileName);

    if (!fs.existsSync(resolvedActionFileName)) {
        console.error(`Action file ${fileName} does not exist.`);
        process.exit(1);
    }

    const {
        browser,
        mirror,
        options: importOptions,
    }: {
        browser: BrowserAction;
        mirror: MirrorAction;
        options: Options;
    } = await import(resolvedActionFileName);

    if (!browser && !mirror) {
        console.error("No actions found.");
        process.exit(1);
    }

    if (browser && mirror) {
        console.error("Both browser and mirror actions defined, only use one.");
        process.exit(1);
    }

    if (!importOptions) {
        console.error("No options found.");
        process.exit(1);
    }

    if (
        (typeof browser !== "object" || Object.keys(browser).length === 0) &&
        (typeof mirror !== "object" || Object.keys(mirror).length === 0)
    ) {
        console.error(
            "No actions found. Make sure you export a browser or mirror object.",
        );
        process.exit(1);
    }

    const outputDir =
        importOptions.outputDir || path.dirname(resolvedActionFileName);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, {recursive: true});
    }
    const dbName =
        importOptions.dbName || path.join(outputDir, "playscrape.db");
    const exportFile =
        importOptions.exportFile || path.join(outputDir, "playscrape.json");
    const testDir = importOptions.testDir || path.join(outputDir, "tests");
    if (extraOptions.test && !fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, {recursive: true});
    }

    const options: InternalOptions = {
        ...extraOptions,
        format: "jpg",
        indent: 2,
        downloadTo: importOptions.s3 ? "s3" : "local",
        timeout: extraOptions.timeout || 60000,
        delay: extraOptions.delay || 1000,
        source: "default",
        ...importOptions,
        dbName,
        exportFile,
        testDir,
    };

    return {
        browser,
        mirror,
        options,
    };
};

const cli = new Command()
    .name("playscrape")
    .description(
        "Scrape data from a website using Playwright, or from local HTML files.",
    )
    .version(process.env.npm_package_version ?? "0.0.0");

cli.command("scrape")
    .description("scrape and update existing entries in DB.")
    .argument("<action_file>", "JS file defining the actions to perform.")
    .option("--debug", "output extra debugging information")
    .option("--dry-run", "do not save any data to the database or file system")
    .option("--timeout <number>", "timeout in milliseconds", "60000")
    .option("--delay <number>", "delay in milliseconds", "1000")
    .option("--overwrite", "overwrite existing downloaded files")
    .action(async (fileName, args) => {
        try {
            const {browser, mirror, options} = await parseActionFile(fileName, {
                debug: !!args.debug,
                dryRun: !!args.dryRun,
                test: false,
                overwrite: !!args.overwrite,
                timeout: Number.parseInt(args.timeout, 10),
                delay: Number.parseInt(args.delay, 10),
            });

            if (mirror) {
                await scrapeMirroredFiles({options, action: mirror});
            } else if (browser) {
                await scrapeWithBrowser({options, actions: browser});
            }
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    });

cli.command("export")
    .description("export extracted data to a JSON file.")
    .argument("<action_file>", "JS file defining the actions to perform.")
    .action(async (fileName) => {
        const {options} = await parseActionFile(fileName, {});
        exportRecords({options});
    });

cli.command("extract")
    .description("re-extract record data from a previous scrape.")
    .argument("<action_file>", "JS file defining the actions to perform.")
    .action(async (fileName) => {
        const {options, browser, mirror} = await parseActionFile(fileName, {});

        if (mirror) {
            await reExtractData({
                options,
                actions: {
                    [MIRROR_ACTION]: mirror,
                },
            });
        } else if (browser) {
            await reExtractData({options, actions: browser});
        }
    });

cli.command("test")
    .description("test the function of the extraction logic.")
    .argument("<action_file>", "JS file defining the actions to perform.")
    .option("-u, --update-snapshot", "overwrite existing downloaded files")
    .action(async (fileName, args) => {
        const {browser, mirror, options} = await parseActionFile(fileName, {
            test: true,
            overwrite: !!args.updateSnapshot,
        });

        if (mirror) {
            await scrapeMirroredFiles({options, action: mirror});
        } else if (browser) {
            await scrapeWithBrowser({options, actions: browser});
        }
    });

cli.parse();
