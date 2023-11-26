import path from "node:path";
import {drizzle, BetterSQLite3Database} from "drizzle-orm/better-sqlite3";
import {migrate} from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";

import {__dirname} from "./node.js";

export const initDB = ({
    dbName,
    debug = false,
}: {
    dbName: string;
    debug?: boolean;
}): BetterSQLite3Database => {
    class QueryLogger {
        logQuery(query: string, params: unknown[]): void {
            if (debug) {
                console.debug("SQL Query", query);
                console.debug("SQL Params", params);
            }
        }
    }

    const sqlite = new Database(dbName);
    const db: BetterSQLite3Database = drizzle(sqlite, {
        logger: new QueryLogger(),
    });

    migrate(db, {
        migrationsFolder: path.join(__dirname(import.meta), "../drizzle"),
    });

    return db;
};
