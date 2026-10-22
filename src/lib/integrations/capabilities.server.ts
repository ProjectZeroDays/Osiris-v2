import "server-only";
import type { SecurityToolId } from "@/config/security-tools";

/**
 * The capability allowlist.
 *
 * Deny by default: a capability that is not on this list does not run,
 * and a tool with an empty list offers nothing at all. The list is the
 * whole of what a tool may do — a new capability is a deliberate edit to
 * this file, not a consequence of adding an adapter.
 */
export const SAFE_CAPABILITIES = {
  shodan: ["host.lookupVerifiedAsset"],
  zenmap: ["discovery.requestApprovedJob", "report.import"],
  metasploit: ["labReport.import"],
  maltego: ["infrastructureGraph.importReviewed", "infrastructureGraph.exportVerified"],
  sherlock: ["controlledHandle.checkSingle"],
  "dedsec-cctv": ["ownedCamera.configImport", "ownedCamera.view"],
  "exploit-index": ["cveMetadata.readUntrusted"],
  spytv: ["defenseReport.import", "defensiveCve.read"],
  "pagasus-pro": ["deviceAudit.importMinimized"],
  ruflo: ["intelSummary.readOnly", "reportDraft.createWithApproval"],

  // v5 -- a raw pcap is never imported; only a summary the operator
  // produced locally. No live capture, no interface selection, no BPF.
  nrsuite: [
    "pcap.importSummary",
    "pcap.listFlows",
    "pcap.decodeMetadata",
    "pcap.exportSanitized",
  ],
  // A mutation report is for one codebase, and the report's own
  // JavaScript is never executed.
  strykerapp: [
    "report.importMutationSummary",
    "report.importCoverageSummary",
    "report.listRuns",
  ],

  // v6 -- passive ingestion from a device the operator flashed.
  "esp32-drone-rid": [
    "rid.ingestFrame",
    "rid.listDrones",
    "rid.listOperators",
    "rid.exportTrack",
  ],
  "esp32-surveillance-cams": [
    "surveillance.ingestDetection",
    "surveillance.listDevices",
    "surveillance.enrichCatalog",
  ],

  // v7 -- Flock cameras are static, so the detections are long-lived.
  "flock-detector": [
    "flock.ingestDetection",
    "flock.listCameras",
    "flock.exportDeFlock",
    "flock.exportGeoJSON",
  ],
  // The only capabilities in the whole registry that reach an external
  // service, and they are opt-in.
  "haveibeenflocked": [
    "hibf.lookupMac",
    "hibf.reportSighting",
    "hibf.listReports",
  ],
  "plate-ocr": [
    "plate.recognize",
    "plate.listEvents",
  ],
  "camera-feed": [
    "feed.listFeeds",
    "feed.embedPlayer",
  ],

  // v10 -- the scan is active and deauths; the imports are passive files.
  wifite3: [
    "wifi.listInterfaces",
    "wifi.requestScan",
    "wifi.importCapture",
    "wifi.importCracked",
    "wifi.exportReport",
  ],
  // Depth A: Quantum-CLI stays outside, and its reports are imported.
  "quantum-cli": [
    "quantum.importRunReport",
    "quantum.listRuns",
    "quantum.exportFindings",
  ],

  // v13/v15 -- public and civic data. The radio and the incident feeds
  // are public records; the cell anomalies are heuristics.
  "scanner-feeds": [
    "scanner.listBroadcastifyFeeds",
    "scanner.listOpenMhzSystems",
    "scanner.fetchCapAlerts",
    "scanner.importFeedList",
    "scanner.fetchCapFeed",
  ],
  "imsi-catcher": [
    "cell.fetchTowers",
    "cell.ingestScan",
    "cell.listAnomalies",
    "cell.validateHeuristic",
  ],
  "police-reports": [
    "police.fetchSocrata",
    "police.fetchArcgis",
    "police.importCadReport",
    "police.listIncidents",
  ],

  // v13 -- the platform's own model providers.
  "ai-settings": [
    "ai.listProviders",
    "ai.listDownloads",
    "ai.startDownload",
    "ai.removeModel",
    "ai.chat",
    "ai.proxyOpenRouter",
  ],

  // The wide tool collection. The worker behind it runs the tools; the
  // platform decides which one may run and records that it did.
  "tool-collection": [
    "collection.listTools",
    "collection.listCategory",
    "collection.execute",
  ],
} as const satisfies Record<SecurityToolId, readonly string[]>;

export function isCapabilityAllowed(tool: SecurityToolId, capability: string): boolean {
  const allowed: readonly string[] = SAFE_CAPABILITIES[tool] ?? [];
  return allowed.includes(capability);
}

export function assertCapabilityAllowed(tool: SecurityToolId, capability: string): void {
  if (!isCapabilityAllowed(tool, capability)) throw new Error("INTEGRATION_CAPABILITY_DENIED");
}
