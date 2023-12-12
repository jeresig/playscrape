import {promises as fs} from "node:fs";
import {sql} from "drizzle-orm";
import ora from "ora";

import {downloadImages} from "./downloads.js";
import {parseHTMLForXPath} from "./html-xpath.js";
import {NewRecord, records} from "./schema.js";
import {Action, Options, Playscrape, PlayscrapeBrowser} from "./types.js";
import {hash, wait} from "./utils.js";

const getPageContents = async ({
    playBrowser,
    options,
}: {
    playBrowser: PlayscrapeBrowser;
    options: Options;
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

const handleExtract = async ({
    content,
    url,
    actionName,
    cookies,
    playscrape,
    options,
}: {
    content: string;
    url: string;
    actionName: string;
    cookies: string;
    playscrape: Playscrape;
    options: Options;
}) => {
    const {indent, dryRun} = options;
    const {db, actions} = playscrape;
    const action = actions[actionName];

    if (!action || !action.extract) {
        return;
    }

    const extractSpinner = ora({
        text: "Extracting data...",
        indent,
    }).start();

    try {
        const {query, queryAll, dom} = parseHTMLForXPath(content);

        const extracted = await action.extract({
            url,
            query,
            queryAll,
            dom,
            content,
        });

        if (!extracted) {
            extractSpinner.fail(`No data extracted from ${url}.`);
            return;
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
                    console.log(JSON.stringify(extracted, null, 4));
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

                if (!action.downloadImages) {
                    await downloadImages({
                        action,
                        record,
                        url,
                        dom,
                        query,
                        queryAll,
                        content,
                        cookies,
                        playscrape,
                        options,
                    });
                }
            } catch (e) {
                saveSpinner.fail("Failed to save record.");
                console.error(e);
                return;
            }
        }
    } catch (e) {
        extractSpinner.fail(`Failed to extract data from ${url}.`);
        console.error(e);
        return;
    }
};

export const handleMirrorAction = async ({
    action,
    playscrape,
    options,
    files,
}: {
    action: Action;
    playscrape: Playscrape;
    options: Options;
    files: string[];
}) => {
    const {indent} = options;

    for (const fileName of files) {
        console.log(`Action (mirror): ${fileName}`);

        const extractSpinner = ora({
            text: "Extracting data...",
            indent,
        }).start();

        try {
            let url = fileName;

            if (action.getURLFromFileName) {
                url = action.getURLFromFileName(fileName);
            }

            if (action.extract) {
                const content = await fs.readFile(fileName, "utf8");

                if (!content) {
                    return;
                }

                await handleExtract({
                    content,
                    cookies: "",
                    url,
                    playscrape,
                    actionName: "mirror",
                    options,
                });
            }

            extractSpinner.succeed(`Extracted data from ${fileName}.`);
        } catch (e) {
            extractSpinner.fail(`Failed to extract data from ${fileName}.`);
            console.error(e);
            return;
        }
    }
};

export const handleBrowserAction = async ({
    action: actionName = "start",
    playBrowser,
    playscrape,
    options,
}: {
    action: string;
    playscrape: Playscrape;
    playBrowser: PlayscrapeBrowser;
    options: Options;
}) => {
    const {indent, delay} = options;
    const {page} = playBrowser;
    const {actions} = playscrape;
    const url = page.url();

    console.log(`Action (${actionName}): ${url}`);

    const action = actions[actionName];

    if (!action) {
        throw new Error(`Unknown action: ${actionName}`);
    }

    if (action.init) {
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

    if (action.extract) {
        const {content, cookies} = await getPageContents({
            playBrowser,
            options,
        });

        if (!content) {
            return;
        }

        await handleExtract({
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
        if (action.undoVisit) {
            await action.undoVisit({page});
        } else if (actionName !== "start") {
            await page.goBack();
        }
    };

    if (action.visit) {
        const visitSpinner = ora({text: "Visiting...", indent}).start();
        try {
            await action.visit({
                page,
                action: async (action: string) => {
                    visitSpinner.succeed("Visited.");
                    await wait(delay);
                    await handleBrowserAction({
                        action,
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
    }
};
