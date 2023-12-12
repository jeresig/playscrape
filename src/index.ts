import FastGlob from "fast-glob";
import ora from "ora";
import {chromium} from "playwright";

import {handleBrowserAction, handleMirrorAction} from "./actions.js";
import {Actions, Options, Playscrape, PlayscrapeBrowser} from "./types.js";

export * from "./types.js";
export {initDB} from "./db.js";

export const initBrowser = async ({
    db,
    options,
    actions,
}: {
    db: Playscrape["db"];
    options: Options;
    actions: Actions;
}) => {
    const spinner = ora("Starting browser...").start();

    try {
        const fullBrowser = await chromium.launch();
        const browser = await fullBrowser.newContext();
        const page = await browser.newPage();

        const playscrape: Playscrape = {
            actions,
            db,
        };

        const playBrowser: PlayscrapeBrowser = {
            browser: browser,
            page,
        };

        spinner.succeed("Browser started.");

        // Start at the beginning
        await handleBrowserAction({
            action: "start",
            playscrape,
            playBrowser,
            options,
        });
    } catch (e) {
        spinner.fail("Failed to launch browser.");
        console.error(e);
        return;
    }
};

export const initMirror = async ({
    db,
    options,
    actions,
}: {
    db: Playscrape["db"];
    options: Options;
    actions: Actions;
}) => {
    const action = actions.mirror;

    if (!action) {
        return;
    }

    const spinner = ora("Finding mirrored files to extract from...").start();

    try {
        const playscrape: Playscrape = {
            actions,
            db,
        };

        const patterns = action.htmlFiles || ["**/*.html"];
        const files = await FastGlob.glob(patterns);

        if (files.length === 0) {
            spinner.fail("No files found to extract from.");
            return;
        }

        spinner.succeed(`Found ${files.length} file(s) to extract from.`);

        // Start at the beginning
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
