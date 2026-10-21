import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";

/**
 * HaveIBeenFlocked — the public cross-reference.
 *
 * The only capabilities in the registry that reach an external service.
 * The host is allowlisted, the request is bounded, and a failure returns
 * the local record un-enriched rather than pretending the sighting does
 * not exist.
 */

const ALLOWED_HOSTS = ["haveibeenflocked.com", "www.haveibeenflocked.com"];
const LOOKUP_TIMEOUT_MS = 8_000;

export interface HibfRecord {
  mac: string;
  vendor?: string;
  deviceClass?: string;
  lat?: number;
  lon?: number;
  confidence?: number;
  observedAt?: string;
  sourceDevice?: string;
  hibfMatch?: { url?: string; reports?: number; firstSeen?: string; lastSeen?: string };
}

function allowed(url: string): boolean {
  try {
    return ALLOWED_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export async function lookupMac(payload: unknown, ctx: AdapterContext) {
  const p = payload as { mac?: string };
  if (!p?.mac) throw new Error("HIBF_INVALID_LOOKUP");

  const base = process.env.HIBF_API_URL;
  if (!base || !allowed(base)) {
    return {
      ok: false,
      reason: "HIBF_NOT_CONFIGURED",
      mac: p.mac,
      enrichment: null,
    };
  }

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/lookup?mac=${encodeURIComponent(p.mac)}`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HIBF_HTTP_${res.status}`);
    const data = (await res.json()) as { url?: string; reports?: number; firstSeen?: string; lastSeen?: string };
    return {
      ok: true,
      mac: p.mac,
      enrichment: {
        url: data.url ?? null,
        reports: data.reports ?? 0,
        firstSeen: data.firstSeen ?? null,
        lastSeen: data.lastSeen ?? null,
      },
    };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "HIBF_LOOKUP_FAILED",
      mac: p.mac,
      enrichment: null,
    };
  }
}

/**
 * Report a sighting.
 *
 * The report is recorded locally. Publishing it to the public service is
 * a separate, explicit act that the operator takes themselves, because a
 * published sighting tells a network where its cameras are.
 */
export async function reportSighting(payload: unknown, ctx: AdapterContext) {
  const p = payload as HibfRecord;
  if (!p?.mac) throw new Error("HIBF_INVALID_REPORT");

  const finding: SecurityFinding = {
    id: `hibf:${p.mac}`,
    toolId: "haveibeenflocked",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: p.observedAt ?? null,
    importedAt: new Date().toISOString(),
    severity: null,
    confidence: (p.confidence ?? 50) / 100,
    status: "observed",
    evidenceHash: null,
    retentionUntil: null,
    properties: {
      kind: "flock-camera",
      mac: p.mac,
      vendor: p.vendor ?? "Flock Safety",
      deviceClass: p.deviceClass ?? "alpr",
      lat: p.lat ?? null,
      lon: p.lon ?? null,
      confidence: p.confidence ?? null,
      attribution: "probable",
      hibfMatch: p.hibfMatch ?? null,
      sourceDevice: p.sourceDevice ?? null,
    },
  };

  return { findings: [finding], published: false };
}

export async function listReports(payload: unknown, ctx: AdapterContext) {
  const p = payload as { reports?: HibfRecord[] };
  const reports = p?.reports ?? [];
  const findings: SecurityFinding[] = reports.map((r) => ({
    id: `hibf:${r.mac}`,
    toolId: "haveibeenflocked",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: r.observedAt ?? null,
    importedAt: new Date().toISOString(),
    severity: null,
    confidence: (r.confidence ?? 50) / 100,
    status: "observed",
    evidenceHash: null,
    retentionUntil: null,
    properties: {
      kind: "flock-camera",
      mac: r.mac,
      vendor: r.vendor ?? "Flock Safety",
      deviceClass: r.deviceClass ?? "alpr",
      lat: r.lat ?? null,
      lon: r.lon ?? null,
      attribution: "probable",
      hibfMatch: r.hibfMatch ?? null,
    },
  }));
  return { reports: findings.map((f) => f.properties), count: findings.length };
}
