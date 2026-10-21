import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * The findings route, against a real database.
 *
 * The route is the way a caller asks "what did the tools find". A query
 * that quietly matched nothing would be worse than an error: the caller
 * would believe the tools had found nothing, when in fact the answer was
 * simply not being looked up.
 *
 * The tests need a database, and are skipped when there is none.
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

describeDb("the findings route", () => {
  const tenant = "t-findings-test";
  const otherTenant = "t-findings-other";

  let route: typeof import("../findings/route");
  let db: typeof import("@/db/client.server");
  let schema: typeof import("@/db/schema");
  let auth: typeof import("@/lib/auth/session.server");

  beforeAll(async () => {
    route = await import("../findings/route");
    db = await import("@/db/client.server");
    schema = await import("@/db/schema");
    auth = await import("@/lib/auth/session.server");
  }, 60_000);

  afterAll(async () => {
    const client = db?.getDb();
    if (!client) return;
    for (const id of [tenant, otherTenant]) {
      await client
        .delete(schema.findings)
        .where(eq(schema.findings.tenantId, id))
        .catch(() => undefined);
      await client
        .delete(schema.sessions)
        .where(eq(schema.sessions.tenantId, id))
        .catch(() => undefined);
      await client
        .delete(schema.users)
        .where(eq(schema.users.tenantId, id))
        .catch(() => undefined);
      await client
        .delete(schema.tenants)
        .where(eq(schema.tenants.id, id))
        .catch(() => undefined);
    }
  });

  /** A tenant with a user, a password, and a session. */
  async function makeTenant(id: string) {
    const client = db.getDb()!;
    const userId = `user-${id}`;
    const passwordHash = await import("@/lib/auth/password.server").then((m) =>
      m.hashPassword("correct-horse-battery"),
    );
    await client
      .insert(schema.tenants)
      .values({ id, name: id })
      .onConflictDoNothing();
    await client
      .insert(schema.users)
      .values({
        id: userId,
        tenantId: id,
        email: `${id}@example.com`,
        roles: ["analyst"],
        passwordHash,
      })
      .onConflictDoNothing();

    const issued = await auth.createSession(userId);
    jar.set(auth.SESSION_COOKIE, issued!.token);
    return { userId, token: issued!.token };
  }

  /** A finding, written the way the dispatcher writes one. */
  async function makeFinding(id: string, toolId: string, tenantId: string) {
    const client = db.getDb()!;
    await client
      .insert(schema.findings)
      .values({
        id,
        toolId,
        tenantId,
        importedAt: new Date(),
        severity: "high",
        confidence: 0.7,
        status: "inferred",
        properties: { attribution: "tool-asserted" },
      })
      .onConflictDoUpdate({
        target: schema.findings.id,
        set: { toolId, tenantId, severity: "high", status: "inferred" },
      });
  }

  it("refuses a caller with no session", async () => {
    jar.delete(auth.SESSION_COOKIE);
    const res = await route.GET(new Request("http://localhost/api/integrations/findings"));
    expect(res.status).toBe(401);
  });

  it("returns every finding of the tenant when no tool is named", async () => {
    await makeTenant(tenant);
    await makeFinding("f-a", "metasploit", tenant);
    await makeFinding("f-b", "exploit-index", tenant);

    const res = await route.GET(
      new Request("http://localhost/api/integrations/findings?geospatial=0"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // The bug this covers: a query that matched nothing would answer 200
    // with an empty list, and the caller would believe the tools had found
    // nothing at all.
    expect(body.count).toBe(2);
    expect(body.findings.map((f: { id: string }) => f.id).sort()).toEqual([
      "f-a",
      "f-b",
    ]);
  });

  it("returns only the named tool's findings when one is named", async () => {
    await makeTenant(tenant);
    await makeFinding("f-a", "metasploit", tenant);
    await makeFinding("f-b", "exploit-index", tenant);

    const res = await route.GET(
      new Request(
        "http://localhost/api/integrations/findings?geospatial=0&tool=metasploit",
      ),
    );
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.findings[0].id).toBe("f-a");
  });

  it("keeps one tenant's findings from another's", async () => {
    await makeTenant(tenant);
    await makeTenant(otherTenant);
    await makeFinding("f-a", "metasploit", tenant);
    await makeFinding("f-c", "metasploit", otherTenant);

    // Sign back in as the first tenant, so the request has its session.
    const first = await makeTenant(tenant);
    const res = await route.GET(
      new Request("http://localhost/api/integrations/findings?geospatial=0"),
    );
    const body = await res.json();
    expect(body.findings.every((f: { tenantId: string }) => f.tenantId === tenant)).toBe(true);
    expect(body.findings.some((f: { id: string }) => f.id === "f-c")).toBe(false);
    expect(first.token).toBeTruthy();
  });
});
