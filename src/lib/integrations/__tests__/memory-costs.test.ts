import { describe, it, expect } from "vitest";
import {
  consumeQuota,
  PLATFORM_TENANT,
  readCosts,
  recordCost,
} from "@/lib/integrations/quota.server";

/**
 * The in-memory cost ledger, on a deployment without a database.
 *
 * The database path keeps both halves — calls and cost — in one row, and
 * `readCosts` reads it back. The memory path used to keep only the call
 * count, so a bare deployment's chat tokens were counted on the wire and
 * then dropped: the costs route answered with an empty list that read as
 * "nothing was spent". Both halves are kept now, and `readCosts` returns
 * them, so a bare deployment's spending is readable too.
 *
 * The memory path is only reached without a database, so these cases are
 * skipped when one is configured — otherwise they would be measuring the
 * database path under a name that says otherwise. The database path has
 * its own tests, in `cost-tracking.test.ts`.
 *
 * The suite is run both ways in CI for exactly this reason: the run with
 * a database covers the database path, and the run without one covers
 * this.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(hasDatabase)("the in-memory cost ledger", () => {
  it("records a metered call's cost and reads it back", async () => {
    await consumeQuota("t-mem", "shodan", 100, { units: 3, unit: "shodan-query" });

    const lines = await readCosts("t-mem");
    const shodan = lines.find((l) => l.tool === "shodan");
    expect(shodan).toBeDefined();
    expect(shodan!.calls).toBe(1);
    expect(shodan!.units).toBe(3);
    expect(shodan!.unit).toBe("shodan-query");
  });

  it("adds up across calls of the same tool", async () => {
    for (let i = 0; i < 4; i++) {
      await consumeQuota("t-mem2", "shodan", 100, { units: 2, unit: "shodan-query" });
    }
    const lines = await readCosts("t-mem2");
    const shodan = lines.find((l) => l.tool === "shodan")!;
    expect(shodan.calls).toBe(4);
    expect(shodan.units).toBe(8);
  });

  it("keeps one tenant's spending out of another's", async () => {
    await consumeQuota("t-a", "shodan", 100, { units: 5, unit: "shodan-query" });
    await consumeQuota("t-b", "shodan", 100, { units: 1, unit: "shodan-query" });

    const mine = (await readCosts("t-a")).find((l) => l.tool === "shodan")!;
    const theirs = (await readCosts("t-b")).find((l) => l.tool === "shodan")!;
    expect(mine.units).toBe(5);
    expect(theirs.units).toBe(1);
  });

  it("records a free call as free, with its call count", async () => {
    await consumeQuota("t-free", "metasploit", 100, { units: 0, unit: "free" });

    const lines = await readCosts("t-free");
    const ms = lines.find((l) => l.tool === "metasploit")!;
    expect(ms.calls).toBe(1);
    expect(ms.units).toBe(0);
    expect(ms.unit).toBe("free");
  });

  it("reads nothing for a tenant that made no calls", async () => {
    expect(await readCosts("t-none")).toEqual([]);
  });

  it("reads the right day and not another", async () => {
    // The memory path keys by day, so a stale read must not bleed in.
    // There is no way to inject a day here, so this is a shape check
    // rather than a time-travel test: the call lands on today's key.
    await consumeQuota("t-day", "shodan", 100, { units: 1, unit: "shodan-query" });
    const today = new Date().toISOString().slice(0, 10);
    // readCosts defaults to today; passing an explicit other day is empty.
    const other = await readCosts("t-day", "2020-01-01");
    expect(other).toEqual([]);
    const same = await readCosts("t-day", today);
    expect(same.find((l) => l.tool === "shodan")!.units).toBe(1);
  });

  it("shows a tenant the platform's own spending", async () => {
    // The aircraft feed is refreshed whether or not anyone is watching,
    // and the operator pays for it once for the whole deployment. It is
    // not one tenant's spending, so it is recorded against the platform
    // — and it is part of what the deployment costs to run, so every
    // tenant's cost view includes it.
    await recordCost(PLATFORM_TENANT, "flights", {
      units: 4,
      unit: "opensky-credit",
      reported: true,
    });

    const lines = await readCosts("t-any-tenant");
    const flights = lines.find((l) => l.tool === "flights");
    expect(flights).toBeDefined();
    expect(flights!.units).toBe(4);
    expect(flights!.unit).toBe("opensky-credit");
  });

  it("keeps a tenant's own spending out of another tenant's view", async () => {
    await recordCost("t-mine", "shodan", { units: 7, unit: "shodan-query" });

    const mine = await readCosts("t-mine");
    expect(mine.find((l) => l.tool === "shodan")!.units).toBe(7);

    const theirs = await readCosts("t-not-mine");
    expect(theirs.find((l) => l.tool === "shodan")).toBeUndefined();
  });

  it("records a measured cost without counting another call", async () => {
    // A chat made through the dispatcher is counted there, when it is
    // dispatched; its cost is measured afterwards, when the reply
    // arrives. Charging both would count the same chat twice and spend
    // the day's allowance twice over.
    await consumeQuota("t-measured", "ai-settings", 100);
    await recordCost("t-measured", "ai-settings", {
      units: 17,
      unit: "ai-token",
      reported: true,
    });

    const lines = await readCosts("t-measured");
    const chat = lines.find((l) => l.tool === "ai-settings")!;
    expect(chat.calls).toBe(1);
    expect(chat.units).toBe(17);
    expect(chat.unit).toBe("ai-token");
    expect(chat.reportedCalls).toBe(1);
  });

  it("charges a chat through the dispatcher exactly once", async () => {
    // The whole sequence a chat makes through the dispatcher: the call
    // is counted when it is dispatched, and its cost is measured when the
    // reply arrives. One chat, one call, one cost.
    //
    // The bug this pins down was a double charge: the dispatcher charged
    // the declared cost of the capability and the adapter charged the
    // measured usage, so one chat was billed twice, in two units, and
    // spent the day's allowance twice.
    await consumeQuota("t-dispatch", "ai-settings", 100);
    await recordCost("t-dispatch", "ai-settings", {
      units: 17,
      unit: "ai-token",
      reported: true,
    });

    const chat = (await readCosts("t-dispatch")).find((l) => l.tool === "ai-settings")!;
    expect(chat.calls).toBe(1);
    expect(chat.units).toBe(17);
    expect(chat.reportedCalls).toBe(1);
  });

  it("keeps a measured cost's unit when a free call follows it", async () => {
    // The unit is rewritten only by a call that carries units, so a free
    // capability called afterwards cannot rename a row that holds a
    // measured cost — the row would then report a token total in a unit
    // that does not describe it.
    await recordCost("t-mixed", "ai-settings", {
      units: 17,
      unit: "ai-token",
      reported: true,
    });
    await consumeQuota("t-mixed", "ai-settings", 100);

    const lines = await readCosts("t-mixed");
    const chat = lines.find((l) => l.tool === "ai-settings")!;
    expect(chat.units).toBe(17);
    expect(chat.unit).toBe("ai-token");
  });
});
