import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";

export async function importLabReport(payload: unknown, ctx: AdapterContext) {
  const p = payload as { findings?: Array<{ host: string; cve?: string; status?: string; severity?: string }> };
  if (!p?.findings) throw new Error("METASPLOIT_INVALID_REPORT");
  const findings: SecurityFinding[] = p.findings.map((f) => ({
    id: `metasploit:${f.host}:${f.cve ?? "na"}`,
    toolId: "metasploit",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: null,
    importedAt: new Date().toISOString(),
    severity: (f.severity as SecurityFinding["severity"]) ?? null,
    confidence: 0.7,
    status: "inferred",
    evidenceHash: null,
    retentionUntil: null,
    properties: { cve: f.cve ?? null, status: f.status ?? null },
  }));
  return { findings };
}