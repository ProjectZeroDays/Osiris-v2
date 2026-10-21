import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";

export async function importOwnedCameraConfig(payload: unknown, ctx: AdapterContext) {
  const p = payload as { cameras?: Array<{ id: string; label: string; lat?: number; lon?: number }> };
  if (!p?.cameras) throw new Error("DEDSEC_INVALID_CONFIG");
  const findings: SecurityFinding[] = p.cameras.map((c) => ({
    id: `dedsec-cctv:${c.id}`,
    toolId: "dedsec-cctv",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: null,
    importedAt: new Date().toISOString(),
    severity: null,
    confidence: 0.9,
    status: "observed",
    evidenceHash: null,
    retentionUntil: null,
    properties: { label: c.label, lat: c.lat ?? null, lon: c.lon ?? null },
  }));
  return { findings };
}