import {eq, sql} from "drizzle-orm";
import {scrapes} from "../../shared/schema.js";
import type {InternalOptions, Playscrape} from "../../shared/types.js";

export const startScrape = async ({
    playscrape,
    options,
}: {playscrape: Playscrape; options: InternalOptions}) => {
    if (options.test) {
        return;
    }

    if (playscrape.currentScrapeId) {
        console.error("Scrape already in progress.");
        process.exit(1);
    }

    playscrape.scrapeStats = {
        total: 0,
        created: 0,
        noChanges: 0,
        updated: 0,
        failed: 0,
    };

    if (options.dryRun) {
        playscrape.currentScrapeId = 1;
        return;
    }

    const [result] = await playscrape.db
        .insert(scrapes)
        .values({
            status: "running",
        })
        .returning({id: scrapes.id});

    if (!result?.id) {
        console.error("Failed to start scrape.");
        process.exit(1);
    }

    playscrape.currentScrapeId = result.id;
};

export const endScrape = async ({
    status,
    statusText,
    playscrape,
    options,
}: {
    status: "completed" | "failed";
    statusText?: string;
    playscrape: Playscrape;
    options: InternalOptions;
}) => {
    if (options.test) {
        return;
    }

    if (!playscrape.currentScrapeId || !playscrape.scrapeStats) {
        console.error("No current scrape to end.");
        process.exit(1);
    }

    if (options.dryRun) {
        console.log(`DRY RUN: Ending scrape, status: ${status} ${statusText}`);
        console.log(playscrape.scrapeStats);
        playscrape.currentScrapeId = undefined;
        playscrape.scrapeStats = undefined;
        return;
    }

    const result = await playscrape.db
        .update(scrapes)
        .set({
            status,
            statusText,
            created_records: playscrape.scrapeStats.created,
            no_changes_records: playscrape.scrapeStats.noChanges,
            updated_records: playscrape.scrapeStats.updated,
            failed_records: playscrape.scrapeStats.failed,
            ended_at: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(scrapes.id, playscrape.currentScrapeId))
        .returning({id: scrapes.id});

    if (result.length === 0 || !result[0].id) {
        console.error("Failed to end scrape.");
        process.exit(1);
    }

    playscrape.currentScrapeId = undefined;
    playscrape.scrapeStats = undefined;
};
