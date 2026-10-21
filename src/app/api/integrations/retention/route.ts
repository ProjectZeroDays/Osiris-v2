import { NextResponse } from "next/server";
import { pruneExpiredFindings } from "@/lib/integrations/retention.server";
import { pruneMemoryQuotas } from "@/lib/integrations/quota.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Prune findings whose retention deadline has passed.
 *
 * Run from a cron (or on a schedule in the container) so the promise the
 * platform makes about a finding's lifetime is kept. Without a database
 * there is nothing durable to prune, and the route says so rather than
 * pretending it did work.
 */
export async function POST() {
  const result = await pruneExpiredFindings();
  const quotasPruned = pruneMemoryQuotas();

  return NextResponse.json(
    {
      ok: true,
      ...result,
      memoryQuotasPruned: quotasPruned,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
