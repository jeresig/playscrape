import {promises as fs} from "node:fs";
import * as path from "node:path";
import * as FastGlob from "fast-glob";
import ora from "ora";

import {initDB} from "../../shared/db.js";
import {InternalOptions, MirrorAction, Playscrape} from "../../shared/types.js";
import {handleExtract} from "../extract/extract.js";

export const MIRROR_ACTION = "mirror";

export const scrapeMirroredFiles = async ({
    options,
    action,
}: {
    options: InternalOptions;
    action: MirrorAction;
}) => {
    const db = initDB({
        debug: options.debug,
        dbName: options.dbName,
    });

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
                    actionName: MIRROR_ACTION,
                    options,
                });
            }
        }
    }
};
