import { NextResponse } from "next/server";
import { allHealth } from "@/lib/integrations/health.server";
import { isDatabaseConfigured } from "@/db/client.server";
import { SECURITY_TOOL_CARDS } from "@/config/security-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The health of every integration source, and the platform's own readiness.
 *
 * A source that has started failing says so here rather than to each caller
 * separately. `ok` is false when any source is down, so a load balancer can
 * act on it.
 *
 * This answers without a session on purpose. A probe cannot sign in, and a
 * health check that a load balancer cannot reach is a health check that
 * never fires. So the surface is deliberately public — and therefore the
 * same discipline `/api/health` follows: process-level facts only, with
 * nothing that was learned from an upstream. `lastError` is deliberately
 * absent. It holds whatever an upstream HTTP client put in `err.message`,
 * and the dispatcher serves a stripped form of the same string to a
 * caller it has already authenticated (see the `[tool]/[action]` route,
 * which splits at the first colon). Serving it here would give that text
 * to anyone who asks. An operator who wants it has the audit trail, which
 * records the full message against the tenant and actor that hit it.
 */
export async function GET() {
  const health = allHealth();
  const entries = Object.entries(health);
  const down = entries.filter(([, s]) => s.health === "down");
  const degraded = entries.filter(([, s]) => s.health === "degraded");

  return NextResponse.json(
    {
      ok: down.length === 0,
      service: "osiris-integrations",
      scope: "integrations",
      database: isDatabaseConfigured,
      tools: SECURITY_TOOL_CARDS.length,
      sources: Object.fromEntries(
        entries.map(([name, s]) => [
          name,
          {
            health: s.health,
            consecutiveFailures: s.consecutiveFailures,
            lastSuccessAt: s.lastSuccessAt,
            lastFailureAt: s.lastFailureAt,
            cooldownUntil: s.cooldownUntil,
          },
        ]),
      ),
      down: down.map(([name]) => name),
      degraded: degraded.map(([name]) => name),
      timestamp: new Date().toISOString(),
    },
    {
      status: down.length === 0 ? 200 : 503,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    },
  );
}
