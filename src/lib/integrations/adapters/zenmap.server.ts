import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";

export async function requestApprovedJob(assetId: string, ctx: AdapterContext) {
  const url = process.env.ZENMAP_WORKER_URL;
  if (!url) throw new Error("ZENMAP_NOT_CONFIGURED");

  const res = await fetch(`${url}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assetId, profile: "safe-default" }),
    signal: ctx.signal,
  });
  if (!res.ok) throw new Error("ZENMAP_UPSTREAM_ERROR");
  return (await res.json()) as { jobId: string; status: string };
}

export async function importReport(payload: unknown, ctx: AdapterContext) {
  const p = payload as { hosts?: Array<{ ip: string; ports?: Array<{ port: number; service?: string }> }> };
  if (!p?.hosts) throw new Error("ZENMAP_INVALID_REPORT");
  const findings: SecurityFinding[] = p.hosts.map((h) => ({
    id: `zenmap:${h.ip}`,
    toolId: "zenmap",
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
    properties: { ports: h.ports ?? [] },
  }));
  return { findings };
}