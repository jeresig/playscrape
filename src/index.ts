import fs from "node:fs";
import FastGlob from "fast-glob";
import ora from "ora";
import {Browser, BrowserContext, chromium} from "playwright";

import {
    INITIAL_BROWSER_ACTION,
    handleBrowserAction,
    handleBrowserActionTest,
    handleMirrorAction,
} from "./actions.js";
import {initDB} from "./db.js";
import {records} from "./schema.js";
import {
    BrowserAction,
    InternalOptions,
    MirrorAction,
    Playscrape,
    PlayscrapeBrowser,
} from "./types.js";

export * from "./types.js";
export {initDB} from "./db.js";

export const scrapeWithBrowser = async ({
    options,
    actions,
}: {
    options: InternalOptions;
    actions: BrowserAction;
}) => {
    const db = initDB({
        debug: options.debug,
        dbName: options.dbName,
    });

    const spinner = ora("Starting browser...").start();

    let fullBrowser: Browser | null = null;
    let browser: BrowserContext | null = null;

    try {
        fullBrowser = await chromium.launch();
        browser = await fullBrowser.newContext();
        const page = await browser.newPage();

        const playscrape: Playscrape = {
            db,
        };

        const playBrowser: PlayscrapeBrowser = {
            browser: browser,
            page,
        };

        spinner.succeed("Browser started.");

        if (options.test) {
            for (const action of Object.keys(actions)) {
                await handleBrowserActionTest({
                    action,
                    actions,
                    playscrape,
                    playBrowser,
                    options,
                });
            }
        } else {
            await handleBrowserAction({
                actionName: INITIAL_BROWSER_ACTION,
                actions,
                playscrape,
                playBrowser,
                options,
            });
        }
    } catch (e) {
        spinner.fail("Failed to launch browser.");
        console.error(e);
        return;
    } finally {
        await browser?.close();
        await fullBrowser?.close();
    }
};

export const scrapeMirroredFiles = async ({
    options,
    action,
}: {
    options: InternalOptions;
    action: MirrorAction;
}) => {
    const db = initDB({
        debug: options.debug,
        dbName: options.dbName,
    });

    const spinner = ora("Finding mirrored files to extract from...").start();

    try {
        const playscrape: Playscrape = {
            db,
        };

        const patterns = (options.test
            ? action.testFiles
            : action.htmlFiles) || ["**/*.html"];
        const files = await FastGlob.glob(patterns);

        if (files.length === 0) {
            spinner.fail("No files found to extract from.");
            return;
        }

        spinner.succeed(`Found ${files.length} file(s) to extract from.`);

        await handleMirrorAction({
            action,
            files,
            playscrape,
            options,
        });
    } catch (e) {
        spinner.fail("Failed to extract from mirror.");
        console.error(e);
        return;
    }
};

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
                ...(result.data ? JSON.parse(result.data) : null),
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
