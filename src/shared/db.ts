import * as path from "node:path";
import {type NodePgDatabase, drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import {__dirname} from "./node.js";
import * as schema from "./schema.js";

export const initDB = async ({
    debug = false,
}: {
    dbName: string;
    debug?: boolean;
}): Promise<NodePgDatabase<typeof schema>> => {
    class QueryLogger {
        logQuery(query: string, params: unknown[]): void {
            if (debug) {
                console.debug("SQL Query", query);
                console.debug("SQL Params", params);
            }
        }
    }

    const client = new pg.Client({
        database: process.env.PGDATABASE || "playscrape",
    });

    await client.connect();

    const db = drizzle(client, {
        logger: new QueryLogger(),
        schema,
    });

    try {
        await migrate(db, {
            migrationsFolder: path.join(
                __dirname(import.meta),
                "../../drizzle",
            ),
        });
    } catch (e) {
        console.error("Failed to migrate database schema.");
        console.error(e);
        process.exit(1);
    }

    return db;
};
