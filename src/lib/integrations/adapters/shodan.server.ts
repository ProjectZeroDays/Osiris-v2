import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";

const BASE = "https://api.shodan.io";

export async function lookupVerifiedAsset(ip: string, ctx: AdapterContext) {
  const key = process.env.SHODAN_API_KEY;
  if (!key) throw new Error("SHODAN_NOT_CONFIGURED");

  const res = await fetch(`${BASE}/shodan/host/${encodeURIComponent(ip)}?key=${key}`, {
    signal: ctx.signal, cache: "no-store",
  });
  if (!res.ok) throw new Error("SHODAN_UPSTREAM_ERROR");
  const data = (await res.json()) as {
    ip_str?: string; ports?: number[]; hostnames?: string[];
    org?: string; last_update?: string;
  };

  const finding: SecurityFinding = {
    id: `shodan:${ip}`,
    toolId: "shodan",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: `https://www.shodan.io/host/${ip}`,
    observedAt: data.last_update ?? null,
    importedAt: new Date().toISOString(),
    severity: null,
    confidence: 0.8,
    status: "observed",
    evidenceHash: null,
    retentionUntil: null,
    properties: {
      ports: data.ports ?? [],
      hostnames: data.hostnames ?? [],
      org: data.org ?? null,
    },
  };
  return { raw: data, findings: [finding] };
}