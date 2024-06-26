import type {Config} from "drizzle-kit";

export default {
    schema: "./src/shared/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        host: "localhost",
        database: "playscrape",
    },
} satisfies Config;
