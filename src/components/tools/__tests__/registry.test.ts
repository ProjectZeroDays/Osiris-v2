import { describe, it, expect } from "vitest";
import { SECURITY_TOOL_CARDS } from "@/config/security-tools";
import { TOOL_WINDOWS, TOOLS_WITH_WINDOWS } from "@/components/tools/registry";
import { TOOL_WINDOW_META } from "@/components/tools/window-meta";

describe("tool window registry", () => {
  it("gives every tool a window", () => {
    for (const card of SECURITY_TOOL_CARDS) {
      expect(TOOL_WINDOWS[card.id], card.id).toBeDefined();
    }
  });

  it("has metadata for every tool", () => {
    for (const card of SECURITY_TOOL_CARDS) {
      const meta = TOOL_WINDOW_META[card.id];
      expect(meta, card.id).toBeDefined();
      expect(meta!.title, card.id).toBeTruthy();
      expect(meta!.riskClass, card.id).toBe(card.riskClass);
      expect(meta!.tabs.length, card.id).toBeGreaterThan(0);
    }
  });

  it("lists exactly the tools that have windows", () => {
    expect(TOOLS_WITH_WINDOWS.length).toBe(SECURITY_TOOL_CARDS.length);
    for (const id of TOOLS_WITH_WINDOWS) {
      expect(TOOL_WINDOWS[id]).toBeDefined();
    }
  });

  it("gives the orchestration tool a report-import window", () => {
    // Quantum-CLI moved from quarantined to report-import in v10: it stays
    // outside the platform, and only its run reports come in.
    expect(TOOL_WINDOWS["quantum-cli"]).toBeDefined();
    expect(TOOL_WINDOW_META["quantum-cli"]?.riskClass).toBe("report-import");
  });

  it("matches the plan's window inventory", () => {
    expect(TOOL_WINDOW_META.shodan?.tabs).toEqual(["host lookup", "history", "credits"]);
    expect(TOOL_WINDOW_META.zenmap?.tabs).toEqual(["request job", "import report", "results"]);
    expect(TOOL_WINDOW_META.metasploit?.tabs).toEqual(["import report", "findings"]);
    expect(TOOL_WINDOW_META.maltego?.tabs).toEqual(["import graph", "export graph"]);
    expect(TOOL_WINDOW_META.sherlock?.tabs).toEqual(["check handle", "results"]);
    expect(TOOL_WINDOW_META["dedsec-cctv"]?.tabs).toEqual(["cameras", "import config"]);
    expect(TOOL_WINDOW_META["exploit-index"]?.tabs).toEqual(["CVE lookup", "source cross-check"]);
    expect(TOOL_WINDOW_META.spytv?.tabs).toEqual(["import report", "advisories"]);
    expect(TOOL_WINDOW_META["pagasus-pro"]?.tabs).toEqual(["import audit", "minimized view"]);
    expect(TOOL_WINDOW_META.ruflo?.tabs).toEqual(["read-only summary", "draft report"]);
    expect(TOOL_WINDOW_META.nrsuite?.tabs).toEqual(["import summary", "flows", "decode metadata", "export"]);
    expect(TOOL_WINDOW_META.strykerapp?.tabs).toEqual(["import mutation", "import coverage", "runs"]);
    expect(TOOL_WINDOW_META["esp32-drone-rid"]?.tabs).toEqual(["live drones", "operators", "track"]);
    expect(TOOL_WINDOW_META["esp32-surveillance-cams"]?.tabs).toEqual(["devices", "enrich"]);
    expect(TOOL_WINDOW_META["flock-detector"]?.tabs).toEqual(["cameras", "deflock export", "geojson export"]);
    expect(TOOL_WINDOW_META["haveibeenflocked"]?.tabs).toEqual(["lookup", "report", "list"]);
    expect(TOOL_WINDOW_META["plate-ocr"]?.tabs).toEqual(["recognize", "edge events"]);
    expect(TOOL_WINDOW_META["camera-feed"]?.tabs).toEqual(["feed list", "embed player"]);
    expect(TOOL_WINDOW_META.wifite3?.tabs).toEqual(["interfaces", "scan", "captures", "cracked"]);
    expect(TOOL_WINDOW_META["quantum-cli"]?.tabs).toEqual(["import report", "phase timeline", "runs"]);
  });
});
