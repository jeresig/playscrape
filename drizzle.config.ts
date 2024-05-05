import type {Config} from "drizzle-kit";

export default {
    schema: "./src/shared/schema.ts",
    out: "./drizzle",
} satisfies Config;
