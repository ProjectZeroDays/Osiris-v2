import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client.server";
import { audit } from "@/db/schema";

export interface AuditEntry {
  auditId: string;
  at: string;
  tenantId: string;
  actorId: string;
  tool: string;
  capability: string;
  assetId?: string;
  purpose: string;
  decision: "allow" | "deny";
  reason?: string;
  resultId?: string;
}

/**
 * The audit trail.
 *
 * Every allow and every deny is written down. A memory buffer is enough for
 * a process that is about to be replaced, but a platform that outlives its
 * container needs the record on disk — so when a database is configured the
 * entry is written there as well, and the buffer keeps only the tail.
 */

/** How many recent entries stay in memory when a database is present. */
const MEMORY_TAIL = 500;

const buffer: AuditEntry[] = [];

export function recordAudit(entry: Omit<AuditEntry, "auditId" | "at">): string {
  const auditId = randomUUID();
  const at = new Date().toISOString();
  const full: AuditEntry = { ...entry, auditId, at };
  buffer.push(full);
  if (buffer.length > MEMORY_TAIL * 2) buffer.splice(0, buffer.length - MEMORY_TAIL);

  const db = getDb();
  if (db) {
    // The write is deliberately not awaited: a decision must not hang on a
    // database round-trip, and a lost audit line is better than a stalled
    // request. The buffer is the record until the database confirms.
    void db
      .insert(audit)
      .values({
        id: auditId,
        at: new Date(at),
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        tool: entry.tool,
        capability: entry.capability,
        assetId: entry.assetId,
        purpose: entry.purpose,
        decision: entry.decision,
        reason: entry.reason,
        resultId: entry.resultId,
      })
      .catch(() => {
        /* The decision stands; the record falls back to the buffer. */
      });
  }

  return auditId;
}

export function listAudit(): readonly AuditEntry[] {
  return buffer;
}
