import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeSession, SESSION_COOKIE } from "@/lib/auth/session.server";
import { getAuthContext } from "@/lib/auth/context.server";
import { recordAudit } from "@/lib/integrations/audit.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sign out.
 *
 * The session is revoked, not merely forgotten: the cookie is cleared and
 * the row it named is deleted, so a token that was copied out of a
 * browser stops working at once.
 */
export async function POST() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const auth = await getAuthContext();

  const revoked = await revokeSession(token);

  recordAudit({
    tenantId: auth.tenantId ?? "unknown",
    actorId: auth.actorId ?? "unknown",
    tool: "auth.signout",
    capability: "signout",
    purpose: "sign-out",
    decision: "allow",
  });

  const res = NextResponse.json({ ok: true, revoked });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
