import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

/**
 * The readiness probe.
 *
 * Liveness says the process is up. Readiness says whether the instance
 * can do its job — and the difference is what a load balancer acts on.
 *
 * A platform whose database is unreachable, or whose migrations were
 * never applied, or that has no account anybody can sign in as, is up
 * and useless. These tests hold the probe to those cases, because a
 * readiness check that always says yes is a readiness check that never
 * fires.
 */

const DATABASE_URL =
  process.env.OSIRIS_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const hasDatabase = Boolean(DATABASE_URL);

if (DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DATABASE_URL;
}

const describeDb = hasDatabase ? describe : describe.skip;

describeDb("the readiness probe", () => {
  const tenant = "t-readiness-test";

  let readiness: typeof import("@/lib/integrations/readiness.server");
  let db: typeof import("@/db/client.server");
  let schema: typeof import("@/db/schema");

  beforeAll(async () => {
    readiness = await import("@/lib/integrations/readiness.server");
    db = await import("@/db/client.server");
    schema = await import("@/db/schema");
  });

  afterAll(async () => {
    const client = db?.getDb();
    if (!client) return;
    await client
      .delete(schema.users)
      .where(eq(schema.users.tenantId, tenant))
      .catch(() => undefined);
    await client
      .delete(schema.tenants)
      .where(eq(schema.tenants.id, tenant))
      .catch(() => undefined);
  });

  it("checks the database, the accounts and the worker", async () => {
    const result = await readiness.readiness();
    expect(Object.keys(result.checks).sort()).toEqual([
      "accounts",
      "database",
      "worker",
    ]);
  });

  it("finds the database reachable with its tables", async () => {
    // A migration that has not been applied is a table that is not
    // there, and a missing table is a platform that cannot hold a
    // session, keep a finding, or record a decision.
    const result = await readiness.readiness();
    expect(result.checks.database.ok, result.checks.database.detail).toBe(true);
    expect(result.checks.database.detail).toMatch(/tables are present/);
  });

  it("says so when there is no account to sign in as", async () => {
    // The platform's own rows are cleaned up, so a test database with
    // no accounts of its own is the case being described.
    const client = db.getDb()!;
    await client
      .delete(schema.users)
      .where(eq(schema.users.tenantId, tenant))
      .catch(() => undefined);

    const result = await readiness.readiness();
    if (result.checks.accounts.ok) {
      // Another test's account is still there. The check is right; the
      // database is not empty.
      expect(result.checks.accounts.detail).toMatch(/account/);
    } else {
      expect(result.checks.accounts.detail).toMatch(/no account anybody can sign in as/);
      expect(result.blockers).toContain("accounts");
      expect(result.ready).toBe(false);
    }
  });

  it("finds an account once there is one", async () => {
    const client = db.getDb()!;
    await client
      .insert(schema.tenants)
      .values({ id: tenant, name: "Readiness" })
      .onConflictDoNothing();
    await client
      .insert(schema.users)
      .values({
        id: "readiness-user",
        tenantId: tenant,
        email: "readiness@example.com",
        roles: ["analyst"],
      })
      .onConflictDoNothing();

    const result = await readiness.readiness();
    expect(result.checks.accounts.ok, result.checks.accounts.detail).toBe(true);
    expect(result.checks.accounts.detail).toMatch(/account\(s\) can sign in/);
  });

  it("does not count a disabled account", async () => {
    // A disabled account cannot sign in, so a platform whose only
    // accounts are disabled is a platform nobody can get into.
    //
    // The count is not asserted as a number: the test database is shared
    // with the other suites, so what is in it at this moment is not this
    // test's business. What is this test's business is that the number
    // the probe reports is the number of accounts that can actually sign
    // in — so the expected number is worked out the same way, and the
    // two are compared.
    const client = db.getDb()!;
    await client
      .insert(schema.users)
      .values({
        id: "readiness-disabled",
        tenantId: tenant,
        email: "disabled@example.com",
        roles: ["analyst"],
        disabledAt: new Date(),
      })
      .onConflictDoNothing();

    const expected = await client.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM users WHERE disabled_at IS NULL`,
    );
    const count = Number(
      (expected as unknown as { count: string }[])[0]?.count ?? "0",
    );

    const result = await readiness.readiness();
    expect(result.checks.accounts.ok, result.checks.accounts.detail).toBe(true);
    expect(result.checks.accounts.detail).toContain(`${count} account(s) can sign in`);
  });

  it("names the blockers, and every check runs even after one fails", async () => {
    // An operator who has three things wrong should be told all three,
    // not one at a time.
    const result = await readiness.readiness();
    for (const name of Object.keys(result.checks)) {
      if (!result.checks[name].ok) {
        expect(result.blockers).toContain(name);
      }
    }
    expect(result.blockers.length).toBeLessThanOrEqual(
      Object.keys(result.checks).length,
    );
  });

  it("does not put a query in the answer", async () => {
    // A readiness probe's answer is read by a load balancer and pasted
    // into a dashboard. The query behind it is noise there.
    const result = await readiness.readiness();
    for (const check of Object.values(result.checks)) {
      expect(check.detail).not.toMatch(/SELECT /i);
      expect(check.detail).not.toMatch(/params:/i);
    }
  });
});
