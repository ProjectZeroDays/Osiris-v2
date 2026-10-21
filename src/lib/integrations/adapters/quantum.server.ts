import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";
import { z } from "zod";

/**
 * Quantum-CLI — Depth A.
 *
 * Quantum-CLI is an orchestration layer: it drives other tools. Its
 * exact surface is unverified, so OSIRIS does not talk to it. It stays
 * outside, running on the operator's own host, and its run reports are
 * imported as files. The seam for a future live connection is
 * deliberately left as a capability rather than written as code.
 */

const MAX_FINDINGS = 20_000;

const RunReportSchema = z.object({
  runId: z.string().min(1).max(128),
  startedAt: z.string().max(64).optional(),
  finishedAt: z.string().max(64).optional(),
  command: z.string().max(1024).optional(),
  status: z.string().max(64).optional(),
  findings: z.array(z.object({
    id: z.string().min(1).max(128).optional(),
    title: z.string().max(512).optional(),
    severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
    host: z.string().max(256).optional(),
    tool: z.string().max(64).optional(),
    summary: z.string().max(4096).optional(),
  })).max(MAX_FINDINGS).optional(),
  artifacts: z.array(z.object({
    name: z.string().max(256),
    path: z.string().max(512).optional(),
    sizeBytes: z.number().int().min(0).optional(),
  })).max(500).optional(),
});

const ReportsSchema = z.object({ reports: z.array(RunReportSchema).max(100) });

export interface QuantumRunReport {
  runId: string;
  startedAt?: string;
  finishedAt?: string;
  command?: string;
  status?: string;
  findings?: Array<{
    id?: string; title?: string; severity?: string;
    host?: string; tool?: string; summary?: string;
  }>;
  artifacts?: Array<{ name: string; path?: string; sizeBytes?: number }>;
}

export async function importRunReport(payload: unknown, ctx: AdapterContext) {
  const parsed = RunReportSchema.safeParse(payload);
  if (!parsed.success) throw new Error("QUANTUM_INVALID_REPORT");
  const r = parsed.data;

  const findings: SecurityFinding[] = (r.findings ?? []).slice(0, MAX_FINDINGS).map((f, i) => ({
    id: `quantum:${r.runId}:${f.id ?? i}`,
    toolId: "quantum-cli",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: r.startedAt ?? null,
    importedAt: new Date().toISOString(),
    severity: (f.severity as SecurityFinding["severity"]) ?? null,
    confidence: 0.6,
    // A finding from an orchestration run says what the run recorded. It
    // is inferred, not observed, and it is labelled that way.
    status: "inferred",
    evidenceHash: null,
    retentionUntil: null,
    properties: {
      kind: "security-finding",
      runId: r.runId,
      title: f.title ?? null,
      host: f.host ?? null,
      tool: f.tool ?? null,
      summary: f.summary ?? null,
    },
  }));

  return {
    findings,
    run: {
      runId: r.runId,
      startedAt: r.startedAt ?? null,
      finishedAt: r.finishedAt ?? null,
      status: r.status ?? null,
      artifacts: r.artifacts ?? [],
      findingCount: findings.length,
    },
  };
}

export async function listRuns(payload: unknown, ctx: AdapterContext) {
  const parsed = ReportsSchema.safeParse(payload);
  if (!parsed.success) throw new Error("QUANTUM_INVALID_REPORTS");

  const runs = [];
  for (const r of parsed.data.reports) {
    const one = await importRunReport(r, ctx);
    runs.push(one.run);
  }
  return { runs };
}

export async function exportFindings(payload: unknown, ctx: AdapterContext) {
  const p = payload as { report?: QuantumRunReport };
  if (!p?.report) throw new Error("QUANTUM_INVALID_EXPORT");

  const { findings } = await importRunReport(p.report, ctx);
  return {
    format: "osiris-quantum-findings",
    version: 1,
    exportedAt: new Date().toISOString(),
    runId: p.report.runId,
    findings: findings.map((f) => f.properties),
  };
}
