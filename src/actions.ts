import {existsSync, promises as fs} from "node:fs";
import path from "node:path";
import {sql} from "drizzle-orm";
import {colorize} from "json-colorizer";
import jsonDiff from "json-diff";
import ora from "ora";

import {downloadImages} from "./downloads.js";
import {parseHTMLForXPath} from "./html-xpath.js";
import {NewRecord, records} from "./schema.js";
import {
    BrowserAction,
    ExtractAction,
    InternalOptions,
    MirrorAction,
    Playscrape,
    PlayscrapeBrowser,
} from "./types.js";
import {hash, wait} from "./utils.js";

export const INITIAL_BROWSER_ACTION = "start";

const getPageContents = async ({
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

const testRecord = async ({
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

const handleExtract = async ({
    action,
    content,
    url,
    actionName,
    cookies,
    playscrape,
    options,
}: {
    action: ExtractAction;
    content: string;
    url: string;
    actionName: string;
    cookies: string;
    playscrape: Playscrape;
    options: InternalOptions;
}) => {
    const {indent, dryRun, test} = options;
    const {db} = playscrape;

    if (!action || !action.extract) {
        return false;
    }

    const extractSpinner = ora({
        text: "Extracting data...",
        indent,
    }).start();

    try {
        const domQuery = parseHTMLForXPath(content);

        const extracted = await action.extract({
            ...domQuery,
            url,
            content,
        });

        if (!extracted) {
            extractSpinner.warn("No data extracted.");
            return false;
        }

        const extractedRecords = Array.isArray(extracted)
            ? extracted
            : [extracted];

        extractSpinner.succeed(
            `Extracted ${extractedRecords.length} record(s).`,
        );

        for (const extracted of extractedRecords) {
            const saveSpinner = ora({text: "Saving record...", indent}).start();
            try {
                const record: NewRecord = {
                    id: extracted.id || hash(extracted.url || url),
                    url: extracted.url || url,
                    action: actionName,
                    content,
                    cookies,
                    extracted: JSON.stringify(extracted),
                };

                if (dryRun) {
                    saveSpinner.succeed("DRY RUN: Record would be saved here.");
                    console.log(colorize(record));
                } else if (test) {
                    await testRecord({id: record.id, extracted, options});
                    saveSpinner.succeed("Record tested.");
                } else {
                    await db
                        .insert(records)
                        .values(record)
                        .onConflictDoUpdate({
                            target: records.id,
                            set: {
                                url,
                                cookies,
                                extracted: record.extracted,
                                updated_at: sql`CURRENT_TIMESTAMP`,
                            },
                        })
                        .run();

                    saveSpinner.succeed("Saved record.");
                }

                await downloadImages({
                    ...domQuery,
                    action,
                    record,
                    url,
                    content,
                    cookies,
                    playscrape,
                    options,
                });
            } catch (e) {
                saveSpinner.fail("Failed to save record.");
                console.error(e);
                return false;
            }
        }
    } catch (e) {
        extractSpinner.fail(`Failed to extract data from ${url}.`);
        console.error(e);
        return false;
    }

    return true;
};

export const handleMirrorAction = async ({
    action,
    playscrape,
    options,
    files,
}: {
    action: MirrorAction;
    playscrape: Playscrape;
    options: InternalOptions;
    files: string[];
}) => {
    const rootDir = process.cwd();
    for (const fileName of files) {
        console.log(`Action (mirror): ${path.relative(rootDir, fileName)}`);

        let url = fileName;

        if (action.getURLFromFileName) {
            url = action.getURLFromFileName(fileName);
        }

        if (action.extract) {
            const content = await fs.readFile(fileName, "utf8");

            if (content) {
                await handleExtract({
                    action,
                    content,
                    cookies: "",
                    url,
                    playscrape,
                    actionName: "mirror",
                    options,
                });
            }
        }
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
