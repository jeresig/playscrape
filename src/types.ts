import {ObjectCannedACL} from "@aws-sdk/client-s3";
import {BetterSQLite3Database} from "drizzle-orm/better-sqlite3";
import {BrowserContext, Page} from "playwright";

import {NewRecord} from "./schema.js";

export type ExtractAction = {
    getURLFromFileName?: (fileName: string) => string;
    extract?: ({
        dom,
        query,
        queryAll,
        queryText,
        queryAllText,
        url,
        content,
    }: {
        dom: Document;
        query: (query: string, root?: Node) => Element | null;
        queryAll: (query: string, root?: Node) => Array<Element>;
        queryText: (query: string, root?: Node) => string | null;
        queryAllText: (query: string, root?: Node) => Array<string>;
        url: string;
        content: string;
    }) => Promise<any>;
    downloadImages?: ({
        record,
        dom,
        query,
        queryAll,
        queryText,
        queryAllText,
        url,
        content,
    }: {
        record: NewRecord;
        dom: Document;
        query: (query: string, root?: Node) => Element | null;
        queryAll: (query: string, root?: Node) => Array<Element>;
        queryText: (query: string, root?: Node) => string | null;
        queryAllText: (query: string, root?: Node) => Array<string>;
        url: string;
        content: string;
    }) => Promise<Array<string>>;
};

export type MirrorAction = ExtractAction & {
    htmlFiles: string | Array<string>;
};

export type VisitAction = ExtractAction & {
    init?:
        | string
        | (({
              page,
          }: {
              page: Page;
          }) => Promise<void>);
    visit: ({
        page,
        action,
    }: {
        page: Page;
        action: (action: string) => Promise<void>;
    }) => Promise<void>;
    undoVisit?: ({page}: {page: Page}) => Promise<void>;
};

export type BrowserAction = {
    [key: string]: VisitAction;
    start: VisitAction;
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
    db: BetterSQLite3Database;
};
