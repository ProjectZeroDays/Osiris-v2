import { describe, it, expect } from "vitest";
import {
  CAPABILITY_COSTS,
  FREE,
  costFor,
  costingCapabilities,
  everyCapability,
} from "@/lib/integrations/costs.server";
import { SAFE_CAPABILITIES } from "@/lib/integrations/capabilities.server";

/**
 * What a call costs.
 *
 * The cost table and the capability allowlist have to agree, and they
 * have to be checked in both directions: a capability in the allowlist
 * with no declared cost would be a metered call that nobody is charged
 * for, and a cost for a capability that is not allowed is a price for
 * something that cannot happen.
 *
 * The table is deliberately exhaustive. A missing entry is a build
 * failure rather than a silent zero, because a zero is a statement —
 * "this costs the operator nothing" — and it should be made on purpose.
 */

describe("the cost table", () => {
  it("gives every allowed capability a cost", () => {
    const missing = everyCapability()
      .filter((c) => c.cost === null)
      .map((c) => `${c.tool}:${c.capability}`);
    expect(
      missing,
      `These capabilities have no declared cost: ${missing.join(", ")}. ` +
        "A capability that reaches a metered service has to be given one; " +
        "one that does not has to be given zero on purpose.",
    ).toEqual([]);
  });

  it("prices nothing that is not allowed", () => {
    // A cost for a capability that cannot run is a price for something
    // that cannot happen, and it hides a real gap: the allowlist and the
    // cost table have drifted apart.
    for (const [tool, capabilities] of Object.entries(SAFE_CAPABILITIES)) {
      const table = (CAPABILITY_COSTS as Record<string, Record<string, unknown>>)[tool];
      expect(table, `the cost table has no entry for the tool "${tool}"`).toBeDefined();
      expect(Object.keys(table!).sort(), `the tool "${tool}"`).toEqual(
        [...capabilities].sort(),
      );
    }
  });

  it("prices nothing that is not a tool", () => {
    for (const tool of Object.keys(CAPABILITY_COSTS)) {
      expect(SAFE_TOOL_IDS, `the cost table names "${tool}", which is not a tool`).toContain(tool);
    }
  });

  it("counts no more units than it should", () => {
    for (const { tool, capability, cost } of everyCapability()) {
      expect(cost!.units, `${tool}:${capability}`).toBeGreaterThanOrEqual(0);
      expect(cost!.units, `${tool}:${capability}`).toBeLessThanOrEqual(1000);
      expect(cost!.unit, `${tool}:${capability}`).toBeTruthy();
    }
  });

  it("calls a free capability free", () => {
    // A capability with no units must say so in its unit, rather than
    // leaving the unit to be guessed.
    for (const { tool, capability, cost } of everyCapability()) {
      if (cost!.units === 0) {
        expect(cost!.unit, `${tool}:${capability}`).toBe(FREE);
      } else {
        expect(cost!.unit, `${tool}:${capability}`).not.toBe(FREE);
      }
    }
  });

  it("names a unit that says whose it is", () => {
    // "credit" on its own would not say whose credit. A unit that names
    // the service says which account is being spent.
    for (const { tool, capability, cost } of everyCapability()) {
      if (cost!.units > 0) {
        expect(cost!.unit, `${tool}:${capability}`).toMatch(/[a-z]+-[a-z]+/);
      }
    }
  });

  it("finds a capability's cost", () => {
    expect(costFor("shodan", "host.lookupVerifiedAsset")).toEqual({
      units: 1,
      unit: "shodan-query",
    });
    expect(costFor("metasploit", "labReport.import")).toEqual({
      units: 0,
      unit: "free",
    });
    expect(costFor("shodan", "not.a.capability")).toBeNull();
  });

  it("lists the capabilities that cost something", () => {
    const priced = costingCapabilities("shodan");
    expect(priced.length).toBe(1);
    expect(priced[0].capability).toBe("host.lookupVerifiedAsset");
    expect(costingCapabilities("metasploit")).toEqual([]);
  });

  it("is honest about which tools cost anything", () => {
    // The point of the table: a reader can see that most of the platform
    // is free, and which parts are not.
    const priced = everyCapability().filter((c) => c.cost!.units > 0);
    expect(priced.length).toBeGreaterThan(0);
    expect(priced.length).toBeLessThan(everyCapability().length);
  });
});

/** The tool ids the manifest declares. */
const SAFE_TOOL_IDS = Object.keys(SAFE_CAPABILITIES);
