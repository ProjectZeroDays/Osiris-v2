import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client.server";
import { findings } from "@/db/schema";
import { SECURITY_TOOL_CARDS, type SecurityToolId } from "@/config/security-tools";
import type { SecurityFinding } from "./types";

/**
 * The durable record of what the tools found.
 *
 * A finding that is returned and not stored is a finding that is lost:
 * it leaves no trace, it is not tenant-scoped, and it cannot be deleted
 * on the deadline it was given. So a finding is written where it can be
 * kept, counted, and pruned.
 *
 * Without a database there is nowhere durable to write, and the finding
 * is still returned — the caller is not left with nothing — but the
 * platform says plainly that it kept nothing.
 */

export interface PersistResult {
  /** True when the findings went to the durable store. */
  persisted: boolean;
  /** How many rows were written. */
  count: number;
  /** Why nothing was written, when nothing was. */
  reason?: string;
}

/** The deadline a tool's findings are kept until. */
export function retentionFor(tool: string, from = new Date()): Date | null {
  const card = SECURITY_TOOL_CARDS.find((c) => c.id === tool);
  if (!card || card.retentionDays <= 0) return null;
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + card.retentionDays);
  return d;
}

/**
 * Write findings to the store.
 *
 * The write is an upsert on the finding's id, so the same finding
 * recorded twice is one row: a tool that reports the same thing on
 * every run updates its row rather than filling the table with copies.
 */
export async function persistFindings(
  toolId: SecurityToolId,
  tenantId: string,
  list: SecurityFinding[],
): Promise<PersistResult> {
  if (!list || list.length === 0) {
    return { persisted: false, count: 0, reason: "NO_FINDINGS" };
  }

  const db = getDb();
  if (!db) {
    return {
      persisted: false,
      count: 0,
      reason: "NO_DATABASE_CONFIGURED",
    };
  }

  const retentionUntil = retentionFor(toolId);
  const rows = list.map((f) => ({
    id: f.id,
    tenantId: f.tenantId || tenantId,
    toolId: f.toolId,
    // A finding with no asset is a finding about something that is not
    // in the registry, and the column is nullable for that.
    assetId: f.assetId ?? null,
    sourceUrl: f.sourceUrl ?? null,
    observedAt: f.observedAt ? new Date(f.observedAt) : null,
    importedAt: new Date(f.importedAt),
    severity: f.severity ?? null,
    confidence: f.confidence ?? null,
    status: f.status,
    evidenceHash: f.evidenceHash ?? null,
    retentionUntil: f.retentionUntil
      ? new Date(f.retentionUntil)
      : retentionUntil,
    properties: f.properties ?? {},
  }));

  try {
    await db
      .insert(findings)
      .values(rows)
      .onConflictDoUpdate({
        target: findings.id,
        set: {
          observedAt: sql`excluded.observed_at`,
          importedAt: sql`excluded.imported_at`,
          severity: sql`excluded.severity`,
          confidence: sql`excluded.confidence`,
          status: sql`excluded.status`,
          evidenceHash: sql`excluded.evidence_hash`,
          properties: sql`excluded.properties`,
        },
      });
    return { persisted: true, count: rows.length };
  } catch (e) {
    // A write that fails must not lose the finding. The caller still has
    // it; the platform says it was not kept.
    return {
      persisted: false,
      count: 0,
      reason: e instanceof Error ? e.message : "FINDINGS_WRITE_FAILED",
    };
  }
}

/** The findings a tenant holds for a tool, newest first. */
export async function listFindings(
  tenantId: string,
  toolId?: SecurityToolId,
  limit = 100,
): Promise<SecurityFinding[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(findings)
    .where(
      toolId
        ? and(eq(findings.tenantId, tenantId), eq(findings.toolId, toolId))
        : eq(findings.tenantId, tenantId),
    )
    .limit(Math.min(Math.max(limit, 1), 1000));

  return rows.map((r) => ({
    id: r.id,
    toolId: r.toolId as SecurityToolId,
    assetId: r.assetId,
    tenantId: r.tenantId,
    sourceUrl: r.sourceUrl,
    observedAt: r.observedAt ? r.observedAt.toISOString() : null,
    importedAt: r.importedAt.toISOString(),
    severity: r.severity,
    confidence: r.confidence,
    status: r.status,
    evidenceHash: r.evidenceHash,
    retentionUntil: r.retentionUntil ? r.retentionUntil.toISOString() : null,
    properties: (r.properties ?? {}) as Record<string, unknown>,
  }));
}
