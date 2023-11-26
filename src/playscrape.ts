#!/usr/bin/env node
import fs from "node:fs";
import {Command, Option} from "@commander-js/extra-typings";
import ora from "ora";

import {initDB} from "./db.js";
import {records, downloads} from "./schema.js";
import {Options} from "./types.js";
import {initBrowser, initMirror} from "./index.js";

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
    .version(process.env["npm_package_version"] ?? "0.0.0")
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
    .option("--migrations-folder <folder>", "db migrations folder", "drizzle")
    .option("--dry-run", "do not save any data to the database or file system")
    .addOption(
        new Option(
            "--mode <mode>",
            "update existing entries in DB, replace DB entirely, export DB to JSON.",
        )
            .default("update")
            .choices(["replace", "update", "export"]),
    )
    .option("--output <dir>", "download output directory", "downloads")
    .option("--format <format>", "image output format", "webp")
    .option("--timeout <number>", "timeout in milliseconds", "60000")
    .option("--delay <number>", "delay in milliseconds", "1000")
    .parse();

(async function () {
    const args = cli.opts();
    const options: Options = {
        debug: !!args.debug,
        dryRun: !!args.dryRun,
        output: args.output,
        format: args.format,
        timeout: parseInt(args.timeout),
        delay: parseInt(args.delay),
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

    const {dbName, actions} = await import(resolvedActionFileName);

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

    const db = initDB({
        debug: options.debug,
        dbName:
            args.dbName !== DEFAULT_DB ? args.dbName : dbName || args.dbName,
        migrationsFolder: args.migrationsFolder,
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

        console.log(JSON.stringify(finalResults));
        process.exit(0);
    }

    if (args.mode === "replace") {
        const resetSpinner = ora({
            text: `Resetting existing database...`,
        }).start();
        if (options.dryRun) {
            resetSpinner.warn(`Database reset skipped due to --dry-run flag.`);
        } else {
            db.delete(downloads).run();
            db.delete(records).run();
        }
        resetSpinner.succeed(`Database reset complete.`);
    }

    if (args.mode === "update" || args.mode === "replace") {
        if (actions["mirror"]) {
            await initMirror({db, options, actions});
        } else if (actions["start"]) {
            await initBrowser({db, options, actions});
        } else {
            console.error("No actions found.");
            process.exit(1);
        }
    }
})();
