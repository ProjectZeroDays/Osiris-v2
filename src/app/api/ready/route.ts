import { NextResponse } from "next/server";
import { readiness } from "@/lib/integrations/readiness.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness: can this instance serve?
 *
 * `/api/health` is liveness — it says the process is up and checks
 * nothing else, because a probe that fans out on every call is a
 * self-inflicted outage under load. This is the other half: it says
 * whether the instance can actually take traffic.
 *
 * The difference matters. A platform whose database is unreachable, or
 * whose migrations were never applied, or that has no account anybody can
 * sign in as, is up and useless. A load balancer that only knows about
 * liveness will send it traffic, and the error arrives in front of a user
 * rather than in front of an operator.
 *
 * It answers without a session, for the same reason the health check
 * does: a probe cannot sign in, and a readiness check a probe cannot
 * reach is a readiness check that never fires. Nothing here is learned
 * from a third party, and nothing here is about a tenant — it is the
 * platform's own facts about itself.
 */
export async function GET() {
  const result = await readiness();

  return NextResponse.json(
    {
      ok: result.ready,
      ready: result.ready,
      service: "osiris",
      scope: "readiness",
      checks: result.checks,
      blockers: result.blockers,
      detail: result.ready
        ? "This instance can serve."
        : `This instance cannot serve yet: ${result.blockers.join(", ")}.`,
      at: result.at,
    },
    {
      // 503 while it is not ready: a load balancer reads the status, and
      // a body it has to parse is a body it might not read.
      status: result.ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
