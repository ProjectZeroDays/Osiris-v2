import type { ComponentType, SVGProps } from "react";
import {
  Database, Fingerprint, Network, Radar, Share2,
  ShieldCheck, Smartphone, Tv, Video, Workflow,
} from "lucide-react";

/* The custom marks are imported from their own modules rather than from
   the icon index: the index imports this file for the tool id, and an
   import back the other way would be a cycle. */
import { DedSecCctvIcon } from "@/components/security-tools/icons/DedSecCctvIcon";
import { ExploitIndexIcon } from "@/components/security-tools/icons/ExploitIndexIcon";
import { SpyTvIcon } from "@/components/security-tools/icons/SpyTvIcon";
import { PagasusProIcon } from "@/components/security-tools/icons/PagasusProIcon";
import { RufloIcon } from "@/components/security-tools/icons/RufloIcon";
import { QuantumCliIcon } from "@/components/security-tools/icons/QuantumCliIcon";
import { NrSuiteIcon, StrykerAppIcon } from "@/components/security-tools/icons/NrSuiteIcon";
import { DroneRidIcon, CopCamIcon } from "@/components/security-tools/icons/DroneRidIcon";
import { FlockIcon, HibfIcon } from "@/components/security-tools/icons/FlockIcon";
import { PlateOcrIcon, CameraFeedIcon, WifiIcon } from "@/components/security-tools/icons/PlateOcrIcon";
import { ScannerIcon, CellTowerIcon, PoliceIcon } from "@/components/security-tools/icons/CivicIcon";
import { AiProvidersIcon } from "@/components/security-tools/icons/AiProvidersIcon";
import { ToolCollectionIcon } from "@/components/security-tools/icons/ToolCollectionIcon";

export type SecurityToolId =
  | "shodan" | "zenmap" | "metasploit" | "maltego" | "sherlock"
  | "dedsec-cctv" | "exploit-index" | "spytv" | "pagasus-pro"
  | "ruflo" | "quantum-cli"
  // v5 -- network and sensor extensions
  | "nrsuite" | "strykerapp"
  // v6 -- drone Remote ID and surveillance mapping
  | "esp32-drone-rid" | "esp32-surveillance-cams"
  // v7 -- Flock and ALPR mapping
  | "flock-detector" | "haveibeenflocked" | "plate-ocr" | "camera-feed"
  // v10 -- wireless
  | "wifite3"
  // v13/v15 -- public and civic data
  | "scanner-feeds" | "imsi-catcher" | "police-reports"
  // v13 -- the platform's own model providers
  | "ai-settings"
  // the wide Cyber-Security tool collection, reached through a worker
  | "tool-collection";

export type IntegrationState =
  | "not-configured" | "ready" | "needs-authorization"
  | "review-only" | "disabled-by-policy";

/**
 * The risk taxonomy.
 *
 * `active-transmit` is separated from `passive-metadata` because the
 * difference is not a matter of degree: a passive tool listens, and an
 * active one may knock a neighbour's device off the network. A user
 * choosing a tool deserves to know which one they are choosing.
 */
export type RiskClass =
  | "passive-metadata"
  | "active-transmit"
  | "user-owned-media"
  | "report-import"
  | "read-only-mcp"
  | "disabled";

export const RISK_CLASS_NOTES: Record<RiskClass, string> = {
  "passive-metadata": "Listens only. No RF emission.",
  "active-transmit": "Transmits RF. May deauth or disrupt nearby devices. Requires authorisation.",
  "report-import": "Consumes a file. No live connection.",
  "user-owned-media": "Accesses user-controlled media and streams.",
  "read-only-mcp": "Reads via MCP, with human approval for writes.",
  "disabled": "Quarantined. No capability is offered.",
};

export interface IntegrationCard {
  id: SecurityToolId;
  name: string;
  purpose: string;
  href: `/tools/security/${SecurityToolId}`;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  state: IntegrationState;
  riskClass: RiskClass;
  upstream?: string;
  retentionDays: number;
  requiresAsset: boolean;
  requiresConsent: boolean;
}

export const SECURITY_TOOL_CARDS = [
  { id: "shodan", name: "Shodan", purpose: "Passive exposure context for verified assets",
    href: "/tools/security/shodan", Icon: Radar, state: "not-configured",
    riskClass: "passive-metadata", retentionDays: 90, requiresAsset: true, requiresConsent: false },
  { id: "zenmap", name: "Zenmap", purpose: "Approved internal discovery workflow",
    href: "/tools/security/zenmap", Icon: Network, state: "needs-authorization",
    riskClass: "report-import", retentionDays: 180, requiresAsset: true, requiresConsent: false },
  { id: "metasploit", name: "Metasploit", purpose: "Import approved lab assessment reports",
    href: "/tools/security/metasploit", Icon: ShieldCheck, state: "review-only",
    riskClass: "report-import", retentionDays: 365, requiresAsset: true, requiresConsent: false },
  { id: "maltego", name: "Maltego", purpose: "Reviewed infrastructure graph exchange",
    href: "/tools/security/maltego", Icon: Share2, state: "needs-authorization",
    riskClass: "report-import", retentionDays: 180, requiresAsset: true, requiresConsent: false },
  { id: "sherlock", name: "Sherlock", purpose: "Opt-in controlled-account check",
    href: "/tools/security/sherlock", Icon: Fingerprint, state: "review-only",
    riskClass: "passive-metadata", retentionDays: 30, requiresAsset: false, requiresConsent: true },
  { id: "dedsec-cctv", name: "DedSec CCTV", purpose: "User-owned camera configuration only",
    href: "/tools/security/dedsec-cctv", Icon: Video, state: "needs-authorization",
    riskClass: "user-owned-media", retentionDays: 90, requiresAsset: true, requiresConsent: true },
  { id: "exploit-index", name: "Exploit-Index", purpose: "Untrusted CVE metadata leads only",
    href: "/tools/security/exploit-index", Icon: Database, state: "review-only",
    riskClass: "passive-metadata", retentionDays: 90, requiresAsset: false, requiresConsent: false },
  { id: "spytv", name: "SpyTV Defense", purpose: "Import defensive findings and advisories",
    href: "/tools/security/spytv", Icon: Tv, state: "review-only",
    riskClass: "report-import", retentionDays: 180, requiresAsset: true, requiresConsent: false },
  { id: "pagasus-pro", name: "Pegasus Pro", purpose: "Minimized device-audit report import only",
    href: "/tools/security/pagasus-pro", Icon: Smartphone, state: "review-only",
    riskClass: "report-import", retentionDays: 90, requiresAsset: false, requiresConsent: true },
  { id: "ruflo", name: "Ruflo", purpose: "Approval-gated read-only analysis",
    href: "/tools/security/ruflo", Icon: Workflow, state: "review-only",
    riskClass: "read-only-mcp", retentionDays: 30, requiresAsset: false, requiresConsent: false },

  // v5: network and sensor extensions
  { id: "nrsuite", name: "nrSuite", purpose: "Import sanitized pcap flow summaries",
    href: "/tools/security/nrsuite", Icon: NrSuiteIcon, state: "review-only",
    riskClass: "report-import", retentionDays: 30, requiresAsset: false, requiresConsent: true,
    upstream: "https://github.com/projectzerodays/nrsuite" },
  { id: "strykerapp", name: "StrykerApp", purpose: "Import mutation and coverage reports",
    href: "/tools/security/strykerapp", Icon: StrykerAppIcon, state: "review-only",
    riskClass: "report-import", retentionDays: 90, requiresAsset: true, requiresConsent: false,
    upstream: "https://github.com/projectzerodays/strykerapp" },

  // v6: drone Remote ID and surveillance mapping
  { id: "esp32-drone-rid", name: "Drone RID", purpose: "Passive Remote ID drone and operator tracking",
    href: "/tools/security/esp32-drone-rid", Icon: DroneRidIcon, state: "needs-authorization",
    riskClass: "passive-metadata", retentionDays: 30, requiresAsset: false, requiresConsent: false,
    upstream: "https://github.com/colonelpanichacks/Sky-Spy" },
  { id: "esp32-surveillance-cams", name: "Cop Cams", purpose: "Map ALPR, body cams and surveillance devices",
    href: "/tools/security/esp32-surveillance-cams", Icon: CopCamIcon, state: "needs-authorization",
    riskClass: "passive-metadata", retentionDays: 180, requiresAsset: false, requiresConsent: false,
    upstream: "https://github.com/topics/alpr" },

  // v7: Flock and ALPR mapping
  { id: "flock-detector", name: "Flock Detector", purpose: "Passive ALPR camera detection and mapping",
    href: "/tools/security/flock-detector", Icon: FlockIcon, state: "needs-authorization",
    riskClass: "passive-metadata", retentionDays: 365, requiresAsset: false, requiresConsent: false,
    upstream: "https://github.com/topics/flock-safety" },
  { id: "haveibeenflocked", name: "HaveIBeenFlocked", purpose: "Report and cross-reference ALPR sightings",
    href: "/tools/security/haveibeenflocked", Icon: HibfIcon, state: "review-only",
    riskClass: "passive-metadata", retentionDays: 365, requiresAsset: false, requiresConsent: false,
    upstream: "https://haveibeenflocked.com" },
  { id: "plate-ocr", name: "Plate OCR", purpose: "Import recognised plates and edge events",
    href: "/tools/security/plate-ocr", Icon: PlateOcrIcon, state: "review-only",
    riskClass: "passive-metadata", retentionDays: 90, requiresAsset: false, requiresConsent: true },
  { id: "camera-feed", name: "Camera Feed", purpose: "User-owned camera feeds and embed players",
    href: "/tools/security/camera-feed", Icon: CameraFeedIcon, state: "review-only",
    riskClass: "user-owned-media", retentionDays: 90, requiresAsset: true, requiresConsent: true },

  // v10: wireless
  { id: "wifite3", name: "Wifite3", purpose: "Automated WiFi audit and handshake capture",
    href: "/tools/security/wifite3", Icon: WifiIcon, state: "needs-authorization",
    riskClass: "active-transmit", retentionDays: 90, requiresAsset: false, requiresConsent: true,
    upstream: "https://github.com/kimocoder/wifite2" },
  { id: "quantum-cli", name: "Quantum-CLI", purpose: "Import orchestration reports from an external run",
    href: "/tools/security/quantum-cli", Icon: QuantumCliIcon, state: "review-only",
    riskClass: "report-import", retentionDays: 180, requiresAsset: false, requiresConsent: false,
    upstream: "https://github.com/projectzerodays/Quantum-cli" },

  // v13/v15 -- public and civic data. These are public records, so the
  // risk is low; the care is in the provenance and the attribution.
  { id: "scanner-feeds", name: "Scanner Feeds", purpose: "Public-safety radio feeds and CAP emergency alerts",
    href: "/tools/security/scanner-feeds", Icon: ScannerIcon, state: "ready",
    riskClass: "passive-metadata", retentionDays: 7, requiresAsset: false, requiresConsent: false,
    upstream: "https://www.broadcastify.com/" },
  { id: "imsi-catcher", name: "Cell Anomalies", purpose: "Cell tower database and IMSI-catcher heuristics",
    href: "/tools/security/imsi-catcher", Icon: CellTowerIcon, state: "ready",
    riskClass: "passive-metadata", retentionDays: 30, requiresAsset: false, requiresConsent: false,
    upstream: "https://opencellid.org/" },
  { id: "police-reports", name: "Police Reports", purpose: "Public incident and dispatch records by jurisdiction",
    href: "/tools/security/police-reports", Icon: PoliceIcon, state: "ready",
    riskClass: "passive-metadata", retentionDays: 30, requiresAsset: false, requiresConsent: false,
    upstream: "https://dev.socrata.com/" },

  // v13 -- the platform's own model providers. A local model first: it
  // costs nothing and its data never leaves the machine.
  { id: "ai-settings", name: "AI Providers", purpose: "Local GGUF, MLX and Ollama, plus a server-held OpenRouter key",
    href: "/tools/security/ai-settings", Icon: AiProvidersIcon, state: "not-configured",
    riskClass: "read-only-mcp", retentionDays: 0, requiresAsset: false, requiresConsent: false },

  // The wide tool collection. It runs in a separate worker, and the platform
  // is the only thing that may ask it to do anything.
  { id: "tool-collection", name: "Tool Collection", purpose: "The wide Cyber-Security tool collection, run by a worker behind the platform",
    href: "/tools/security/tool-collection", Icon: ToolCollectionIcon, state: "not-configured",
    riskClass: "report-import", retentionDays: 30, requiresAsset: true, requiresConsent: true,
    upstream: "https://github.com/projectzerodays" },
] as const satisfies readonly IntegrationCard[];

export const INTEGRATION_STATE_LABEL: Record<IntegrationState, string> = {
  "not-configured": "Not configured",
  "ready": "Configured — authorization still required",
  "needs-authorization": "Needs authorization",
  "review-only": "Review only",
  "disabled-by-policy": "Disabled by policy",
};

export const STATE_TONE: Record<IntegrationState, "neutral" | "ok" | "warn" | "muted"> = {
  "not-configured": "neutral",
  "ready": "ok",
  "needs-authorization": "warn",
  "review-only": "muted",
  "disabled-by-policy": "muted",
};
