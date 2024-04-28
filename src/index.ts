import FastGlob from "fast-glob";
import ora from "ora";
import {chromium} from "playwright";

import {
    INITIAL_BROWSER_ACTION,
    handleBrowserAction,
    handleBrowserActionTest,
    handleMirrorAction,
} from "./actions.js";
import {
    BrowserAction,
    InternalOptions,
    MirrorAction,
    Playscrape,
    PlayscrapeBrowser,
} from "./types.js";

export * from "./types.js";
export {initDB} from "./db.js";

export const initBrowser = async ({
    db,
    options,
    actions,
}: {
    db: Playscrape["db"];
    options: InternalOptions;
    actions: BrowserAction;
}) => {
    const spinner = ora("Starting browser...").start();

    try {
        const fullBrowser = await chromium.launch();
        const browser = await fullBrowser.newContext();
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
    }
};

export const initMirror = async ({
    db,
    options,
    action,
}: {
    db: Playscrape["db"];
    options: InternalOptions;
    action: MirrorAction;
}) => {
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
