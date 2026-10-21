import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context.server";
import { readCosts } from "@/lib/integrations/quota.server";
import { costingCapabilities } from "@/lib/integrations/costs.server";
import { SECURITY_TOOL_CARDS, type SecurityToolId } from "@/config/security-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the day's calls have cost.
 *
 * A quota says how many calls a tenant may make. A cost says what those
 * calls cost, and the two are different: most of the platform is the
 * operator's own machine reading their own files, and a few capabilities
 * reach a service that meters.
 *
 * The unit is the provider's, not money. The platform knows how many
 * Shodan queries have been spent and how many tokens a model burned;
 * what either is worth is between the operator and their bill. So the
 * unit is named — a `shodan-query`, an `ai-token` — and the operator
 * reconciles it.
 *
 * There is deliberately no total across lines. The units are different
 * and adding them would be arithmetic on a category error: 900 tokens and
 * 3 queries are not 903 of anything, and a number that reads like one
 * would be believed. Each line carries its own unit and its own figure.
 *
 * It answers with a session, because a cost is a tenant's business. The
 * tenant is the caller's, taken from the session and never from the
 * request.
 */
export async function GET(req: Request) {
  const auth = await getAuthContext();
  if (!auth.authenticated || !auth.tenantId) {
    return NextResponse.json(
      { ok: false, errorCode: "INTEGRATION_UNAUTHENTICATED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(req.url);
  const day = url.searchParams.get("day") ?? undefined;

  const lines = await readCosts(auth.tenantId, day);

  // The capabilities that cost something, so a reader can see which of
  // the platform's calls are the ones that cost.
  const priced = SECURITY_TOOL_CARDS.flatMap((card) =>
    costingCapabilities(card.id as SecurityToolId).map((c) => ({
      tool: card.id,
      capability: c.capability,
      units: c.cost.units,
      unit: c.cost.unit,
    })),
  );

  return NextResponse.json(
    {
      ok: true,
      day: day ?? "today",
      tenantId: auth.tenantId,
      lines,
      priced,
      detail:
        lines.length === 0
          ? "Nothing has been spent today. Most of the platform's capabilities are free; the ones that are not are in `priced`."
          : `Spent today, by unit: ${lines
              .filter((l) => l.units > 0)
              .map((l) => `${l.units} ${l.unit} (${l.tool})`)
              .join(", ")}.`,
    },
    { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
