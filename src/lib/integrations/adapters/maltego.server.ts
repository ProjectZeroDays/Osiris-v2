import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";

export async function importReviewedGraph(payload: unknown, ctx: AdapterContext) {
  const p = payload as { entities?: Array<{ id: string; type: string; value: string }> };
  if (!p?.entities) throw new Error("MALTEGO_INVALID_GRAPH");
  const findings: SecurityFinding[] = p.entities.map((e) => ({
    id: `maltego:${e.id}`,
    toolId: "maltego",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: null,
    importedAt: new Date().toISOString(),
    severity: null,
    confidence: 0.6,
    status: "inferred",
    evidenceHash: null,
    retentionUntil: null,
    properties: { type: e.type, value: e.value },
  }));
  return { findings };
}

export async function exportVerifiedGraph(assetIds: string[], _ctx: AdapterContext) {
  return { entities: assetIds.map((id) => ({ id, type: "asset", value: id })) };
}