import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";

export async function importMinimizedAudit(payload: unknown, ctx: AdapterContext) {
  const p = payload as { device?: { model?: string; os?: string }; findings?: Array<{ id: string; title: string }> };
  if (!p?.findings) throw new Error("PAGASUS_INVALID_REPORT");
  const findings: SecurityFinding[] = p.findings.map((f) => ({
    id: `pagasus-pro:${f.id}`,
    toolId: "pagasus-pro",
    assetId: null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: null,
    importedAt: new Date().toISOString(),
    severity: null,
    confidence: 0.6,
    status: "inferred",
    evidenceHash: null,
    retentionUntil: null,
    properties: { title: f.title, device: p.device ?? null },
  }));
  return { findings };
}