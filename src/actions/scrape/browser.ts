import ora from "ora";
import {type Browser, type BrowserContext, chromium} from "playwright";

import {initDB} from "../../shared/db.js";
import type {
    BrowserAction,
    InternalOptions,
    Playscrape,
    PlayscrapeBrowser,
} from "../../shared/types.js";
import {wait} from "../../shared/utils.js";
import {handleExtract} from "../extract/extract.js";
import {endScrape, startScrape} from "./scrape.js";

export const INITIAL_BROWSER_ACTION = "start";

let initialized = false;

export const handleBrowserAction = async ({
    actionName = INITIAL_BROWSER_ACTION,
    actions,
    playBrowser,
    playscrape,
    options,
}: {
    actionName: string;
    actions: BrowserAction;
    playscrape: Playscrape;
    playBrowser: PlayscrapeBrowser;
    options: InternalOptions;
}) => {
    const {indent, delay} = options;
    const {page} = playBrowser;

    console.log(`Action (${actionName})`);

    const action = actions[actionName];

    if (!action) {
        throw new Error(`Unknown action: ${actionName}`);
    }

    if ("init" in action && action.init && !initialized) {
        initialized = true;
        const initSpinner = ora({text: "Initializing...", indent}).start();
        if (typeof action.init === "string") {
            await page.goto(action.init, {
                waitUntil: "domcontentloaded",
            });
        } else {
            await action.init({page});
        }
        initSpinner.succeed("Initialized.");
    }

    const url = page.url();

    if (action.extract) {
        const {content, cookies} = await getPageContents({
            playBrowser,
            options,
        });

        await handleExtract({
            action,
            content,
            cookies,
            url,
            playscrape,
            actionName,
            options,
        });
    } else {
        // If we're not extracting, we need to wait for the page to load for
        // the visit, visitAll, and next actions.
        await page.waitForLoadState("domcontentloaded");
    }

    const undoVisit = async () => {
        // If we're deeper in the stack, we need to go back.
        if ("undoVisit" in action && action.undoVisit) {
            await action.undoVisit({page});
        } else if (actionName !== INITIAL_BROWSER_ACTION) {
            await page.goBack({
                waitUntil: "domcontentloaded",
            });
        }
    };

    if ("visit" in action) {
        const visitSpinner = ora({text: "Visiting...", indent}).start();
        await action.visit({
            page,
            action: async (nextAction: string) => {
                await wait(delay);
                visitSpinner.succeed("Visited.");
                await handleBrowserAction({
                    actionName: nextAction,
                    actions,
                    playscrape,
                    playBrowser,
                    options,
                });
            },
        });
    } else if ("visitAll" in action) {
        let curLink = 0;
        let numLinks = 0;

        do {
            const {action: nextAction, links: linksLocator} =
                await action.visitAll({page});

            const links = await linksLocator.all();
            numLinks = links.length;
            if (curLink >= numLinks) {
                break;
            }
            const link = links[curLink];
            curLink += 1;

            const visitSpinner = ora({
                text: "Visiting...",
                indent,
            }).start();
            await wait(delay);
            await link.click();
            visitSpinner.succeed("Visited.");
            await handleBrowserAction({
                actionName: nextAction,
                actions,
                playscrape,
                playBrowser,
                options,
            });
        } while (curLink < numLinks);
    }

    if ("next" in action && action.next) {
        const nextSpinner = ora({text: "Next...", indent}).start();
        await wait(delay);
        const result = await action.next({page});

        if (typeof result === "boolean") {
            if (!result) {
                nextSpinner.succeed("No more results.");
                return;
            }
        } else {
            const numMatches = await result.count();

            if (numMatches === 0) {
                nextSpinner.succeed("No more results.");
                return;
            }

            await result.click();
        }

        nextSpinner.succeed("Next page.");

        await handleBrowserAction({
            actionName,
            actions,
            playscrape,
            playBrowser,
            options,
        });
    } else {
        await undoVisit();
    }
};

export const scrapeWithBrowser = async ({
    options,
    actions,
}: {
    options: InternalOptions;
    actions: BrowserAction;
}) => {
    const db = await initDB({
        debug: options.debug,
        dbName: options.dbName,
    });

    const playscrape: Playscrape = {
        db,
    };

    const spinner = ora("Starting browser...").start();

    let fullBrowser: Browser | null = null;
    let browser: BrowserContext | null = null;

    await startScrape({playscrape, options});

    try {
        fullBrowser = await chromium.launch();
        browser = await fullBrowser.newContext();
        const page = await browser.newPage();

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
            await endScrape({playscrape, options, status: "completed"});
        }
    } catch (e) {
        await endScrape({
            playscrape,
            options,
            status: "failed",
            statusText: e.message,
        });
        spinner.fail("Failed to scrape with browser.");
        console.error(e);
        process.exit(1);
    } finally {
        await browser?.close();
        await fullBrowser?.close();
    }
};

export const handleBrowserActionTest = async ({
    action: actionName = INITIAL_BROWSER_ACTION,
    actions,
    playBrowser,
    playscrape,
    options,
}: {
    action: string;
    actions: BrowserAction;
    playscrape: Playscrape;
    playBrowser: PlayscrapeBrowser;
    options: InternalOptions;
}) => {
    const {indent} = options;
    const {page} = playBrowser;
    const action = actions[actionName];

    if (!action) {
        throw new Error(`Unknown action: ${actionName}`);
    }

    if (!action.extract) {
        // This is safe to ignore, as we're only testing the extract part.
        return;
    }

    console.log(`Test Action (${actionName})`);

    if (
        !("testUrls" in action && action.testUrls) ||
        action.testUrls.length === 0
    ) {
        throw new Error("No test URLs defined for this action.");
    }

    for (const url of action.testUrls) {
        const initSpinner = ora({
            text: `Loading test url: ${url}`,
            indent,
        }).start();
        await page.goto(url);
        initSpinner.succeed(`Test url loaded: ${url}`);

        const subOptions = {
            ...options,
            indent: (options.indent || 0) + 2,
        };

        const {content, cookies} = await getPageContents({
            playBrowser,
            options: subOptions,
        });

        await handleExtract({
            action,
            content,
            cookies,
            url,
            playscrape,
            actionName,
            options: subOptions,
        });
    }
};

export const getPageContents = async ({
    playBrowser,
    options,
}: {
    playBrowser: PlayscrapeBrowser;
    options: InternalOptions;
}) => {
    const {page, browser} = playBrowser;
    const {indent} = options;

    const extractSpinner = ora({
        text: "Downloading page data for extraction...",
        indent,
    }).start();

    await page.waitForLoadState("domcontentloaded");
    const content = await page.content();
    const cookies = (await browser.cookies())
        .map(
            (cookie) =>
                `${encodeURIComponent(cookie.name)}=${encodeURIComponent(
                    cookie.value,
                )}`,
        )
        .join("; ");
    extractSpinner.succeed("Downloaded page data.");

    return {content, cookies};
};
