import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * The database client.
 *
 * A deployment without `DATABASE_URL` still has to serve the map: the OSINT
 * feeds, the globe, and the read-only tools all work from public sources and
 * need no database. So the client is optional rather than fatal, and every
 * caller checks `isDatabaseConfigured()` before reaching for it.
 *
 * When a database *is* configured, it becomes the durable record: findings,
 * audit, quotas, and the asset registry all persist across restarts. The
 * in-memory paths stay as a fallback so nothing silently loses data —
 * they are marked as such in their own modules.
 */

const url = process.env.DATABASE_URL;

export const isDatabaseConfigured = Boolean(url);

let client: ReturnType<typeof postgres> | null = null;
let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

if (url) {
  client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    // A schema change should not be applied silently by a running server.
    prepare: false,
  });
  database = drizzle(client, { schema });
}

/** The Drizzle client, or null when no database is configured. */
export function getDb(): ReturnType<typeof drizzle<typeof schema>> | null {
  return database;
}

/**
 * The client, or a thrown error. Use this in code paths that genuinely
 * cannot proceed without a database — migrations, the asset registry, quota
 * accounting — so the failure is explicit rather than a silent no-op.
 */
export function requireDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!database) throw new Error("DATABASE_URL_NOT_SET");
  return database;
}

/** Close the pool. Called on shutdown so the process can exit cleanly. */
export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    database = null;
  }
}
