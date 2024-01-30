#!/usr/bin/env node
import fs from "node:fs";
import {ObjectCannedACL, S3Client} from "@aws-sdk/client-s3";
import {Command, Option} from "@commander-js/extra-typings";
import ora from "ora";

import {initDB} from "./db.js";
import {initBrowser, initMirror} from "./index.js";
import {downloads, records} from "./schema.js";
import {Options} from "./types.js";

let cachedConfigFile: any = null;
const DEFAULT_DB = "playscrape.sqlite";

const readConfig = (configPath: string) => {
    if (cachedConfigFile) {
        return cachedConfigFile;
    }

    try {
        const config = fs.readFileSync(configPath, "utf-8");
        cachedConfigFile = JSON.parse(config);
        return cachedConfigFile;
    } catch (error) {
        console.error("Failed to read config file", error);
        process.exit(1);
    }
};

const cli = new Command()
    .name("playscrape")
    .description(
        "Scrape data from a website using Playwright, or local HTML files.",
    )
    .version(process.env.npm_package_version ?? "0.0.0")
    .argument("<action_file>", "JS file defining the actions to perform.")
    .option("--config <path>", "path to configuration file")
    .hook("preSubcommand", async (hookedCommand, subCommand) => {
        const configPath = hookedCommand.opts().config;
        const config = configPath ? await readConfig(configPath) : {};
        for (const [key, value] of Object.entries(config)) {
            subCommand.setOptionValue(key, value);
        }
    })
    .option("--debug", "output extra debugging information")
    .option("--db-name <name>", "database name", DEFAULT_DB)
    .option("--dry-run", "do not save any data to the database or file system")
    .addOption(
        new Option(
            "--mode <mode>",
            "update existing entries in DB, replace DB entirely, export DB to JSON.",
        )
            .default("update")
            .choices(["replace", "update", "export"]),
    )
    .option(
        "--export-file <file>",
        "the JSON file to export to, if using export mode",
    )
    .option("--output <dir>", "download output directory", "downloads")
    .option("--format <format>", "image output format", "webp")
    .option("--timeout <number>", "timeout in milliseconds", "60000")
    .option("--delay <number>", "delay in milliseconds", "1000")
    .option("--overwrite", "overwrite existing files")
    .addOption(
        new Option(
            "--download-to <location>",
            "where to download the images to.",
        )
            .default("local")
            .choices(["local", "s3"]),
    )
    .option(
        "--s3-bucket <bucket>",
        "S3 bucket to upload to, required if download-to is s3.",
    )
    .option("--s3-path <path>", "S3 path to upload to.")
    .addOption(
        new Option("--s3-acl <acl>", "S3 ACL permissions to set.")
            .default<ObjectCannedACL>("private")
            .choices<ObjectCannedACL[]>([
                "private",
                "authenticated-read",
                "aws-exec-read",
                "bucket-owner-full-control",
                "bucket-owner-read",
                "public-read",
                "public-read-write",
            ]),
    )
    .parse();

(async () => {
    const args = cli.opts();
    const options: Options = {
        debug: !!args.debug,
        dryRun: !!args.dryRun,
        output: args.output,
        format: args.format,
        timeout: parseInt(args.timeout, 10),
        delay: parseInt(args.delay, 10),
        overwrite: !!args.overwrite,
        downloadTo: args.downloadTo === "local" ? "local" : "s3",
        s3Bucket: args.s3Bucket,
        s3Path: args.s3Path,
        s3ACL: args.s3Acl,
        indent: 2,
    };

    const actionFileName = cli.args[0];

    if (!actionFileName) {
        console.error("No action file specified.");
        process.exit(1);
    }

    const resolvedActionFileName = fs.realpathSync(actionFileName);

    if (!fs.existsSync(resolvedActionFileName)) {
        console.error(`Action file ${actionFileName} does not exist.`);
        process.exit(1);
    }

    const {dbName, exportFile, actions} = await import(resolvedActionFileName);

    if (
        !actions ||
        typeof actions !== "object" ||
        Object.keys(actions).length === 0
    ) {
        console.error(
            "No actions found. Make sure you export an actions object.",
        );
        process.exit(1);
    }

    if (options.downloadTo === "s3") {
        if (!options.s3Bucket) {
            throw new Error(
                "S3 bucket not specified, must be specified if --download-to=s3.",
            );
        }

        options.aws = new S3Client();
    }

    const db = initDB({
        debug: options.debug,
        dbName:
            args.dbName !== DEFAULT_DB ? args.dbName : dbName || args.dbName,
    });

    if (args.mode === "export") {
        const results = db
            .select({
                id: records.id,
                url: records.url,
                data: records.extracted,
            })
            .from(records)
            .all();

        const finalResults: Array<{
            id: string;
            url: string;
        }> = [];

        for (const result of results) {
            finalResults.push({
                id: result.id,
                url: result.url,
                ...(result.data ? JSON.parse(result.data) : null),
            });
        }

        const resultString = JSON.stringify(finalResults);

        if (args.exportFile || exportFile) {
            fs.writeFileSync(
                args.exportFile || exportFile,
                resultString,
                "utf-8",
            );
        } else {
            console.log(resultString);
        }

        process.exit(0);
    }

    if (args.mode === "replace") {
        const resetSpinner = ora({
            text: "Resetting existing database...",
        }).start();
        if (options.dryRun) {
            resetSpinner.warn("Database reset skipped due to --dry-run flag.");
        } else {
            db.delete(downloads).run();
            db.delete(records).run();
        }
        resetSpinner.succeed("Database reset complete.");
    }

    if (args.mode === "update" || args.mode === "replace") {
        if (actions.mirror) {
            await initMirror({db, options, actions});
        } else if (actions.start) {
            await initBrowser({db, options, actions});
        } else {
            console.error("No actions found.");
            process.exit(1);
        }
    }
})();
