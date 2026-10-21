import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * The cost of a call.
 *
 * A cost that is declared but never recorded is a promise the platform
 * does not keep, and a cost that is recorded but not reported is a bill
 * nobody can read. Both halves are here: the call is made, the counter
 * is written, and the route says what it spent.
 */

const { jar } = vi.hoisted(() => ({ jar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  }),
}));

const DATABASE_URL =
  process.env.OSIRIS_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const hasDatabase = Boolean(DATABASE_URL);

if (DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DATABASE_URL;
}

const describeDb = hasDatabase ? describe : describe.skip;

describeDb("the cost of a call", () => {
  const tenant = "t-cost-test";
  const otherTenant = "t-cost-other";

  let quota: typeof import("@/lib/integrations/quota.server");
  let costs: typeof import("@/lib/integrations/costs.server");
  let db: typeof import("@/db/client.server");
  let schema: typeof import("@/db/schema");

  beforeAll(async () => {
    quota = await import("@/lib/integrations/quota.server");
    costs = await import("@/lib/integrations/costs.server");
    db = await import("@/db/client.server");
    schema = await import("@/db/schema");
  }, 60_000);

  afterAll(async () => {
    const client = db?.getDb();
    if (!client) return;
    for (const id of [tenant, otherTenant]) {
      await client
        .delete(schema.quotaCounters)
        .where(eq(schema.quotaCounters.tenantId, id))
        .catch(() => undefined);
    }
  });

  it("records the cost of a call that costs something", async () => {
    const client = db.getDb()!;
    await client
      .delete(schema.quotaCounters)
      .where(eq(schema.quotaCounters.tenantId, tenant))
      .catch(() => undefined);

    await quota.consumeQuota(tenant, "shodan", 100, {
      units: 1,
      unit: "shodan-query",
    });

    const lines = await quota.readCosts(tenant);
    const shodan = lines.find((l) => l.tool === "shodan");
    expect(shodan).toBeDefined();
    expect(shodan!.calls).toBe(1);
    expect(shodan!.units).toBe(1);
    expect(shodan!.unit).toBe("shodan-query");
  });

  it("records a free call as free", async () => {
    const client = db.getDb()!;
    await client
      .delete(schema.quotaCounters)
      .where(eq(schema.quotaCounters.tenantId, tenant))
      .catch(() => undefined);

    await quota.consumeQuota(tenant, "metasploit", 100, {
      units: 0,
      unit: "free",
    });

    const lines = await quota.readCosts(tenant);
    const metasploit = lines.find((l) => l.tool === "metasploit");
    expect(metasploit).toBeDefined();
    // The call is counted. It cost nothing. Those are different facts,
    // and both are recorded.
    expect(metasploit!.calls).toBe(1);
    expect(metasploit!.units).toBe(0);
    expect(metasploit!.unit).toBe("free");
  });

  it("adds up across the day's calls", async () => {
    const client = db.getDb()!;
    await client
      .delete(schema.quotaCounters)
      .where(eq(schema.quotaCounters.tenantId, tenant))
      .catch(() => undefined);

    for (let i = 0; i < 3; i++) {
      await quota.consumeQuota(tenant, "shodan", 100, {
        units: 1,
        unit: "shodan-query",
      });
    }

    const lines = await quota.readCosts(tenant);
    const shodan = lines.find((l) => l.tool === "shodan");
    expect(shodan!.calls).toBe(3);
    expect(shodan!.units).toBe(3);
  });

  it("keeps one tenant's spending from another's", async () => {
    const client = db.getDb()!;
    for (const id of [tenant, otherTenant]) {
      await client
        .delete(schema.quotaCounters)
        .where(eq(schema.quotaCounters.tenantId, id))
        .catch(() => undefined);
    }

    await quota.consumeQuota(tenant, "shodan", 100, {
      units: 5,
      unit: "shodan-query",
    });
    await quota.consumeQuota(otherTenant, "shodan", 100, {
      units: 2,
      unit: "shodan-query",
    });

    const mine = await quota.readCosts(tenant);
    expect(mine.find((l) => l.tool === "shodan")!.units).toBe(5);

    const theirs = await quota.readCosts(otherTenant);
    expect(theirs.find((l) => l.tool === "shodan")!.units).toBe(2);
  });

  it("reads back the cost a capability declares", async () => {
    // The table and the counter are the two halves of the same fact.
    expect(costs.costFor("shodan", "host.lookupVerifiedAsset")).toEqual({
      units: 1,
      unit: "shodan-query",
    });
  });
});
