import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";

export async function importDefenseReport(payload: unknown, ctx: AdapterContext) {
  const p = payload as { findings?: Array<{ id: string; title: string; severity?: string; cve?: string }> };
  if (!p?.findings) throw new Error("SPYTV_INVALID_REPORT");
  const findings: SecurityFinding[] = p.findings.map((f) => ({
    id: `spytv:${f.id}`,
    toolId: "spytv",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: null,
    importedAt: new Date().toISOString(),
    severity: (f.severity as SecurityFinding["severity"]) ?? null,
    confidence: 0.7,
    status: "observed",
    evidenceHash: null,
    retentionUntil: null,
    properties: { title: f.title, cve: f.cve ?? null },
  }));
  return { findings };
}