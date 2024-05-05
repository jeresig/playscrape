import * as path from "node:path";
import Database from "better-sqlite3";
import {BetterSQLite3Database, drizzle} from "drizzle-orm/better-sqlite3";
import {migrate} from "drizzle-orm/better-sqlite3/migrator";

import {__dirname} from "./node.js";
import * as schema from "./schema.js";

export const initDB = ({
    dbName,
    debug = false,
}: {
    dbName: string;
    debug?: boolean;
}): BetterSQLite3Database<typeof schema> => {
    class QueryLogger {
        logQuery(query: string, params: unknown[]): void {
            if (debug) {
                console.debug("SQL Query", query);
                console.debug("SQL Params", params);
            }
        }
    }

    const sqlite = new Database(dbName);
    const db = drizzle(sqlite, {
        logger: new QueryLogger(),
        schema,
    });

    migrate(db, {
        migrationsFolder: path.join(__dirname(import.meta), "../drizzle"),
    });

    return db;
};
