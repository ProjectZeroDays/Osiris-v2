import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { consumeQuota, readQuota, pruneMemoryQuotas } from "@/lib/integrations/quota.server";
import {
  recordSuccess,
  recordFailure,
  getHealth,
  isCoolingDown,
  cooldownRemaining,
  allHealth,
} from "@/lib/integrations/health.server";

/**
 * The quota counters.
 *
 * With a database the counters are durable, so a test that used a fixed
 * tenant name would start failing the second time the suite ran against
 * the same database — the counter would still hold yesterday's calls.
 * Each test therefore uses a tenant of its own and removes it afterwards.
 */

const tenants = new Set<string>();

/** A tenant id that has never been used before. */
function freshTenant(prefix: string): string {
  const id = `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  tenants.add(id);
  return id;
}

afterAll(async () => {
  if (tenants.size === 0) return;
  const { getDb } = await import("@/db/client.server");
  const { quotaCounters } = await import("@/db/schema");
  const db = getDb();
  if (!db) return;
  for (const tenantId of tenants) {
    await db
      .delete(quotaCounters)
      .where(eq(quotaCounters.tenantId, tenantId))
      .catch(() => undefined);
  }
});

describe("quota", () => {
  it("allows calls up to the limit and then refuses", async () => {
    const limit = 3;
    const tenant = freshTenant("t-quota");
    for (let i = 0; i < limit; i++) {
      const d = await consumeQuota(tenant, "shodan", limit);
      expect(d.allowed).toBe(true);
    }
    const refused = await consumeQuota(tenant, "shodan", limit);
    expect(refused.allowed).toBe(false);
    expect(refused.reason).toBe("QUOTA_EXCEEDED");
  });

  it("counts each tool separately", async () => {
    const tenant = freshTenant("t-quota-2");
    await consumeQuota(tenant, "shodan", 1);
    const other = await consumeQuota(tenant, "metasploit", 1);
    expect(other.allowed).toBe(true);
  });

  it("reads the count without consuming", async () => {
    const tenant = freshTenant("t-quota-3");
    await consumeQuota(tenant, "sherlock", 10);
    const before = await readQuota(tenant, "sherlock");
    await readQuota(tenant, "sherlock");
    const after = await readQuota(tenant, "sherlock");
    expect(after.used).toBe(before.used);
  });

  it("prunes old memory counters without throwing", () => {
    expect(typeof pruneMemoryQuotas()).toBe("number");
  });
});

describe("health", () => {
  it("starts healthy", () => {
    expect(getHealth("fresh-source").health).toBe("healthy");
  });

  it("becomes degraded after repeated failures", () => {
    recordFailure("degrading-source", "boom");
    recordFailure("degrading-source", "boom");
    expect(getHealth("degrading-source").health).toBe("degraded");
  });

  it("becomes down and cools off after more failures", () => {
    for (let i = 0; i < 4; i++) recordFailure("failing-source", "boom");
    expect(getHealth("failing-source").health).toBe("down");
    expect(isCoolingDown("failing-source")).toBe(true);
    expect(cooldownRemaining("failing-source")).toBeGreaterThan(0);
  });

  it("recovers on a success", () => {
    for (let i = 0; i < 4; i++) recordFailure("recovering-source", "boom");
    recordSuccess("recovering-source");
    const s = getHealth("recovering-source");
    expect(s.health).toBe("healthy");
    expect(s.consecutiveFailures).toBe(0);
    expect(isCoolingDown("recovering-source")).toBe(false);
  });

  it("lists every source it knows about", () => {
    recordFailure("listed-source", "boom");
    expect(Object.keys(allHealth())).toContain("listed-source");
  });
});
