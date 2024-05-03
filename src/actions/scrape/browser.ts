import ora from "ora";
import {Browser, BrowserContext, chromium} from "playwright";

import {initDB} from "../../shared/db.js";
import {
    BrowserAction,
    InternalOptions,
    Playscrape,
    PlayscrapeBrowser,
} from "../../shared/types.js";
import {wait} from "../../shared/utils.js";
import {handleExtract} from "../extract/extract.js";

export const INITIAL_BROWSER_ACTION = "start";

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

    if ("init" in action && action.init) {
        const initSpinner = ora({text: "Initializing...", indent}).start();
        try {
            if (typeof action.init === "string") {
                await page.goto(action.init);
            } else {
                await action.init({page});
            }
            initSpinner.succeed("Initialized.");
        } catch (e) {
            initSpinner.fail("Failed to initialize.");
            console.error(e);
            return;
        }
    }

    const url = page.url();

    if (action.extract) {
        const {content, cookies} = await getPageContents({
            playBrowser,
            options,
        });

        if (!content) {
            return;
        }

        await handleExtract({
            action,
            content,
            cookies,
            url,
            playscrape,
            actionName,
            options,
        });
    }

    const undoVisit = async () => {
        // If we're deeper in the stack, we need to go back.
        if ("undoVisit" in action && action.undoVisit) {
            await action.undoVisit({page});
        } else if (actionName !== INITIAL_BROWSER_ACTION) {
            await page.goBack();
        }
    };

    if ("visit" in action) {
        const visitSpinner = ora({text: "Visiting...", indent}).start();
        try {
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
                    await undoVisit();
                },
            });
        } catch (e) {
            visitSpinner.fail("Failed to visit.");
            console.error(e);
            return;
        }
    } else if ("visitAll" in action) {
        try {
            const {action: nextAction, links: linksLocator} =
                await action.visitAll({page});

            const links = await linksLocator.all();

            for (const link of links) {
                const visitSpinner = ora({
                    text: "Visiting...",
                    indent,
                }).start();
                try {
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
                    await undoVisit();
                } catch (e) {
                    visitSpinner.fail("Failed to visit.");
                    console.error(e);
                    return;
                }
            }
        } catch (e) {
            console.error(e);
            return;
        }
    }

    if ("next" in action && action.next) {
        const nextSpinner = ora({text: "Next...", indent}).start();
        try {
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
                actionName: actionName,
                actions,
                playscrape,
                playBrowser,
                options,
            });
        } catch (e) {
            nextSpinner.fail("Failed to go to next.");
            console.error(e);
            return;
        }
    }
};

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
        return;
    }

    console.log(`Test Action (${actionName})`);

    if (
        !("testUrls" in action && action.testUrls) ||
        action.testUrls.length === 0
    ) {
        console.error("No test URLs defined for this action.");
        return;
    }

    for (const url of action.testUrls) {
        const initSpinner = ora({
            text: `Loading test url: ${url}`,
            indent,
        }).start();
        try {
            await page.goto(url);
            initSpinner.succeed(`Test url loaded: ${url}`);
        } catch (e) {
            initSpinner.fail(`Failed to load test url: ${url}`);
            console.error(e);
            return;
        }

        const {content, cookies} = await getPageContents({
            playBrowser,
            options,
        });

        if (!content) {
            console.error("No content found.");
            return;
        }

        await handleExtract({
            action,
            content,
            cookies,
            url,
            playscrape,
            actionName,
            options,
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

    try {
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
    } catch (e) {
        extractSpinner.fail("Failed to download page data.");
        console.error(e);
        return {content: "", cookies: ""};
    }
};
