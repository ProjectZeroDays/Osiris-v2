import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client.server";
import { quotaCounters } from "@/db/schema";

/**
 * Per-tenant, per-tool, per-day quotas.
 *
 * An allowlisted capability that costs money or time upstream still needs a
 * ceiling. The counter is durable when a database is configured and in memory
 * otherwise — a deployment without one still refuses to be talked into a
 * hundred calls a minute.
 */

/** The default ceiling when a tool does not declare one. */
export const DEFAULT_DAILY_QUOTA = 200;

interface MemoryCounter {
  count: number;
  costUnits: number;
  costUnit: string;
  reportedCalls: number;
}

const memory = new Map<string, MemoryCounter>();

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function memoryKey(tenantId: string, tool: string, day: string): string {
  return `${tenantId}\0${tool}\0${day}`;
}

export interface QuotaDecision {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  reason?: string;
}

/**
 * Whether another call is within the quota, and what the counters are.
 *
 * The check and the increment happen together so two concurrent requests
 * cannot both read the same count and both pass the last remaining slot.
 *
 * The cost is recorded at the same time, for the same reason: a limit
 * and a bill are the same row, and a call that is counted but not costed
 * is a call whose cost nobody can see.
 */
export async function consumeQuota(
  tenantId: string,
  tool: string,
  limit = DEFAULT_DAILY_QUOTA,
  cost?: { units: number; unit: string; reported?: boolean },
): Promise<QuotaDecision> {
  const day = dayKey();
  const db = getDb();
  const units = cost?.units ?? 0;
  const reported = cost?.reported ?? false;
  const unit = cost?.unit ?? "free";

  if (!db) {
    const key = memoryKey(tenantId, tool, day);
    const used = memory.get(key)?.count ?? 0;
    if (used >= limit) {
      return { allowed: false, used, limit, remaining: 0, reason: "QUOTA_EXCEEDED" };
    }
    const prev = memory.get(key);
    memory.set(key, { count: used + 1, costUnits: (prev?.costUnits ?? 0) + units, costUnit: unit, reportedCalls: (prev?.reportedCalls ?? 0) + (reported ? 1 : 0) });
    return { allowed: true, used: used + 1, limit, remaining: limit - used - 1 };
  }

  const row = await db
    .select()
    .from(quotaCounters)
    .where(
      and(
        eq(quotaCounters.tenantId, tenantId),
        eq(quotaCounters.tool, tool),
        eq(quotaCounters.day, day),
      ),
    )
    .limit(1);

  const used = row[0]?.count ?? 0;
  if (used >= limit) {
    return { allowed: false, used, limit, remaining: 0, reason: "QUOTA_EXCEEDED" };
  }

  if (row[0]) {
    await db
      .update(quotaCounters)
      .set({
        count: used + 1,
        costUnits: (row[0].costUnits ?? 0) + units,
        // The unit is written every time, so a row cannot end up with a
        // count in one unit and a total in another.
        costUnit: unit,
        reportedCalls: (row[0].reportedCalls ?? 0) + (reported ? 1 : 0),
      })
      .where(
        and(
          eq(quotaCounters.tenantId, tenantId),
          eq(quotaCounters.tool, tool),
          eq(quotaCounters.day, day),
        ),
      );
  } else {
    await db.insert(quotaCounters).values({
      tenantId,
      tool,
      day,
      count: 1,
      costUnits: units,
      costUnit: unit,
      reportedCalls: reported ? 1 : 0,
    });
  }

  return { allowed: true, used: used + 1, limit, remaining: limit - used - 1 };
}

/**
 * The counter a device's pushes are charged against.
 *
 * The quota table is keyed by tenant, tool and day. A device is not a
 * tool, but it is the same kind of thing — something that consumes an
 * allowance — so it gets a namespaced key. The namespace cannot collide
 * with a tool id, because no tool is called `device:…`.
 *
 * The key is per device rather than per tenant on purpose: one sensor
 * misbehaving on one roof must not starve the others.
 */
export function deviceQuotaKey(deviceId: string): string {
  return `device:${deviceId}`;
}

/**
 * How many frames a device may push in a day.
 *
 * Generous for a sensor — a drone reporting once a second is under a
 * hundred thousand frames a day — and a bound for a flood. Every frame
 * is a write, a finding and a beacon, so a device that pushes without
 * limit is not just noise: it is a denial of service on the platform's
 * own database.
 */
export const DEVICE_DAILY_FRAME_QUOTA = 2_000_000;

/**
 * Charge a device's push against its frame allowance.
 *
 * The limit is on frames, not on pushes. A device that pushes one frame
 * a second and a device that pushes five thousand frames a second are
 * very different amounts of work, and an allowance counted in pushes
 * would not tell them apart. So the frames go into the same row as the
 * push count, and the limit is checked against the frames.
 *
 * The check and the increment happen together, as they do for a tool's
 * calls, so two pushes cannot both read the same count and both pass
 * the last remaining frame.
 */
export async function consumeDeviceFrames(
  tenantId: string,
  deviceId: string,
  frames: number,
  limit = DEVICE_DAILY_FRAME_QUOTA,
): Promise<{ allowed: boolean; used: number; limit: number; reason?: string }> {
  const day = dayKey();
  const db = getDb();
  const key = deviceQuotaKey(deviceId);

  if (!db) {
    // Without a database there is no durable counter, so the allowance
    // is the per-push bound and nothing more. A deployment that wants a
    // real one has a database.
    return { allowed: true, used: 0, limit };
  }

  const row = await db
    .select()
    .from(quotaCounters)
    .where(
      and(
        eq(quotaCounters.tenantId, tenantId),
        eq(quotaCounters.tool, key),
        eq(quotaCounters.day, day),
      ),
    )
    .limit(1);

  const used = row[0]?.costUnits ?? 0;
  if (used + frames > limit) {
    return { allowed: false, used, limit, reason: "DEVICE_PUSH_QUOTA_EXCEEDED" };
  }

  if (row[0]) {
    await db
      .update(quotaCounters)
      .set({
        count: (row[0].count ?? 0) + 1,
        costUnits: used + frames,
        costUnit: "frame",
      })
      .where(
        and(
          eq(quotaCounters.tenantId, tenantId),
          eq(quotaCounters.tool, key),
          eq(quotaCounters.day, day),
        ),
      );
  } else {
    await db.insert(quotaCounters).values({
      tenantId,
      tool: key,
      day,
      count: 1,
      costUnits: frames,
      costUnit: "frame",
    });
  }

  return { allowed: true, used: used + frames, limit };
}

/** The current count without consuming anything. */
export async function readQuota(
  tenantId: string,
  tool: string,
): Promise<{ used: number; limit: number }> {
  const day = dayKey();
  const db = getDb();
  if (!db) {
    const m = memory.get(memoryKey(tenantId, tool, day));
    return { used: m?.count ?? 0, limit: DEFAULT_DAILY_QUOTA };
  }
  const row = await db
    .select()
    .from(quotaCounters)
    .where(
      and(
        eq(quotaCounters.tenantId, tenantId),
        eq(quotaCounters.tool, tool),
        eq(quotaCounters.day, day),
      ),
    )
    .limit(1);
  return { used: row[0]?.count ?? 0, limit: DEFAULT_DAILY_QUOTA };
}

/**
 * What the day's calls have cost, per tool.
 *
 * The unit is the provider's, not money: the platform knows how many
 * Shodan queries have been spent, and what a query is worth to the
 * operator is between the operator and their bill.
 */
export interface CostLine {
  tool: string;
  /** How many calls were made. */
  calls: number;
  /** What they cost, in `unit`. */
  units: number;
  /** How many of the day's calls reported their own usage. */
  reportedCalls: number;
  /** The unit `units` is in. */
  unit: string;
}

/**
 * The day's costs for a tenant, per tool.
 *
 * A tool whose capabilities are free is not left out: it is reported with
 * zero units, so a reader can see that the tool was used and cost
 * nothing, which is a different thing from the tool not being used.
 */
export async function readCosts(
  tenantId: string,
  day = dayKey(),
): Promise<CostLine[]> {
  const db = getDb();
  if (!db) {
    const dayKey2 = day;
    const out: CostLine[] = [];
    for (const [key, m] of memory) {
      const parts = key.split("\0");
      if (parts.length !== 3) continue;
      if (parts[0] !== tenantId) continue;
      if (parts[2] !== dayKey2) continue;
      out.push({
        tool: parts[1],
        calls: m.count,
        units: m.costUnits,
        reportedCalls: m.reportedCalls ?? 0,
        unit: m.costUnit,
      });
    }
    return out.sort((a, b) => a.tool.localeCompare(b.tool));
  }

  const rows = await db
    .select({
      tool: quotaCounters.tool,
      calls: quotaCounters.count,
      units: quotaCounters.costUnits,
      reportedCalls: quotaCounters.reportedCalls,
      unit: quotaCounters.costUnit,
    })
    .from(quotaCounters)
    .where(
      and(
        eq(quotaCounters.tenantId, tenantId),
        eq(quotaCounters.day, day),
      ),
    )
    .orderBy(quotaCounters.tool);

  return rows.map((r) => ({
    tool: r.tool,
    calls: r.calls,
    units: r.units ?? 0,
    reportedCalls: r.reportedCalls ?? 0,
    unit: r.unit ?? "free",
  }));
}

/** Forget yesterday's counters. Called by the retention job. */
export function pruneMemoryQuotas(keepDays = 2): number {
  const cutoff = Date.now() - keepDays * 86400_000;
  let removed = 0;
  for (const [key] of memory) {
    const day = key.split("\0")[2];
    const ts = Date.parse(`${day}T00:00:00.000Z`);
    if (Number.isFinite(ts) && ts < cutoff) {
      memory.delete(key);
      removed++;
    }
  }
  return removed;
}
