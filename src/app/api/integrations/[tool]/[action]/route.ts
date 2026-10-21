import { NextResponse } from "next/server";
import type { SecurityToolId } from "@/config/security-tools";
import { assertCapabilityAllowed } from "@/lib/integrations/capabilities.server";
import {
  assertAuthorized,
  assertAuthorizedAgainstRegistry,
} from "@/lib/integrations/authz.server";
import { recordAudit } from "@/lib/integrations/audit.server";
import type { IntegrationRequest, SecurityFinding } from "@/lib/integrations/types";
import { IntegrationRequestBodySchema } from "@/lib/integrations/schemas";
import { getAuthContext } from "@/lib/auth/context.server";
import { consumeQuota, DEFAULT_DAILY_QUOTA } from "@/lib/integrations/quota.server";
import { costFor } from "@/lib/integrations/costs.server";
import { recordFailure, recordSuccess, isCoolingDown, cooldownRemaining } from "@/lib/integrations/health.server";
import { getDb } from "@/db/client.server";

import * as shodan from "@/lib/integrations/adapters/shodan.server";
import * as zenmap from "@/lib/integrations/adapters/zenmap.server";
import * as metasploit from "@/lib/integrations/adapters/metasploit.server";
import * as maltego from "@/lib/integrations/adapters/maltego.server";
import * as sherlock from "@/lib/integrations/adapters/sherlock.server";
import * as dedsec from "@/lib/integrations/adapters/dedsec-cctv.server";
import * as exploitIndex from "@/lib/integrations/adapters/exploit-index.server";
import * as spytv from "@/lib/integrations/adapters/spytv.server";
import * as pagasus from "@/lib/integrations/adapters/pagasus-pro.server";
import * as ruflo from "@/lib/integrations/adapters/ruflo.server";
import * as nrsuite from "@/lib/integrations/adapters/nrsuite.server";
import * as stryker from "@/lib/integrations/adapters/strykerapp.server";
import * as rid from "@/lib/integrations/adapters/esp32-rid.server";
import * as surveillance from "@/lib/integrations/adapters/esp32-surveillance.server";
import * as flock from "@/lib/integrations/adapters/flock.server";
import * as hibf from "@/lib/integrations/adapters/hibf.server";
import * as plateOcr from "@/lib/integrations/adapters/plate-ocr.server";
import * as cameraFeed from "@/lib/integrations/adapters/camera-feed.server";
import * as wifite from "@/lib/integrations/adapters/wifite3.server";
import * as quantum from "@/lib/integrations/adapters/quantum.server";
import * as scanner from "@/lib/integrations/adapters/scanner-feeds.server";
import * as cell from "@/lib/integrations/adapters/imsi-catcher.server";
import * as police from "@/lib/integrations/adapters/police-reports.server";
import * as ai from "@/lib/integrations/adapters/ai-settings.server";
import * as collection from "@/lib/integrations/adapters/tool-collection.server";
import { persistFindings } from "@/lib/integrations/persistence.server";

export const runtime = "nodejs";

/** How long an upstream is given before the request is abandoned. */
const UPSTREAM_TIMEOUT_MS = 15_000;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ tool: string; action: string }> },
) {
  const { tool, action } = await ctx.params;
  const toolId = tool as SecurityToolId;

  // The body is untrusted. An empty body is allowed; a malformed one is not.
  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json();
    if (raw && typeof raw === "object") body = raw as Record<string, unknown>;
  } catch {
    /* empty body ok */
  }

  const parsed = IntegrationRequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        tool: toolId,
        capability: action,
        errorCode: "INTEGRATION_INVALID_BODY",
        detail: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const clean = parsed.data;

  const auth = await getAuthContext();
  const request: IntegrationRequest = {
    requestId: clean.requestId ?? crypto.randomUUID(),
    tenantId: auth.tenantId ?? "",
    actorId: auth.actorId ?? "",
    tool: toolId,
    capability: action,
    assetId: clean.assetId,
    consentAttestation: clean.consentAttestation,
    purpose: clean.purpose ?? "unspecified",
    approvalId: clean.approvalId,
    payload: clean.payload,
  };

  const adapterCtx = {
    tenantId: request.tenantId,
    actorId: request.actorId,
    assetId: request.assetId,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  };

  const source = `integration:${toolId}`;

  try {
    // 1. Identity and shape. A client cannot assert its own tenant.
    assertAuthorized(request, auth);

    // 2. The capability must be on the tool's allowlist.
    assertCapabilityAllowed(toolId, action);

    // 3. When a database is configured, the durable record is consulted:
    //    the asset must belong to the tenant, and a consent record must
    //    cover this exact capability.
    if (getDb()) {
      await assertAuthorizedAgainstRegistry(request, auth);
    }

    // 4. The source must not be in cooldown from earlier failures.
    if (isCoolingDown(source)) {
      throw new Error(`INTEGRATION_SOURCE_COOLDOWN:${cooldownRemaining(source)}`);
    }

    // 5. The quota. Charged before the work, so a runaway caller cannot
    //    spend the day's allowance on calls that all fail. The cost is
    //    charged with it, in the provider's unit: a metered service
    //    charges for the request whether or not the answer was useful,
    //    and an operator who cannot see the adds coming finds out on a
    //    bill.
    const quota = await consumeQuota(
      request.tenantId,
      toolId,
      DEFAULT_DAILY_QUOTA,
      costFor(toolId, action) ?? undefined,
    );
    if (!quota.allowed) throw new Error("INTEGRATION_QUOTA_EXCEEDED");

    let result: unknown;
    switch (`${toolId}:${action}`) {
      case "shodan:host.lookupVerifiedAsset":
        result = await shodan.lookupVerifiedAsset(String(clean.payload), adapterCtx); break;
      case "zenmap:discovery.requestApprovedJob":
        result = await zenmap.requestApprovedJob(String(request.assetId), adapterCtx); break;
      case "zenmap:report.import":
        result = await zenmap.importReport(clean.payload, adapterCtx); break;
      case "metasploit:labReport.import":
        result = await metasploit.importLabReport(clean.payload, adapterCtx); break;
      case "maltego:infrastructureGraph.importReviewed":
        result = await maltego.importReviewedGraph(clean.payload, adapterCtx); break;
      case "maltego:infrastructureGraph.exportVerified":
        result = await maltego.exportVerifiedGraph(clean.payload as string[], adapterCtx); break;
      case "sherlock:controlledHandle.checkSingle":
        result = await sherlock.checkSingle(String(clean.payload), adapterCtx); break;
      case "dedsec-cctv:ownedCamera.configImport":
        result = await dedsec.importOwnedCameraConfig(clean.payload, adapterCtx); break;
      case "exploit-index:cveMetadata.readUntrusted":
        result = await exploitIndex.readUntrustedCveMetadata(String(clean.payload), adapterCtx); break;
      case "spytv:defenseReport.import":
        result = await spytv.importDefenseReport(clean.payload, adapterCtx); break;
      case "pagasus-pro:deviceAudit.importMinimized":
        result = await pagasus.importMinimizedAudit(clean.payload, adapterCtx); break;
      case "ruflo:intelSummary.readOnly":
        result = await ruflo.readOnlySummary(String(clean.payload), adapterCtx); break;
      case "ruflo:reportDraft.createWithApproval":
        result = await ruflo.createReportDraft(String(clean.payload), adapterCtx); break;

      // v5 -- a summary the operator produced; never a raw pcap.
      case "nrsuite:pcap.importSummary":
        result = await nrsuite.importSummary(clean.payload, adapterCtx); break;
      case "nrsuite:pcap.listFlows":
        result = await nrsuite.listFlows(clean.payload, adapterCtx); break;
      case "nrsuite:pcap.decodeMetadata":
        result = await nrsuite.decodeMetadata(clean.payload, adapterCtx); break;
      case "nrsuite:pcap.exportSanitized":
        result = await nrsuite.exportSanitized(clean.payload, adapterCtx); break;

      case "strykerapp:report.importMutationSummary":
        result = await stryker.importMutationSummary(clean.payload, adapterCtx); break;
      case "strykerapp:report.importCoverageSummary":
        result = await stryker.importCoverageSummary(clean.payload, adapterCtx); break;
      case "strykerapp:report.listRuns":
        result = await stryker.listRuns(clean.payload, adapterCtx); break;

      // v6 -- passive sensor ingestion.
      case "esp32-drone-rid:rid.ingestFrame":
        result = await rid.ingestFrame(clean.payload, adapterCtx); break;
      case "esp32-drone-rid:rid.listDrones":
        result = await rid.listDrones(clean.payload, adapterCtx); break;
      case "esp32-drone-rid:rid.listOperators":
        result = await rid.listOperators(clean.payload, adapterCtx); break;
      case "esp32-drone-rid:rid.exportTrack":
        result = await rid.exportTrack(clean.payload, adapterCtx); break;

      case "esp32-surveillance-cams:surveillance.ingestDetection":
        result = await surveillance.ingestDetection(clean.payload, adapterCtx); break;
      case "esp32-surveillance-cams:surveillance.listDevices":
        result = await surveillance.listDevices(clean.payload, adapterCtx); break;
      case "esp32-surveillance-cams:surveillance.enrichCatalog":
        result = await surveillance.enrichCatalog(clean.payload, adapterCtx); break;

      // v7 -- Flock and ALPR.
      case "flock-detector:flock.ingestDetection":
        result = await flock.ingestDetection(clean.payload, adapterCtx); break;
      case "flock-detector:flock.listCameras":
        result = await flock.listCameras(clean.payload, adapterCtx); break;
      case "flock-detector:flock.exportDeFlock":
        result = await flock.exportDeFlock(clean.payload, adapterCtx); break;
      case "flock-detector:flock.exportGeoJSON":
        result = await flock.exportGeoJSON(clean.payload, adapterCtx); break;

      case "haveibeenflocked:hibf.lookupMac":
        result = await hibf.lookupMac(clean.payload, adapterCtx); break;
      case "haveibeenflocked:hibf.reportSighting":
        result = await hibf.reportSighting(clean.payload, adapterCtx); break;
      case "haveibeenflocked:hibf.listReports":
        result = await hibf.listReports(clean.payload, adapterCtx); break;

      case "plate-ocr:plate.recognize":
        result = await plateOcr.recognize(clean.payload, adapterCtx); break;
      case "plate-ocr:plate.listEvents":
        result = await plateOcr.listEvents(clean.payload, adapterCtx); break;

      case "camera-feed:feed.listFeeds":
        result = await cameraFeed.listFeeds(clean.payload, adapterCtx); break;
      case "camera-feed:feed.embedPlayer":
        result = await cameraFeed.embedPlayer(clean.payload, adapterCtx); break;

      // v10 -- the wireless tool.
      case "wifite3:wifi.listInterfaces":
        result = await wifite.listInterfaces(clean.payload, adapterCtx); break;
      case "wifite3:wifi.requestScan":
        result = await wifite.requestScan(clean.payload, adapterCtx); break;
      case "wifite3:wifi.importCapture":
        result = await wifite.importCapture(clean.payload, adapterCtx); break;
      case "wifite3:wifi.importCracked":
        result = await wifite.importCracked(clean.payload, adapterCtx); break;
      case "wifite3:wifi.exportReport":
        result = await wifite.exportReport(clean.payload, adapterCtx); break;

      // v10 -- Quantum-CLI, Depth A: reports only.
      case "quantum-cli:quantum.importRunReport":
        result = await quantum.importRunReport(clean.payload, adapterCtx); break;
      case "quantum-cli:quantum.listRuns":
        result = await quantum.listRuns(clean.payload, adapterCtx); break;
      case "quantum-cli:quantum.exportFindings":
        result = await quantum.exportFindings(clean.payload, adapterCtx); break;

      // v13/v15 -- public and civic data.
      case "scanner-feeds:scanner.listBroadcastifyFeeds":
        result = await scanner.listBroadcastifyFeeds(
          (clean.payload ?? {}) as { state?: string; service?: never },
          adapterCtx,
        ); break;
      case "scanner-feeds:scanner.listOpenMhzSystems":
        result = await scanner.listOpenMhzSystems(clean.payload, adapterCtx); break;
      case "scanner-feeds:scanner.fetchCapAlerts":
        result = await scanner.fetchCapFeed(
          (clean.payload ?? {}) as { source?: never; bbox?: [number, number, number, number] },
          adapterCtx,
        ); break;
      case "scanner-feeds:scanner.importFeedList":
        result = await scanner.importFeedList(clean.payload, adapterCtx); break;

      case "imsi-catcher:cell.fetchTowers":
        result = await cell.fetchTowers(
          (clean.payload ?? {}) as { bbox: [number, number, number, number]; radio?: never },
          adapterCtx,
        ); break;
      case "imsi-catcher:cell.ingestScan":
        result = await cell.ingestCellScan(
          (clean.payload ?? {}) as { observations?: never[] },
          adapterCtx,
        ); break;
      case "imsi-catcher:cell.listAnomalies":
        result = await cell.ingestCellScan(
          (clean.payload ?? {}) as { observations?: never[] },
          adapterCtx,
        ); break;

      case "police-reports:police.fetchSocrata":
        result = await police.fetchSocrataIncidents(
          (clean.payload ?? {}) as { host: string; datasetId: string; since?: string; limit?: number },
          adapterCtx,
        ); break;
      case "police-reports:police.fetchArcgis":
        result = await police.fetchArcgisIncidents(
          (clean.payload ?? {}) as { host: string; layerPath: string; since?: string; limit?: number },
          adapterCtx,
        ); break;
      case "police-reports:police.importCadReport":
        result = await police.importCadReport(clean.payload, adapterCtx); break;
      case "police-reports:police.listIncidents":
        result = await police.importCadReport(clean.payload, adapterCtx); break;

      // v13 -- the platform's own model providers.
      case "ai-settings:ai.listProviders":
        result = await ai.listProviders(clean.payload, adapterCtx); break;
      case "ai-settings:ai.listDownloads":
        result = await ai.listDownloadsAction(clean.payload, adapterCtx); break;
      case "ai-settings:ai.startDownload":
        result = await ai.startDownloadAction(clean.payload, adapterCtx); break;
      case "ai-settings:ai.removeModel":
        result = await ai.removeModelAction(clean.payload, adapterCtx); break;
      case "ai-settings:ai.chat":
        result = await ai.chat(clean.payload, adapterCtx); break;

      // The wide tool collection, reached through its worker.
      case "tool-collection:collection.listTools":
        result = await collection.listTools(clean.payload, adapterCtx); break;
      case "tool-collection:collection.listCategory":
        result = await collection.listCategory(clean.payload, adapterCtx); break;
      case "tool-collection:collection.execute":
        result = await collection.execute(clean.payload, adapterCtx); break;

      default:
        throw new Error("INTEGRATION_CAPABILITY_DENIED");
    }

    recordSuccess(source);

    // Whatever the adapter produced is written to the durable store, so a
    // finding leaves a trace, belongs to a tenant, and can be deleted on
    // the deadline it was given. Without a database the finding is still
    // returned; the platform says it kept nothing.
    let stored: { persisted: boolean; count: number; reason?: string } = {
      persisted: false,
      count: 0,
      reason: "NO_FINDINGS",
    };
    const produced = (result as { findings?: unknown[] } | null)?.findings;
    if (Array.isArray(produced) && produced.length > 0) {
      stored = await persistFindings(
        toolId,
        request.tenantId,
        produced as SecurityFinding[],
      );
    }

    const auditId = recordAudit({
      tenantId: request.tenantId, actorId: request.actorId,
      tool: toolId, capability: action, assetId: request.assetId,
      purpose: request.purpose, decision: "allow",
      resultId: stored.count > 0 ? `stored:${stored.count}` : undefined,
    });

    return NextResponse.json(
      {
        ok: true,
        requestId: request.requestId,
        tool: toolId,
        capability: action,
        data: result,
        auditId,
        stored,
      },
      { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "INTEGRATION_ERROR";
    recordFailure(source, message);

    const auditId = recordAudit({
      tenantId: request.tenantId, actorId: request.actorId,
      tool: toolId, capability: action, assetId: request.assetId,
      purpose: request.purpose, decision: "deny", reason: message,
    });

    const status = message.includes("UNAUTHENTICATED") || message.includes("TENANT") ? 401
      : message.includes("DENIED") || message.includes("DISABLED")
        || message.includes("ASSET_REQUIRED") || message.includes("CONSENT_REQUIRED")
        || message.includes("NOT_OWNED") || message.includes("QUOTA")
        || message.includes("COOLDOWN") ? 403
      : message.includes("NOT_CONFIGURED") || message.includes("UNAVAILABLE") ? 503
      : message.includes("INVALID_") ? 400
      : 502;

    return NextResponse.json(
      { ok: false, requestId: request.requestId, tool: toolId, capability: action, errorCode: message.split(":")[0], auditId },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
