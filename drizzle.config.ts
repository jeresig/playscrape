import type {Config} from "drizzle-kit";

export default ({
    schema: "./src/shared/schema.ts",
    out: "./drizzle",

    // See: https://github.com/drizzle-team/drizzle-orm/issues/393
    breakpoints: true,
} satisfies Config);
