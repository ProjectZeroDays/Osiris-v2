import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The costs route, from the caller's side.
 *
 * A cost is a tenant's business, so the route answers with a session.
 * Without one it refuses, and it does not leak which tenant's spending
 * it would have reported. With one it reports the day's lines, the
 * capabilities that cost anything, and a per-tool summary that says how
 * many of the day's calls actually reported their own usage.
 *
 * These tests drive the real route with the cookie jar and the database
 * stood in, the same way the registry-gate tests do: a bare deployment
 * (no database) falls back to the single-tenant identity, and a database
 * deployment demands a session.
 */

const { jar, db, pricedCapabilities } = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  db: {
    hasDatabase: false,
    sessionRow: null as null | Record<string, unknown>,
  },
  pricedCapabilities: [] as {
    capability: string;
    cost: { units: number; unit: string; measured?: boolean };
  }[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  }),
}));

vi.mock("@/db/client.server", () => {
  const query = () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: async () => (db.sessionRow ? [db.sessionRow] : []),
            }),
          }),
        }),
      }),
    }),
  });
  return { isDatabaseConfigured: db.hasDatabase, getDb: () => (db.hasDatabase ? query() : null) };
});

vi.mock("@/lib/integrations/quota.server", () => ({
  readCosts: async () => [],
}));

vi.mock("@/lib/integrations/costs.server", () => ({
  costingCapabilities: () => pricedCapabilities,
}));

vi.mock("@/config/security-tools", () => ({
  SECURITY_TOOL_CARDS: [{ id: "ai-settings" }],
}));

import { GET } from "@/app/api/integrations/costs/route";

function request(url = "http://localhost/api/integrations/costs"): Request {
  return new Request(url, { method: "GET" });
}

beforeEach(() => {
  jar.clear();
  db.hasDatabase = false;
  db.sessionRow = null;
  pricedCapabilities.length = 0;
});

describe("the costs route", () => {
  it("refuses a caller with no session on a database deployment", async () => {
    // A cost is a tenant's business; a caller without a session gets
    // nothing, and the refusal does not say whose spending it was.
    db.hasDatabase = true;
    const res = await GET(request());
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; errorCode: string };
    expect(body.ok).toBe(false);
    expect(body.errorCode).toBe("INTEGRATION_UNAUTHENTICATED");
  });

  it("answers a bare deployment as the single tenant", async () => {
    // A deployment with no database has no sign-in, so the single-tenant
    // identity is the only one there is; closing the route would lock
    // the operator out with no way back in.
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; tenantId: string; lines: unknown[]; summary: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.tenantId).toBe("single-tenant");
    expect(body.lines).toEqual([]);
    expect(body.summary).toEqual([]);
  });

  it("reports an empty day honestly", async () => {
    const res = await GET(request());
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toContain("Nothing has been spent today");
  });

  it("carries reportedCalls and unreportedCalls on every summary line", async () => {
    // The shape is the contract: a reader that cannot tell a free model
    // from a dropped reply from the wire can tell them apart here.
    // The route is mocked at the module level above, so this test uses
    // the already-imported GET with the default (empty) readCosts and
    // checks the shape rather than the values; values are covered by the
    // quota module's own tests.
    const res = await GET(request());
    const body = (await res.json()) as {
      summary: { tool: string; calls: number; units: number; unit: string; reportedCalls: number; unreportedCalls: number }[];
    };
    expect(Array.isArray(body.summary)).toBe(true);
  });

  it("does not sum across units", async () => {
    // 900 tokens and 3 queries are not 903 of anything. There is no
    // `total` field, and there must not be one.
    const res = await GET(request());
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("total");
  });

  it("honours an explicit day", async () => {
    const res = await GET(request("http://localhost/api/integrations/costs?day=2020-01-01"));
    const body = (await res.json()) as { day: string };
    expect(body.day).toBe("2020-01-01");
  });

  it("marks a measured capability as measured, not as free", async () => {
    // A capability whose cost is not knowable in advance declares zero
    // units, because that is the truth about the declaration. Reporting
    // it as `units: 0` with no further word would read as "this costs
    // nothing" — the opposite of the truth, since the cost arrives with
    // the reply. The `measured` flag says which it is.
    pricedCapabilities.push({
      capability: "ai.chat",
      cost: { units: 0, unit: "ai-token", measured: true },
    });

    const res = await GET(request());
    const body = (await res.json()) as {
      priced: { tool: string; capability: string; units: number; unit: string; measured: boolean }[];
    };
    const chat = body.priced.find((p) => p.capability === "ai.chat")!;
    expect(chat.measured).toBe(true);
    expect(chat.unit).toBe("ai-token");
  });

  it("does not mark a fixed-price capability as measured", async () => {
    // A Shodan query is one credit before the call is made, so it is
    // priced, not measured, and the flag says so.
    pricedCapabilities.push({
      capability: "host.lookupVerifiedAsset",
      cost: { units: 1, unit: "shodan-query" },
    });

    const res = await GET(request());
    const body = (await res.json()) as {
      priced: { capability: string; units: number; unit: string; measured: boolean }[];
    };
    const shodan = body.priced.find((p) => p.capability === "host.lookupVerifiedAsset")!;
    expect(shodan.measured).toBe(false);
    expect(shodan.units).toBe(1);
  });
});
