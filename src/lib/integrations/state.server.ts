import "server-only";
import type { SecurityToolId, IntegrationState } from "@/config/security-tools";
import { SECURITY_TOOL_CARDS } from "@/config/security-tools";

export function deriveIntegrationState(tool: SecurityToolId): IntegrationState {
  const card = SECURITY_TOOL_CARDS.find((c) => c.id === tool);
  if (!card) throw new Error("UNKNOWN_TOOL");

  const configured = isConfigured(tool);
  if (!configured) return "not-configured";

  if (card.requiresAsset || card.requiresConsent) return "needs-authorization";
  return "ready";
}

function isConfigured(tool: SecurityToolId): boolean {
  switch (tool) {
    case "shodan": return !!process.env.SHODAN_API_KEY;
    case "zenmap": return !!process.env.ZENMAP_WORKER_URL;
    case "metasploit": return true;
    case "maltego": return true;
    case "sherlock": return true;
    case "dedsec-cctv": return !!process.env.DEDSEC_CCTV_BASE_URL;
    case "exploit-index": return true;
    case "spytv": return true;
    case "pagasus-pro": return true;
    case "ruflo": return !!process.env.RUFLO_MCP_URL;

    // File imports: nothing upstream to reach.
    case "nrsuite": return true;
    case "strykerapp": return true;
    case "esp32-drone-rid": return true;
    case "esp32-surveillance-cams": return true;
    case "flock-detector": return true;
    case "haveibeenflocked": return true;
    case "plate-ocr": return true;
    case "camera-feed": return true;
    case "quantum-cli": return true;

    // The wireless tool needs a monitor-mode interface, which means the
    // host must have a WiFi card passed through. Without the capability
    // declared, the tool is not configured.
    case "wifite3": return !!process.env.WIFITE_BIN;

    // v13/v15 -- public feeds. These are keyless and public, so they are
    // configured by default.
    case "scanner-feeds": return true;
    case "imsi-catcher": return true;
    case "police-reports": return true;

    // The platform's model providers. It is configured when at least one
    // of them is reachable.
    case "ai-settings": return hasAnyAiProvider();

    // The wide tool collection. It is configured when the worker is
    // reachable and the platform holds its key.
    case "tool-collection": return hasToolCollectionWorker();
  }
}

/** True when the tool-collection worker is configured. */
function hasToolCollectionWorker(): boolean {
  if (!process.env.OSIRIS_WORKER_URL) return false;
  if (!process.env.OSIRIS_WORKER_KEY) return false;
  return true;
}

/** True when the deployment has at least one model provider. */
function hasAnyAiProvider(): boolean {
  if (process.env.LLAMA_CPP_URL) return true;
  if (process.env.MLX_URL) return true;
  if (process.env.OLLAMA_URL ?? process.env.OLLAMA_HOST) return true;
  if (process.env.OPENROUTER_API_KEY) return true;
  return false;
}