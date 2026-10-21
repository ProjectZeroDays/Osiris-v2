import type { Config } from "drizzle-kit";

/**
 * Drizzle Kit configuration.
 *
 * `npx drizzle-kit generate` writes the migration SQL to ./drizzle, and
 * `npx drizzle-kit migrate` applies it. Both need DATABASE_URL; a
 * deployment without one has no database and so no migrations.
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
