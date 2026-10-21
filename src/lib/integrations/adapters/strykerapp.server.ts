import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";

/**
 * StrykerApp — mutation and coverage reports.
 *
 * JSON only. A Stryker HTML report carries its own JavaScript, and
 * running it would be running the report's code inside the platform, so
 * an HTML report is refused rather than sanitised into something that
 * still works.
 */

const MAX_MUTANTS = 20_000;
const MAX_FILES = 5_000;

export interface StrykerReport {
  schemaVersion?: string;
  thresholds?: { high?: number; low?: number; break?: number };
  files?: Record<string, {
    mutants?: Array<{ id: string; mutatorName?: string; status?: string; line?: number; column?: number }>;
  }>;
  mutationScore?: number;
  coverage?: { lines?: number; statements?: number; functions?: number; branches?: number };
}

export async function importMutationSummary(payload: unknown, ctx: AdapterContext) {
  const p = payload as StrykerReport;
  if (!p?.files || typeof p.files !== "object") throw new Error("STRYKER_INVALID_REPORT");

  const findings: SecurityFinding[] = [];
  let total = 0, killed = 0, survived = 0, fileCount = 0;

  for (const [file, entry] of Object.entries(p.files)) {
    if (fileCount++ >= MAX_FILES) break;
    const mutants = entry?.mutants ?? [];
    for (const m of mutants) {
      if (total >= MAX_MUTANTS) break;
      total++;
      if (m.status === "Killed" || m.status === "Timeout") killed++;
      else if (m.status === "Survived" || m.status === "NoCoverage") survived++;
    }
    findings.push({
      id: `strykerapp:file:${file}`,
      toolId: "strykerapp",
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
      properties: {
        file: file.slice(0, 512),
        mutants: mutants.length,
        killed: mutants.filter((m) => m.status === "Killed").length,
        survived: mutants.filter((m) => m.status === "Survived").length,
      },
    });
  }

  const score = p.mutationScore ?? (total ? killed / total : null);
  findings.unshift({
    id: "strykerapp:summary",
    toolId: "strykerapp",
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
    properties: {
      total, killed, survived,
      mutationScore: score,
      schemaVersion: p.schemaVersion ?? null,
      thresholds: p.thresholds ?? null,
    },
  });

  return { findings, summary: { total, killed, survived, mutationScore: score } };
}

export async function importCoverageSummary(payload: unknown, ctx: AdapterContext) {
  const p = payload as StrykerReport;
  if (!p?.coverage || typeof p.coverage !== "object") throw new Error("STRYKER_INVALID_REPORT");

  const finding: SecurityFinding = {
    id: "strykerapp:coverage",
    toolId: "strykerapp",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: null,
    importedAt: new Date().toISOString(),
    severity: null,
    confidence: 0.95,
    status: "observed",
    evidenceHash: null,
    retentionUntil: null,
    properties: {
      lines: p.coverage.lines ?? null,
      statements: p.coverage.statements ?? null,
      functions: p.coverage.functions ?? null,
      branches: p.coverage.branches ?? null,
    },
  };

  return { findings: [finding], coverage: p.coverage };
}

export async function listRuns(payload: unknown, ctx: AdapterContext) {
  const { findings, summary } = await importMutationSummary(payload, ctx);
  return {
    runs: [
      {
        id: "strykerapp:summary",
        importedAt: findings[0]?.importedAt ?? new Date().toISOString(),
        total: summary.total,
        killed: summary.killed,
        survived: summary.survived,
        mutationScore: summary.mutationScore,
      },
    ],
  };
}
