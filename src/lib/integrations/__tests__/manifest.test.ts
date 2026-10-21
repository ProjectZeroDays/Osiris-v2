import { describe, it, expect } from "vitest";
import { SECURITY_TOOL_CARDS } from "@/config/security-tools";
import { SAFE_CAPABILITIES } from "@/lib/integrations/capabilities.server";

describe("manifest", () => {
  it("has 25 unique tool IDs", () => {
    const ids = SECURITY_TOOL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(25);
    expect(ids.length).toBe(25);
  });

  it("all hrefs are internal", () => {
    for (const c of SECURITY_TOOL_CARDS) {
      expect(c.href.startsWith("/tools/security/")).toBe(true);
    }
  });

  it("every tool has an entry in the capability allowlist", () => {
    for (const c of SECURITY_TOOL_CARDS) {
      expect(SAFE_CAPABILITIES[c.id]).toBeDefined();
    }
  });

  it("every tool has a retention policy", () => {
    for (const c of SECURITY_TOOL_CARDS) {
      expect(c.retentionDays).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives every tool at least one capability", () => {
    for (const c of SECURITY_TOOL_CARDS) {
      expect(SAFE_CAPABILITIES[c.id].length, c.id).toBeGreaterThan(0);
    }
  });

  it("separates the active-transmit tool from the passive ones", () => {
    const active = SECURITY_TOOL_CARDS.filter((c) => c.riskClass === "active-transmit");
    expect(active.map((c) => c.id)).toEqual(["wifite3"]);
    // The one tool that transmits must ask for consent.
    for (const c of active) expect(c.requiresConsent).toBe(true);
  });

  it("keeps the longest retention on the tools whose findings are static", () => {
    const flock = SECURITY_TOOL_CARDS.find((c) => c.id === "flock-detector");
    expect(flock?.retentionDays).toBe(365);
  });
});
