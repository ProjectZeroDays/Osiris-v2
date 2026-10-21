import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";

export async function checkSingle(handle: string, ctx: AdapterContext) {
  const url = process.env.SHERLOCK_URL ?? "https://sherlock-api.local";
  const res = await fetch(`${url}/check?username=${encodeURIComponent(handle)}`, {
    signal: ctx.signal, cache: "no-store",
  });
  if (!res.ok) throw new Error("SHERLOCK_UPSTREAM_ERROR");
  const data = (await res.json()) as { found?: Array<{ site: string; url: string }> };
  const finding: SecurityFinding = {
    id: `sherlock:${handle}`,
    toolId: "sherlock",
    assetId: null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: null,
    importedAt: new Date().toISOString(),
    severity: null,
    confidence: 0.5,
    status: "unverified",
    evidenceHash: null,
    retentionUntil: null,
    properties: { handle, matches: data.found ?? [] },
  };
  return { findings: [finding] };
}