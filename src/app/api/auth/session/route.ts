import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who the caller is.
 *
 * The client asks this to know whether to show the sign-in prompt, and
 * the platform answers with the identity it derived — never with whatever
 * the client said about itself.
 */
export async function GET() {
  const auth = await getAuthContext();

  return NextResponse.json(
    {
      authenticated: auth.authenticated,
      ephemeral: auth.ephemeral,
      user: auth.authenticated
        ? {
            id: auth.actorId,
            email: auth.email ?? null,
            tenantId: auth.tenantId,
            tenantName: auth.tenantName ?? null,
            roles: auth.roles,
          }
        : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
