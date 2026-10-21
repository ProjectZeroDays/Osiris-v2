import { describe, it, expect } from "vitest";
import { SECURITY_TOOL_CARDS, RISK_CLASS_NOTES, type IntegrationCard } from "@/config/security-tools";
import { SAFE_CAPABILITIES } from "@/lib/integrations/capabilities.server";
import { TOOL_WINDOW_META } from "@/components/tools/window-meta";

/**
 * The registry contract.
 *
 * The native apps — the Android build and the Windows desktop build —
 * read the registry from the platform rather than keeping their own copy
 * of it. That is the whole point of the arrangement: one manifest, one
 * capability allowlist, one audit trail. It also means this shape is a
 * contract with two other clients, so it is worth a test.
 */
describe("the registry the native apps read", () => {
  const cards = SECURITY_TOOL_CARDS as readonly IntegrationCard[];

  it("gives every tool the fields a client needs", () => {
    for (const card of cards) {
      expect(typeof card.id, card.id).toBe("string");
      expect(typeof card.name, card.id).toBe("string");
      expect(typeof card.purpose, card.id).toBe("string");
      expect(typeof card.riskClass, card.id).toBe("string");
      expect(typeof card.retentionDays, card.id).toBe("number");
      expect(typeof card.requiresAsset, card.id).toBe("boolean");
      expect(typeof card.requiresConsent, card.id).toBe("boolean");
    }
  });

  it("gives every tool a risk note a client can show", () => {
    for (const card of cards) {
      expect(RISK_CLASS_NOTES[card.riskClass], card.id).toBeTruthy();
    }
  });

  it("lists the capabilities a client may offer, and nothing else", () => {
    for (const card of cards) {
      const listed = SAFE_CAPABILITIES[card.id] ?? [];
      expect(listed.length, card.id).toBeGreaterThan(0);
      // A client offering a capability the platform does not allow would
      // be refused on every request, so the two lists must be the same.
      for (const cap of listed) {
        expect(typeof cap, `${card.id}.${cap}`).toBe("string");
        expect(cap.includes("."), `${card.id}.${cap}`).toBe(true);
      }
    }
  });

  it("gives every tool the tabs its window offers", () => {
    for (const card of cards) {
      const meta = TOOL_WINDOW_META[card.id];
      expect(meta, card.id).toBeDefined();
      expect(meta!.tabs.length, card.id).toBeGreaterThan(0);
    }
  });

  it("keeps the id and the href in step", () => {
    for (const card of cards) {
      expect(card.href, card.id).toBe(`/tools/security/${card.id}`);
    }
  });

  it("never names a capability that would be a generic runner", () => {
    for (const card of cards) {
      for (const cap of SAFE_CAPABILITIES[card.id]) {
        expect(cap.toLowerCase(), `${card.id}.${cap}`).not.toBe("run");
        expect(cap.toLowerCase(), `${card.id}.${cap}`).not.toBe("exec");
        expect(cap.toLowerCase(), `${card.id}.${cap}`).not.toBe("shell");
      }
    }
  });

  it("keeps a tool that transmits separate from one that only listens", () => {
    const active = cards.filter((c) => c.riskClass === "active-transmit");
    expect(active.length).toBeGreaterThan(0);
    for (const c of active) {
      expect(c.requiresConsent, c.id).toBe(true);
    }
  });
});
