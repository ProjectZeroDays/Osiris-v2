import "server-only";
import { sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client.server";

/**
 * Whether this instance can actually serve.
 *
 * Liveness and readiness are different questions, and answering one with
 * the other is how an orchestrator ends up sending traffic to an instance
 * that cannot take it.
 *
 * **Liveness** — "is the process up?" — is `/api/health`, and it checks
 * nothing else on purpose. A probe that fans out to a dozen third-party
 * APIs on every call is a self-inflicted outage under load.
 *
 * **Readiness** — "can this instance do its job?" — is what this module
 * answers. A platform with a database it cannot reach, or with the
 * migrations half-applied, or with no account anybody can sign in as, is
 * up and useless. A load balancer that only knows about liveness will
 * send it traffic and take the error in front of the user.
 *
 * The checks are the platform's own facts about itself. Nothing here is
 * learned from a third party, and nothing here says anything about a
 * tenant: this answer is for a probe.
 */

/** How long each check may take. A readiness probe is called often. */
const CHECK_TIMEOUT_MS = 3_000;

/**
 * The tables the platform needs to do its job.
 *
 * A migration that has not been applied is a table that is not there, and
 * a missing table is a platform that cannot hold a session, keep a
 * finding, or record a decision. Checking for the tables rather than for
 * a migration number means the check works in a build where the migration
 * files are not on disk.
 */
const REQUIRED_TABLES = [
  "tenants",
  "users",
  "sessions",
  "assets",
  "consents",
  "findings",
  "integration_audit",
  "quota_counters",
] as const;

/** One check's answer. */
export interface Check {
  /** Whether this check passed. */
  ok: boolean;
  /** What it found, in a form a person can act on. */
  detail: string;
  /** How long it took, in milliseconds. */
  ms: number;
}

export interface Readiness {
  /** Whether every check passed. */
  ready: boolean;
  /** The checks, by name. */
  checks: Record<string, Check>;
  /** The names of the checks that failed, in the order they ran. */
  blockers: string[];
  /** When this answer was produced. */
  at: string;
}

/**
 * The reason a check failed, in a form a person can act on.
 *
 * A driver error carries the query and its parameters alongside the
 * reason, and a readiness probe's answer is read by a load balancer and
 * pasted into a dashboard. The query is noise there; the reason is the
 * thing. So the reason is taken from the cause when there is one.
 */
function reasonOf(e: unknown): string {
  const cause = e instanceof Error && e.cause instanceof Error ? e.cause : e;
  const message = cause instanceof Error ? cause.message : String(cause);
  const first = message.split("\n")[0].trim();
  return first.length > 300 ? `${first.slice(0, 300)}…` : first;
}

/** Run a check under a timeout, so one slow thing cannot stall the probe. */
async function timed(fn: () => Promise<Check>): Promise<Check> {
  const started = Date.now();
  try {
    return await Promise.race([
      fn(),
      new Promise<Check>((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: false,
              detail: `The check did not answer within ${CHECK_TIMEOUT_MS}ms.`,
              ms: Date.now() - started,
            }),
          CHECK_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (e) {
    return {
      ok: false,
      detail: reasonOf(e),
      ms: Date.now() - started,
    };
  }
}

/**
 * The database: is it there, and are the tables the platform needs?
 */
async function checkDatabase(): Promise<Check> {
  if (!isDatabaseConfigured) {
    // Not a blocker. A platform with no database runs single-tenant and
    // keeps the record in memory; that is a supported shape, and calling
    // it not ready would take a working deployment out of rotation.
    return {
      ok: true,
      detail: "No database is configured; the platform runs single-tenant.",
      ms: 0,
    };
  }

  const db = getDb();
  if (!db) {
    return { ok: false, detail: "A database is configured but no client is open.", ms: 0 };
  }

  const rows = await db.execute<{ table_name: string }>(
    // The list is in parentheses, or it is not an `IN` clause at all:
    // `IN $1, $2` is a syntax error, and `IN ($1, $2)` is what was meant.
    sql`SELECT table_name FROM information_schema.tables
        WHERE table_schema = current_schema()
        AND table_name IN (${sql.join(
          REQUIRED_TABLES.map((t) => sql`${t}`),
          sql`, `,
        )})`,
  );
  const present = new Set(
    (rows as unknown as { table_name: string }[]).map((r) => r.table_name),
  );
  const missing = REQUIRED_TABLES.filter((t) => !present.has(t));

  if (missing.length > 0) {
    return {
      ok: false,
      detail: `The database is reachable but ${missing.length} table(s) are missing: ${missing.join(", ")}. Apply the migrations.`,
      ms: 0,
    };
  }

  return {
    ok: true,
    detail: `The database is reachable and all ${REQUIRED_TABLES.length} tables are present.`,
    ms: 0,
  };
}

/**
 * Is there anybody who can sign in?
 *
 * A platform with a database and no accounts is up and useless: it demands
 * a session, and there is nobody to make one for. The first-run screen
 * creates the first administrator, and until it does, the platform is
 * waiting for an operator rather than serving one.
 */
async function checkAccounts(): Promise<Check> {
  if (!isDatabaseConfigured) {
    return {
      ok: true,
      detail: "Single-tenant; there is no account to sign in as.",
      ms: 0,
    };
  }

  const db = getDb();
  if (!db) {
    return { ok: false, detail: "No database client is open.", ms: 0 };
  }

  const rows = await db.execute<{ count: string }>(
    sql`SELECT count(*)::text AS count FROM users WHERE disabled_at IS NULL`,
  );
  const count = Number((rows as unknown as { count: string }[])[0]?.count ?? "0");

  if (count === 0) {
    return {
      ok: false,
      detail:
        "The platform has no account anybody can sign in as. Open it once to create the first administrator, or run the first-run setup.",
      ms: 0,
    };
  }

  return { ok: true, detail: `${count} account(s) can sign in.`, ms: 0 };
}

/**
 * The tool-collection worker.
 *
 * The worker is not required — a platform without it works, with the
 * wide collection unavailable. But a worker that is *configured* and is
 * not answering is a platform that will fail every call to the
 * collection, and the operator should hear about it from a probe rather
 * than from a user.
 */
async function checkWorker(): Promise<Check> {
  const url = process.env.OSIRIS_WORKER_URL;
  if (!url) {
    return {
      ok: true,
      detail: "No tool-collection worker is configured; the wide collection is unavailable.",
      ms: 0,
    };
  }

  const started = Date.now();
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/api/health`, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        ok: false,
        detail: `The tool-collection worker answered ${res.status}.`,
        ms: Date.now() - started,
      };
    }
    return {
      ok: true,
      detail: "The tool-collection worker is answering.",
      ms: Date.now() - started,
    };
  } catch (e) {
    return {
      ok: false,
      detail: `The tool-collection worker could not be reached: ${reasonOf(e)}`,
      ms: Date.now() - started,
    };
  }
}

/**
 * The whole answer.
 *
 * Every check runs, even after one fails: an operator who has three
 * things wrong should be told all three, not one at a time.
 */
export async function readiness(): Promise<Readiness> {
  const [database, accounts, worker] = await Promise.all([
    timed(checkDatabase),
    timed(checkAccounts),
    timed(checkWorker),
  ]);

  const checks: Record<string, Check> = { database, accounts, worker };
  const blockers = Object.entries(checks)
    .filter(([, c]) => !c.ok)
    .map(([name]) => name);

  return {
    ready: blockers.length === 0,
    checks,
    blockers,
    at: new Date().toISOString(),
  };
}
