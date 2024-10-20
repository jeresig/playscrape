import type {ObjectCannedACL} from "@aws-sdk/client-s3";
import type {NodePgDatabase} from "drizzle-orm/node-postgres";
import type {BrowserContext, Locator, Page} from "playwright";

import type {DomQuery} from "../actions/extract/dom-query.js";
import type {NewRecord} from "./schema.js";
import type * as schema from "./schema.js";

export type ExtractAction = {
    getURLFromFileName?: (fileName: string) => string;
    extract?: (
        options: DomQuery & {
            url: string;
            content: string;
        },
    ) => Promise<any>;
    downloadImages?: (
        options: DomQuery & {
            record: NewRecord;
            url: string;
            content: string;
        },
    ) => Promise<Array<string>>;
};

export type MirrorAction = ExtractAction & {
    htmlFiles: string | Array<string>;
    testFiles?: string | Array<string>;
};

type BaseBrowserAction = ExtractAction & {
    init?:
        | string
        | (({
              page,
          }: {
              page: Page;
          }) => Promise<void>);
    next?: ({page}: {page: Page}) => Promise<boolean | Locator>;
    testUrls?: Array<string>;
};

type VisitAction = BaseBrowserAction & {
    visit: ({
        page,
        action,
    }: {
        page: Page;
        action: (action: string) => Promise<void>;
    }) => Promise<void>;
    undoVisit?: ({page}: {page: Page}) => Promise<void>;
};

type VisitAllAction = BaseBrowserAction & {
    shouldRevisit?: ({
        page,
        href,
        record,
    }: {
        page: Page;
        href: string;
        record: any;
    }) => Promise<boolean>;

    visitAll: ({
        page,
    }: {
        page: Page;
    }) => Promise<{action: string; links: Locator}>;
};

type RequiredExtractAction = Required<Pick<ExtractAction, "extract">> &
    ExtractAction;

export type BrowserAction = {
    [key: string]: VisitAction | VisitAllAction | RequiredExtractAction;
    start: VisitAction | VisitAllAction | RequiredExtractAction;
};

export type InternalOptions = {
    source: string;
    debug?: boolean;
    dryRun?: boolean;
    test?: boolean;
    imageDir?: string;
    format?: string;
    timeout?: number;
    delay?: number;
    indent?: number;
    overwrite?: boolean;
    downloadTo?: "local" | "s3";
    dbName: string;
    exportFile?: string;
    testDir?: string;
    s3?: S3Options;
};

export type S3Options = {
    Bucket: string;
    pathPrefix?: string;
    ACL?: ObjectCannedACL;
};

export type Options = {
    source?: string;
    format?: string;
    overwrite?: boolean;
    dbName?: string;
    exportFile?: string;
    imageDir?: string;
    testDir?: string;
    outputDir?: string;
    s3?: S3Options;
};

export type PlayscrapeBrowser = {
    browser: BrowserContext;
    page: Page;
};

export type Playscrape = {
    db: NodePgDatabase<typeof schema>;
    currentScrapeId?: number;
    currentRecordId?: string;
    currentRecordScrapeId?: number;
    scrapeStats?: {
        total: number;
        created: number;
        noChanges: number;
        updated: number;
        failed: number;
    };
};
