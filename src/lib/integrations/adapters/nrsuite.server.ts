import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";

/**
 * nrSuite — sanitized pcap flow summaries.
 *
 * A raw pcap is never imported. It is large, it holds everything that was
 * on the wire, and it does not belong in a database or in a browser. The
 * operator runs `nrsuite summarize` on their own host and uploads the JSON;
 * this adapter accepts only that.
 */

const MAX_FLOWS = 5_000;
const MAX_PROPERTY_LEN = 512;

/**
 * Strip control characters and cap the length.
 *
 * A decoded field can be arbitrary bytes read as text. It may carry a
 * control sequence, it may be enormous, and — read as an instruction by a
 * model — it may be someone else's words. So it is stripped, capped and
 * kept as data.
 */
export function sanitizeField(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const stripped = input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  return stripped.length ? stripped.slice(0, MAX_PROPERTY_LEN) : null;
}

export interface PcapSummary {
  capturedAt?: string;
  interface?: string;
  flows?: Array<{
    src: string; dst: string;
    srcPort?: number; dstPort?: number;
    proto?: string; bytes?: number; packets?: number;
    firstSeen?: string; lastSeen?: string;
    sni?: string; dns?: string;
  }>;
}

export async function importSummary(payload: unknown, ctx: AdapterContext) {
  const p = payload as PcapSummary;
  if (!p?.flows || !Array.isArray(p.flows)) throw new Error("NRSUITE_INVALID_SUMMARY");
  if (p.flows.length > MAX_FLOWS) throw new Error("NRSUITE_TOO_MANY_FLOWS");

  const findings: SecurityFinding[] = p.flows.slice(0, MAX_FLOWS).map((f, i) => ({
    id: `nrsuite:${f.src}:${f.dst}:${f.srcPort ?? 0}:${f.dstPort ?? 0}:${i}`,
    toolId: "nrsuite",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: f.firstSeen ?? null,
    importedAt: new Date().toISOString(),
    severity: null,
    confidence: 0.85,
    status: "observed",
    evidenceHash: null,
    retentionUntil: null,
    properties: {
      src: sanitizeField(f.src), dst: sanitizeField(f.dst),
      srcPort: f.srcPort ?? null, dstPort: f.dstPort ?? null,
      proto: sanitizeField(f.proto), bytes: f.bytes ?? null, packets: f.packets ?? null,
      sni: sanitizeField(f.sni), dns: sanitizeField(f.dns),
      lastSeen: f.lastSeen ?? null,
    },
  }));

  return {
    findings,
    meta: { capturedAt: p.capturedAt ?? null, iface: sanitizeField(p.interface) },
  };
}

export async function listFlows(payload: unknown, ctx: AdapterContext) {
  const { findings } = await importSummary(payload, ctx);
  const filter = (payload as { filter?: { proto?: string; port?: number } })?.filter ?? {};
  return {
    findings: findings.filter((f) => {
      const p = f.properties as Record<string, unknown>;
      if (filter.proto && p.proto !== filter.proto) return false;
      if (filter.port && p.dstPort !== filter.port && p.srcPort !== filter.port) return false;
      return true;
    }),
  };
}

export async function decodeMetadata(payload: unknown, _ctx: AdapterContext) {
  const p = payload as { summary?: PcapSummary };
  if (!p?.summary?.flows) throw new Error("NRSUITE_INVALID_SUMMARY");
  return {
    decoded: p.summary.flows.map((f) => ({
      src: sanitizeField(f.src), dst: sanitizeField(f.dst),
      proto: sanitizeField(f.proto), sni: sanitizeField(f.sni), dns: sanitizeField(f.dns),
    })),
  };
}

export async function exportSanitized(payload: unknown, _ctx: AdapterContext) {
  const p = payload as { findings?: SecurityFinding[] };
  if (!p?.findings) throw new Error("NRSUITE_INVALID_EXPORT");
  return { flows: p.findings.map((f) => f.properties) };
}
