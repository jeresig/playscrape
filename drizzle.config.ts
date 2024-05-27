import type {Config} from "drizzle-kit";

export default {
    schema: "./src/shared/schema.ts",
    out: "./drizzle",
    driver: "pg",
    dbCredentials: {
        host: "localhost",
        database: "playscrape",
    },
} satisfies Config;
