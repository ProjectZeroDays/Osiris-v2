import { NextResponse } from "next/server";
import { SECURITY_TOOL_CARDS, RISK_CLASS_NOTES, type IntegrationCard } from "@/config/security-tools";
import { SAFE_CAPABILITIES } from "@/lib/integrations/capabilities.server";
import { deriveIntegrationState } from "@/lib/integrations/state.server";
import { TOOL_WINDOW_META } from "@/components/tools/window-meta";
import { getAuthContext } from "@/lib/auth/context.server";
import { registryRequiresAuth } from "@/lib/integrations/registry-gate";
import { consumeQuota, DEFAULT_DAILY_QUOTA } from "@/lib/integrations/quota.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The tool registry, for a client that is not this platform.
 *
 * The native apps — the Android build and the Windows desktop build —
 * read the registry from here rather than keeping their own copy of it.
 * One manifest means one place to change what a tool is called, what it
 * may do, and how long its findings are kept, and the native apps get
 * the same deny-by-default allowlist the web platform enforces.
 *
 * The capabilities are listed so a client knows what it may offer. They
 * are not a grant: the dispatcher checks them again on every request, so
 * a client that offers a capability the platform does not allow is
 * refused, not obeyed.
 *
 * By default this route is open, because the two native clients read it
 * and neither could authenticate before it existed. It is still a map of
 * the platform's capability surface — tool ids, risk classes, upstreams —
 * and a deployment may not want that answered for anyone who asks.
 * Setting `OSIRIS_REGISTRY_REQUIRE_AUTH` closes it behind the same
 * session the dispatcher already demands, so a deployment that wants it
 * closed can have it closed without forking the route.
 */
export async function GET() {
  if (registryRequiresAuth()) {
    const auth = await getAuthContext();
    if (!auth.authenticated) {
      return NextResponse.json(
        {
          error: "REGISTRY_UNAUTHENTICATED",
          detail: "The tool registry requires a session on this deployment.",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  // Quota gate before registry assembly (dispatcher analog)
  const auth = await getAuthContext();
  const quota = await consumeQuota(
    auth.tenantId || "platform:shared",
    "registry",
    DEFAULT_DAILY_QUOTA,
  );
  if (!quota.allowed) {
    return NextResponse.json({ error: "QUOTA_EXCEEDED" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  const tools = SECURITY_TOOL_CARDS.map((raw) => {
    const card = raw as IntegrationCard;
    const state = deriveIntegrationState(card.id);
    const meta = TOOL_WINDOW_META[card.id];
    return {
      id: card.id,
      name: card.name,
      purpose: card.purpose,
      href: card.href,
      state,
      riskClass: card.riskClass,
      riskNote: RISK_CLASS_NOTES[card.riskClass],
      retentionDays: card.retentionDays,
      requiresAsset: card.requiresAsset,
      requiresConsent: card.requiresConsent,
      upstream: card.upstream ?? null,
      capabilities: SAFE_CAPABILITIES[card.id] ?? [],
      tabs: meta?.tabs ?? [],
    };
  });

  return NextResponse.json(
    {
      tools,
      total: tools.length,
      categories: [...new Set(tools.map((t) => t.riskClass))].sort(),
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
