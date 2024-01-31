import {ObjectCannedACL} from "@aws-sdk/client-s3";
import {BetterSQLite3Database} from "drizzle-orm/better-sqlite3";
import {BrowserContext, Page} from "playwright";

import {NewRecord} from "./schema.js";

export type Action = {
    htmlFiles?: string | Array<string>;
    getURLFromFileName?: (fileName: string) => string;
    init?: string | (({page}: {page: Page}) => Promise<void>);
    visit?: ({
        page,
        action,
    }: {
        page: Page;
        action: (action: string) => Promise<void>;
    }) => Promise<void>;
    undoVisit?: ({page}: {page: Page}) => Promise<void>;
    extract?: ({
        dom,
        url,
        query,
        content,
    }: {
        dom: Document;
        query: (query: string, root?: Node) => Element | null;
        queryAll: (query: string, root?: Node) => Array<Element>;
        url: string;
        content: string;
    }) => Promise<any>;
    downloadImages?: ({
        record,
        url,
        dom,
        query,
        queryAll,
        content,
    }: {
        record: NewRecord;
        dom: Document;
        query: (query: string, root?: Node) => Element | null;
        queryAll: (query: string, root?: Node) => Array<Element>;
        url: string;
        content: string;
    }) => Promise<Array<string>>;
};

export type Actions = {
    [recordName: string]: Action;
};

export type InternalOptions = {
    debug: boolean;
    dryRun: boolean;
    imageDir?: string;
    format: string;
    timeout: number;
    delay: number;
    indent: number;
    overwrite: boolean;
    downloadTo: "local" | "s3";
    dbName: string;
    exportFile?: string;
    s3?: S3Options;
};

export type S3Options = {
    Bucket: string;
    pathPrefix?: string;
    ACL?: ObjectCannedACL;
};

export type Options = {
    format?: string;
    overwrite?: boolean;
    downloadTo: "local" | "s3";
    dbName: string;
    exportFile?: string;
    imageDir?: string;
    s3?: S3Options;
};

export type PlayscrapeBrowser = {
    browser: BrowserContext;
    page: Page;
};

export type Playscrape = {
    actions: Actions;
    db: BetterSQLite3Database;
};
