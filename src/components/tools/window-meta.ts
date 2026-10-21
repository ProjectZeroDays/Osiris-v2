import type { SecurityToolId, RiskClass } from "@/config/security-tools";

/**
 * What a window says about its tool before it says anything else.
 *
 * The risk class is shown in the title bar rather than buried in the body:
 * a window that can act on the world should say what kind of act it is
 * from the moment it appears.
 */
export interface ToolWindowMeta {
  title: string;
  subtitle: string;
  riskClass: RiskClass;
  /** The tabs the window offers, in order. */
  tabs: string[];
}

export const TOOL_WINDOW_META: Partial<Record<SecurityToolId, ToolWindowMeta>> = {
  shodan: {
    title: "Shodan",
    subtitle: "Passive exposure context for verified assets",
    riskClass: "passive-metadata",
    tabs: ["host lookup", "history", "credits"],
  },
  zenmap: {
    title: "Zenmap",
    subtitle: "Approved internal discovery workflow",
    riskClass: "report-import",
    tabs: ["request job", "import report", "results"],
  },
  metasploit: {
    title: "Metasploit",
    subtitle: "Import approved lab assessment reports",
    riskClass: "report-import",
    tabs: ["import report", "findings"],
  },
  maltego: {
    title: "Maltego",
    subtitle: "Reviewed infrastructure graph exchange",
    riskClass: "report-import",
    tabs: ["import graph", "export graph"],
  },
  sherlock: {
    title: "Sherlock",
    subtitle: "Opt-in controlled-account check",
    riskClass: "passive-metadata",
    tabs: ["check handle", "results"],
  },
  "dedsec-cctv": {
    title: "DedSec CCTV",
    subtitle: "User-owned camera configuration only",
    riskClass: "user-owned-media",
    tabs: ["cameras", "import config"],
  },
  "exploit-index": {
    title: "Exploit-Index",
    subtitle: "Untrusted CVE metadata leads only",
    riskClass: "passive-metadata",
    tabs: ["CVE lookup", "source cross-check"],
  },
  spytv: {
    title: "SpyTV Defense",
    subtitle: "Import defensive findings and advisories",
    riskClass: "report-import",
    tabs: ["import report", "advisories"],
  },
  "pagasus-pro": {
    title: "Pegasus Pro",
    subtitle: "Minimized device-audit report import only",
    riskClass: "report-import",
    tabs: ["import audit", "minimized view"],
  },
  ruflo: {
    title: "Ruflo",
    subtitle: "Approval-gated read-only analysis",
    riskClass: "read-only-mcp",
    tabs: ["read-only summary", "draft report"],
  },
  "quantum-cli": {
    title: "Quantum-CLI",
    subtitle: "Import orchestration reports from an external run",
    riskClass: "report-import",
    tabs: ["import report", "phase timeline", "runs"],
  },

  // v5 -- network and sensor extensions
  nrsuite: {
    title: "nrSuite",
    subtitle: "Import sanitized pcap flow summaries",
    riskClass: "report-import",
    tabs: ["import summary", "flows", "decode metadata", "export"],
  },
  strykerapp: {
    title: "StrykerApp",
    subtitle: "Import mutation and coverage reports",
    riskClass: "report-import",
    tabs: ["import mutation", "import coverage", "runs"],
  },

  // v6 -- drone Remote ID and surveillance mapping
  "esp32-drone-rid": {
    title: "Drone RID",
    subtitle: "Passive Remote ID drone and operator tracking",
    riskClass: "passive-metadata",
    tabs: ["live drones", "operators", "track"],
  },
  "esp32-surveillance-cams": {
    title: "Cop Cams",
    subtitle: "Map ALPR, body cams and surveillance devices",
    riskClass: "passive-metadata",
    tabs: ["devices", "enrich"],
  },

  // v7 -- Flock and ALPR mapping
  "flock-detector": {
    title: "Flock Detector",
    subtitle: "Passive ALPR camera detection and mapping",
    riskClass: "passive-metadata",
    tabs: ["cameras", "deflock export", "geojson export"],
  },
  "haveibeenflocked": {
    title: "HaveIBeenFlocked",
    subtitle: "Report and cross-reference ALPR sightings",
    riskClass: "passive-metadata",
    tabs: ["lookup", "report", "list"],
  },
  "plate-ocr": {
    title: "Plate OCR",
    subtitle: "Import recognised plates and edge events",
    riskClass: "passive-metadata",
    tabs: ["recognize", "edge events"],
  },
  "camera-feed": {
    title: "Camera Feed",
    subtitle: "User-owned camera feeds and embed players",
    riskClass: "user-owned-media",
    tabs: ["feed list", "embed player"],
  },

  // v10 -- wireless
  wifite3: {
    title: "Wifite3",
    subtitle: "Automated WiFi audit and handshake capture",
    riskClass: "active-transmit",
    tabs: ["interfaces", "scan", "captures", "cracked"],
  },

  // v13/v15 -- public and civic data.
  "scanner-feeds": {
    title: "Scanner Feeds",
    subtitle: "Public-safety radio feeds and CAP emergency alerts",
    riskClass: "passive-metadata",
    tabs: ["radio feeds", "emergency alerts"],
  },
  "imsi-catcher": {
    title: "Cell Anomalies",
    subtitle: "Cell tower database and IMSI-catcher heuristics",
    riskClass: "passive-metadata",
    tabs: ["observations", "towers"],
  },
  "police-reports": {
    title: "Police Reports",
    subtitle: "Public incident and dispatch records by jurisdiction",
    riskClass: "passive-metadata",
    tabs: ["socrata", "arcgis", "import"],
  },

  // v13 -- the platform's own model providers.
  "ai-settings": {
    title: "AI Providers",
    subtitle: "Local GGUF, MLX and Ollama, plus a server-held OpenRouter key",
    riskClass: "read-only-mcp",
    tabs: ["providers", "downloads", "installed"],
  },

  // The wide tool collection, behind a worker.
  "tool-collection": {
    title: "Tool Collection",
    subtitle: "The wide Cyber-Security tool collection, run by a worker behind the platform",
    riskClass: "report-import",
    tabs: ["catalogue", "run", "output"],
  },
};
