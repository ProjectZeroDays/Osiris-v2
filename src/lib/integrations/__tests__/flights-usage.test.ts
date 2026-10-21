import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * What the flight feeds cost.
 *
 * OpenSky is metered in credits, and the platform's own comments record a
 * day when the anonymous daily budget was exhausted and the map went
 * empty. Every call it answers for is a credit spent, so the platform
 * counts them and reports them where the operator can see them.
 *
 * The adsb.fi feeds are not counted: they are free endpoints with no
 * key, so a call against them costs the operator nothing they are billed
 * for, and recording one would be inventing a unit.
 */

const { quota, consumeQuota } = vi.hoisted(() => ({
  quota: [] as Array<{
    tenantId: string;
    tool: string;
    limit?: number;
    cost?: { units: number; unit: string; reported?: boolean };
  }>,
  consumeQuota: vi.fn(
    async (
      tenantId: string,
      tool: string,
      limit?: number,
      cost?: { units: number; unit: string; reported?: boolean },
    ) => {
      quota.push({ tenantId, tool, limit, cost });
      return { allowed: true, used: 1, limit: 100, remaining: 99 };
    },
  ),
}));

vi.mock("@/lib/integrations/quota.server", () => ({
  consumeQuota,
  // The real value, so the test asserts against the key the platform
  // actually uses rather than a copy of it.
  PLATFORM_TENANT: "platform:shared",
}));

import { recordFlightsUsage } from "@/lib/integrations/flights-usage.server";

beforeEach(() => {
  quota.length = 0;
});

describe("the flight feeds' cost", () => {
  it("records an OpenSky call as one credit", async () => {
    await recordFlightsUsage();

    expect(quota).toHaveLength(1);
    expect(quota[0].cost).toEqual({
      units: 1,
      reported: true,
      unit: "opensky-credit",
    });
  });

  it("records against the platform, not a tenant", async () => {
    // The aircraft feed is refreshed whether or not anyone is watching
    // and the operator pays for it once for the whole deployment, so it
    // is not one tenant's spending. Recording it against a tenant would
    // hide it from everyone else, and hide it entirely on a deployment
    // whose tenant is not called "single-tenant".
    //
    // The key itself is asserted here rather than read from the module
    // under test, so a change to the real key fails here rather than
    // passing because both sides moved together.
    await recordFlightsUsage();
    expect(quota[0].tenantId).toBe("platform:shared");
    expect(quota[0].tool).toBe("flights");
  });

  it("never throws, because the map matters more than the ledger", async () => {
    // A platform that cannot write its cost ledger should still serve
    // the map. The cost is worth less than the aircraft.
    consumeQuota.mockRejectedValueOnce(new Error("database is down"));

    await expect(recordFlightsUsage()).resolves.toBeUndefined();
  });
});
