import { describe, it, expect, beforeEach } from "vitest";
import {
  consumeQuota,
  readCosts,
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
 */

beforeEach(() => {
  // There is no reset export; consume into a fresh tenant per test.
});

describe("the in-memory cost ledger", () => {
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
});
