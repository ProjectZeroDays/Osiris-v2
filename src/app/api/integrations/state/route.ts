import { NextResponse } from "next/server";
import { SECURITY_TOOL_CARDS } from "@/config/security-tools";
import { deriveIntegrationState } from "@/lib/integrations/state.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The server-derived integration state for every registered tool.
 *
 * The dashboard is a client component, so it cannot call the server-only
 * `deriveIntegrationState` directly. It asks for it here instead: the state
 * is still decided on the server, and the client only renders the answer.
 */
export async function GET() {
  const states: Record<string, string> = {};
  for (const card of SECURITY_TOOL_CARDS) {
    states[card.id] = deriveIntegrationState(card.id);
  }
  return NextResponse.json(
    { states },
    { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
