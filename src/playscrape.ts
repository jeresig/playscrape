#!/usr/bin/env node
import fs from "node:fs";
import {Argument, Command} from "@commander-js/extra-typings";
import ora from "ora";

import {initDB} from "./db.js";
import {initBrowser, initMirror} from "./index.js";
import {downloads, records} from "./schema.js";
import {Actions, InternalOptions, Options} from "./types.js";

let cachedConfigFile: any = null;

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
    .addArgument(
        new Argument(
            "<mode>",
            "update existing entries in DB, replace DB entirely, export DB to JSON.",
        ).choices(["replace", "update", "export"]),
    )
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
    .option("--dry-run", "do not save any data to the database or file system")
    .option("--timeout <number>", "timeout in milliseconds", "60000")
    .option("--delay <number>", "delay in milliseconds", "1000")
    .option("--overwrite", "overwrite existing files")
    .parse();

(async () => {
    const args = cli.opts();

    const mode = cli.args[0];
    const actionFileName = cli.args[1];

    if (!actionFileName) {
        console.error("No action file specified.");
        process.exit(1);
    }

    const resolvedActionFileName = fs.realpathSync(actionFileName);

    if (!fs.existsSync(resolvedActionFileName)) {
        console.error(`Action file ${actionFileName} does not exist.`);
        process.exit(1);
    }

    const {
        actions,
        options: importOptions,
    }: {actions: Actions; options: Options} = await import(
        resolvedActionFileName
    );

    if (!actions) {
        console.error("No actions found.");
        process.exit(1);
    }

    if (!importOptions) {
        console.error("No options found.");
        process.exit(1);
    }

    const options: InternalOptions = {
        format: "jpg",
        debug: !!args.debug,
        dryRun: !!args.dryRun,
        overwrite: !!args.overwrite,
        timeout: parseInt(args.timeout, 10),
        delay: parseInt(args.delay, 10),
        indent: 2,
        downloadTo: importOptions.s3 ? "s3" : "local",
        ...importOptions,
    };

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
        dbName: options.dbName,
    });

    if (mode === "replace") {
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

    if (mode === "update" || mode === "replace") {
        if (actions.mirror) {
            await initMirror({db, options, actions});
        } else if (actions.start) {
            await initBrowser({db, options, actions});
        } else {
            console.error("No actions found.");
            process.exit(1);
        }
    }

    if (options.exportFile) {
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

        if (options.exportFile) {
            fs.writeFileSync(options.exportFile, resultString, "utf-8");
        } else {
            console.log(resultString);
        }
    }
})();
