import "server-only";
import { and, isNotNull, lt } from "drizzle-orm";
import { SECURITY_TOOL_CARDS } from "@/config/security-tools";
import { getDb } from "@/db/client.server";
import { findings, audit } from "@/db/schema";

export function retentionDeadline(tool: string, from = new Date()): string | null {
  const card = SECURITY_TOOL_CARDS.find((c) => c.id === tool);
  if (!card || card.retentionDays <= 0) return null;
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + card.retentionDays);
  return d.toISOString();
}

/**
 * The deadline for a finding, given the tool that produced it.
 *
 * A tool with no retention window (the quarantined one) produces no finding
 * and so no deadline.
 */
export function findingRetention(tool: string, importedAt = new Date()): string | null {
  return retentionDeadline(tool, importedAt);
}

export interface PruneResult {
  findingsDeleted: number;
  auditDeleted: number;
  database: boolean;
}

/**
 * Delete findings whose retention deadline has passed.
 *
 * A finding kept past its deadline is a liability, not a record: the point
 * of the deadline is that the answer stops being there on the day it said it
 * would. Run from a cron or from the retention route.
 *
 * The audit trail is kept longer than the findings — it records that
 * something happened, not what it found — and is pruned on its own, longer
 * schedule.
 */
export async function pruneExpiredFindings(now = new Date()): Promise<PruneResult> {
  const db = getDb();
  if (!db) {
    // Nothing durable to prune. The in-memory audit is bounded by the
    // process lifetime, which is its own retention policy.
    return { findingsDeleted: 0, auditDeleted: 0, database: false };
  }

  const deletedFindings = await db
    .delete(findings)
    .where(and(isNotNull(findings.retentionUntil), lt(findings.retentionUntil, now)))
    .returning({ id: findings.id });

  // The audit is kept for a year: it says what was asked and what was
  // decided, which stays relevant long after the answer has expired.
  const auditCutoff = new Date(now);
  auditCutoff.setUTCFullYear(auditCutoff.getUTCFullYear() - 1);
  const deletedAudit = await db
    .delete(audit)
    .where(and(isNotNull(audit.at), lt(audit.at, auditCutoff)))
    .returning({ id: audit.id });

  return {
    findingsDeleted: deletedFindings.length,
    auditDeleted: deletedAudit.length,
    database: true,
  };
}
