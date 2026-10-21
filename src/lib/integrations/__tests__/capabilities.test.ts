import { describe, it, expect } from "vitest";
import {
  assertCapabilityAllowed,
  isCapabilityAllowed,
  SAFE_CAPABILITIES,
} from "@/lib/integrations/capabilities.server";
import { SECURITY_TOOL_CARDS } from "@/config/security-tools";

describe("capabilities", () => {
  it("denies unknown capability", () => {
    expect(() => assertCapabilityAllowed("shodan", "run")).toThrow("DENIED");
  });

  it("denies a capability belonging to a different tool", () => {
    expect(isCapabilityAllowed("sherlock", "host.lookupVerifiedAsset")).toBe(false);
    expect(isCapabilityAllowed("shodan", "controlledHandle.checkSingle")).toBe(false);
  });

  it("allows a capability that is on the list", () => {
    expect(() =>
      assertCapabilityAllowed("shodan", "host.lookupVerifiedAsset"),
    ).not.toThrow();
  });

  it("no tool lists a generic runner capability", () => {
    for (const card of SECURITY_TOOL_CARDS) {
      for (const cap of SAFE_CAPABILITIES[card.id]) {
        expect(cap).not.toBe("run");
        expect(cap).not.toBe("exec");
        expect(cap).not.toBe("shell");
        expect(cap).not.toBe("command");
      }
    }
  });

  it("does not offer live capture for the pcap tool", () => {
    // The raw pcap is never imported and the platform never selects an
    // interface; the operator summarises it themselves.
    for (const cap of SAFE_CAPABILITIES.nrsuite) {
      expect(cap).not.toContain("capture.start");
      expect(cap).not.toContain("interface");
      expect(cap).not.toContain("replay");
    }
  });

  it("separates the active scan from the passive imports for wireless", () => {
    const caps = SAFE_CAPABILITIES.wifite3;
    expect(caps).toContain("wifi.requestScan");
    expect(caps).toContain("wifi.importCapture");
    expect(caps).toContain("wifi.importCracked");
  });

  it("does not offer credential extraction anywhere", () => {
    for (const card of SECURITY_TOOL_CARDS) {
      for (const cap of SAFE_CAPABILITIES[card.id]) {
        expect(cap.toLowerCase()).not.toContain("credential");
        expect(cap.toLowerCase()).not.toContain("password");
        expect(cap.toLowerCase()).not.toContain("hash");
      }
    }
  });
});
