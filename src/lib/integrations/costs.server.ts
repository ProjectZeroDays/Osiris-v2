import "server-only";
import type { SecurityToolId } from "@/config/security-tools";
import { SAFE_CAPABILITIES } from "./capabilities.server";

/**
 * What a call costs.
 *
 * Most of the platform is the operator's own machine reading their own
 * files, and that costs nothing. A few capabilities reach a service that
 * meters: a Shodan query is a credit, a Flock lookup is a lookup, a
 * request to a paid model provider is a request. An operator who cannot
 * see those adds coming is an operator who finds out on a bill.
 *
 * So every capability declares a cost, in a unit the provider names
 * rather than in money. The platform does not know what a Shodan credit
 * is worth to anyone; it knows how many have been spent.
 *
 * The table is deliberately exhaustive. Every capability in the allowlist
 * has an entry, and a capability with no entry is a build failure rather
 * than a silent zero: a new capability that reaches a metered service
 * has to be given a cost, and one that does not has to be given one of
 * zero on purpose. That is the same discipline as the allowlist itself.
 *
 * `units: 0` with the unit `free` is the common case, and it is written
 * out rather than left implicit.
 */

/** What a call costs, in the unit the provider charges in. */
export interface CapabilityCost {
  /** How many units one call costs. */
  readonly units: number;
  /**
   * The unit the provider charges in.
   *
   * `free` for a capability that costs the operator nothing. A provider's
   * own name for its unit otherwise — a Shodan query is a `shodan-query`,
   * because "credit" on its own would not say whose credit.
   */
  readonly unit: string;
}

/** The unit a capability that costs the operator nothing is in. */
export const FREE = "free" as const;

const free = (): CapabilityCost => ({ units: 0, unit: FREE });

export const CAPABILITY_COSTS = {
  shodan: {
    // A Shodan query is one credit against the operator's account, and
    // the platform cannot see the account.
    "host.lookupVerifiedAsset": { units: 1, unit: "shodan-query" },
  },
  zenmap: {
    "discovery.requestApprovedJob": free(),
    "report.import": free(),
  },
  metasploit: {
    "labReport.import": free(),
  },
  maltego: {
    "infrastructureGraph.importReviewed": free(),
    "infrastructureGraph.exportVerified": free(),
  },
  sherlock: {
    "controlledHandle.checkSingle": free(),
  },
  "dedsec-cctv": {
    "ownedCamera.configImport": free(),
    "ownedCamera.view": free(),
  },
  "exploit-index": {
    "cveMetadata.readUntrusted": free(),
  },
  spytv: {
    "defenseReport.import": free(),
    "defensiveCve.read": free(),
  },
  "pagasus-pro": {
    "deviceAudit.importMinimized": free(),
  },
  ruflo: {
    "intelSummary.readOnly": free(),
    "reportDraft.createWithApproval": free(),
  },
  nrsuite: {
    "pcap.importSummary": free(),
    "pcap.listFlows": free(),
    "pcap.decodeMetadata": free(),
    "pcap.exportSanitized": free(),
  },
  strykerapp: {
    "report.importMutationSummary": free(),
    "report.importCoverageSummary": free(),
    "report.listRuns": free(),
  },
  "esp32-drone-rid": {
    "rid.ingestFrame": free(),
    "rid.listDrones": free(),
    "rid.listOperators": free(),
    "rid.exportTrack": free(),
  },
  "esp32-surveillance-cams": {
    "surveillance.ingestDetection": free(),
    "surveillance.listDevices": free(),
    "surveillance.enrichCatalog": free(),
  },
  "flock-detector": {
    "flock.ingestDetection": free(),
    "flock.listCameras": free(),
    "flock.exportDeFlock": free(),
    "flock.exportGeoJSON": free(),
  },
  "haveibeenflocked": {
    // A metered lookup. The platform counts the lookups; the operator
    // reconciles them against the service's own bill.
    "hibf.lookupMac": { units: 1, unit: "hibf-lookup" },
    "hibf.reportSighting": free(),
    "hibf.listReports": free(),
  },
  "plate-ocr": {
    // The recogniser runs on the operator's own machine.
    "plate.recognize": free(),
    "plate.listEvents": free(),
  },
  "camera-feed": {
    "feed.listFeeds": free(),
    "feed.embedPlayer": free(),
  },
  wifite3: {
    "wifi.listInterfaces": free(),
    // A scan is the operator's own radio and their own time.
    "wifi.requestScan": free(),
    "wifi.importCapture": free(),
    "wifi.importCracked": free(),
    "wifi.exportReport": free(),
  },
  "quantum-cli": {
    "quantum.importRunReport": free(),
    "quantum.listRuns": free(),
    "quantum.exportFindings": free(),
  },
  "scanner-feeds": {
    "scanner.listBroadcastifyFeeds": free(),
    "scanner.listOpenMhzSystems": free(),
    "scanner.fetchCapAlerts": free(),
    "scanner.importFeedList": free(),
  },
  "imsi-catcher": {
    // A tower lookup against a published database. Free to ask, and the
    // platform records where the towers came from so a derived database
    // can be cleared for redistribution.
    "cell.fetchTowers": free(),
    "cell.ingestScan": free(),
    "cell.listAnomalies": free(),
  },
  "police-reports": {
    "police.fetchSocrata": free(),
    "police.fetchArcgis": free(),
    "police.importCadReport": free(),
    "police.listIncidents": free(),
  },
  "ai-settings": {
    "ai.listProviders": free(),
    "ai.listDownloads": free(),
    "ai.startDownload": free(),
    "ai.removeModel": free(),
    // A request to a model provider. The unit declared here is the
    // request, because this path makes no call of its own and so has
    // nothing to measure: the dispatcher prices a call before it is
    // made. The call that *is* made goes through the chat route, which
    // records what the provider reported in `ai-token`; this entry is
    // what a reader sees when working out what a call could cost before
    // making one, and the chat route never writes this unit.
    "ai.chat": { units: 1, unit: "ai-request" },
  },
  "tool-collection": {
    "collection.listTools": free(),
    "collection.listCategory": free(),
    // The collection runs on the operator's own machine, in the worker.
    "collection.execute": free(),
  },
} as const satisfies Record<SecurityToolId, Record<string, CapabilityCost>>;

/**
 * The cost of a capability, or null when it is not a capability at all.
 *
 * A capability that is not in the table has no declared cost, which the
 * test treats as an error rather than as free. A tool that is not
 * allowlisted is refused before this is asked, so the null here only
 * reaches a caller that has already been through the allowlist.
 */
export function costFor(
  tool: SecurityToolId,
  capability: string,
): CapabilityCost | null {
  const table = (CAPABILITY_COSTS as Record<string, Record<string, CapabilityCost>>)[tool];
  return table?.[capability] ?? null;
}

/** The capabilities of a tool that cost the operator something. */
export function costingCapabilities(
  tool: SecurityToolId,
): { capability: string; cost: CapabilityCost }[] {
  const table = (CAPABILITY_COSTS as Record<string, Record<string, CapabilityCost>>)[tool];
  if (!table) return [];
  return Object.entries(table)
    .filter(([, c]) => c.units > 0)
    .map(([capability, cost]) => ({ capability, cost }));
}

/**
 * Every capability in the allowlist, and the cost table's answer for it.
 *
 * Used by the test that holds the two tables together, and by anything
 * that wants to list what the platform's capabilities cost.
 */
export function everyCapability(): {
  tool: SecurityToolId;
  capability: string;
  cost: CapabilityCost | null;
}[] {
  const out: { tool: SecurityToolId; capability: string; cost: CapabilityCost | null }[] = [];
  for (const [tool, capabilities] of Object.entries(SAFE_CAPABILITIES)) {
    for (const capability of capabilities) {
      out.push({
        tool: tool as SecurityToolId,
        capability,
        cost: costFor(tool as SecurityToolId, capability),
      });
    }
  }
  return out;
}
