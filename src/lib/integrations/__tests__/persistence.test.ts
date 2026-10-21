import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import {
  retentionFor,
  persistFindings,
  listFindings,
} from "@/lib/integrations/persistence.server";
import type { SecurityFinding } from "@/lib/integrations/types";

/**
 * The durable record of what the tools found.
 *
 * The platform has two shapes: with a database, where findings are kept;
 * and without one, where they are returned but not kept — and where the
 * platform says plainly that it kept nothing. Both are tested here, and
 * which one runs depends on whether a database was configured for the
 * suite. A test that only covers one of them would leave the other
 * unproven, and CI runs with a database while a bare deployment does not.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const finding = (over: Partial<SecurityFinding> = {}): SecurityFinding => ({
  id: "tool:f1",
  toolId: "tool-collection",
  assetId: null,
  tenantId: "t1",
  sourceUrl: null,
  observedAt: null,
  importedAt: new Date().toISOString(),
  severity: "medium",
  confidence: 0.6,
  status: "inferred",
  evidenceHash: "a".repeat(64),
  retentionUntil: null,
  properties: { attribution: "tool-asserted" },
  ...over,
});

describe("the retention deadline", () => {
  it("gives a tool's findings a deadline", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const d = retentionFor("tool-collection", from);
    expect(d).not.toBeNull();
    expect(d!.toISOString().slice(0, 10)).toBe("2026-01-31");
  });

  it("gives a tool that keeps nothing no deadline", () => {
    // The AI settings tool keeps no findings at all, so it has no
    // deadline and nothing to prune.
    expect(retentionFor("ai-settings")).toBeNull();
  });

  it("gives an unknown tool no deadline", () => {
    expect(retentionFor("not-a-tool")).toBeNull();
  });
});

describe("persisting findings without a database", () => {
  it.skipIf(hasDatabase)("keeps nothing, and says so", async () => {
    // A deployment without a database still gets its finding back; it
    // just does not keep it, and it says so rather than implying it did.
    const result = await persistFindings("tool-collection", "t1", [finding()]);
    expect(result.persisted).toBe(false);
    expect(result.count).toBe(0);
    expect(result.reason).toBe("NO_DATABASE_CONFIGURED");
  });

  it.skipIf(hasDatabase)("lists nothing", async () => {
    expect(await listFindings("t1")).toEqual([]);
  });

  it("has nothing to write when there are no findings", async () => {
    // True either way: an empty list is not a write whether or not there
    // is somewhere to write it.
    const result = await persistFindings("tool-collection", "t1", []);
    expect(result.persisted).toBe(false);
    expect(result.reason).toBe("NO_FINDINGS");
  });
});

describe("persisting findings with a database", () => {
  const tenant = "t-persistence-test";
  const otherTenant = "t-other-tenant";

  /** A finding belongs to a tenant, and the table insists on one. */
  async function ensureTenant(id: string) {
    const { getDb } = await import("@/db/client.server");
    const { tenants } = await import("@/db/schema");
    const db = getDb();
    if (!db) return;
    await db
      .insert(tenants)
      .values({ id, name: id })
      .onConflictDoNothing()
      .catch(() => undefined);
  }

  afterAll(async () => {
    if (!hasDatabase) return;
    const { getDb } = await import("@/db/client.server");
    const { findings, tenants } = await import("@/db/schema");
    const db = getDb();
    if (!db) return;
    await db.delete(findings).where(eq(findings.tenantId, tenant)).catch(() => undefined);
    await db.delete(findings).where(eq(findings.tenantId, otherTenant)).catch(() => undefined);
    await db.delete(tenants).where(eq(tenants.id, tenant)).catch(() => undefined);
    await db.delete(tenants).where(eq(tenants.id, otherTenant)).catch(() => undefined);
  });

  it.skipIf(!hasDatabase)("keeps the finding, and gives it back", async () => {
    await ensureTenant(tenant);
    const result = await persistFindings("tool-collection", tenant, [
      finding({ id: "tool:persist-1", tenantId: tenant }),
    ]);
    expect(result.persisted).toBe(true);
    expect(result.count).toBe(1);

    const listed = await listFindings(tenant);
    expect(listed.length).toBe(1);
    expect(listed[0].id).toBe("tool:persist-1");
    expect(listed[0].status).toBe("inferred");
    expect(listed[0].evidenceHash).toBe("a".repeat(64));
    // The deadline is applied on the way in, so the row can be pruned
    // without anybody having to remember to set it.
    expect(listed[0].retentionUntil).not.toBeNull();
  });

  it.skipIf(!hasDatabase)("keeps one row when the same finding is recorded twice", async () => {
    await ensureTenant(tenant);
    await persistFindings("tool-collection", tenant, [
      finding({ id: "tool:persist-2", tenantId: tenant }),
    ]);
    const second = await persistFindings("tool-collection", tenant, [
      finding({
        id: "tool:persist-2",
        tenantId: tenant,
        severity: "high",
        importedAt: new Date().toISOString(),
      }),
    ]);
    expect(second.persisted).toBe(true);

    const listed = await listFindings(tenant, "tool-collection");
    const matches = listed.filter((f) => f.id === "tool:persist-2");
    expect(matches.length).toBe(1);
    expect(matches[0].severity).toBe("high");
  });

  it.skipIf(!hasDatabase)("keeps a tenant's findings apart", async () => {
    await ensureTenant(tenant);
    await ensureTenant(otherTenant);
    await persistFindings("tool-collection", tenant, [
      finding({ id: "tool:persist-3", tenantId: tenant }),
    ]);
    await persistFindings("tool-collection", otherTenant, [
      finding({ id: "tool:persist-4", tenantId: otherTenant }),
    ]);

    const mine = await listFindings(tenant);
    expect(mine.every((f) => f.tenantId === tenant)).toBe(true);
    expect(mine.some((f) => f.id === "tool:persist-4")).toBe(false);
  });
});
