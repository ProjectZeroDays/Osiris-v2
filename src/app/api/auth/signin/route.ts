import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client.server";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password.server";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session.server";
import { recordAudit } from "@/lib/integrations/audit.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sign in.
 *
 * An email and a password, and a session cookie. The password is checked
 * against the stored hash; the session is a random token of which the
 * server keeps only the hash.
 *
 * A failure says the same thing whatever went wrong — a wrong email and a
 * wrong password are indistinguishable from the outside, because telling
 * them apart would say which addresses have accounts.
 */
export async function POST(req: Request) {
  if (!getDb()) {
    return NextResponse.json(
      { error: "SIGNIN_NOT_AVAILABLE", detail: "This deployment has no database, so there is nothing to sign in to." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const p = body as { email?: string; password?: string };
  const email = typeof p?.email === "string" ? p.email.trim().toLowerCase() : "";
  const password = typeof p?.password === "string" ? p.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Enter an email and a password." }, { status: 400 });
  }

  const db = getDb()!;
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.disabledAt)))
    .limit(1);

  // The same work is done whether the account exists or not, so the time
  // taken does not say which.
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok) {
    recordAudit({
      tenantId: "unknown",
      actorId: "unknown",
      tool: "auth.signin",
      capability: "signin",
      purpose: "sign-in attempt",
      decision: "deny",
      reason: "INVALID_CREDENTIALS",
    });
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const issued = await createSession(user.id, {
    userAgent: req.headers.get("user-agent"),
    ip: req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip"),
  });
  if (!issued) {
    return NextResponse.json({ error: "SESSION_NOT_CREATED" }, { status: 500 });
  }

  recordAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    tool: "auth.signin",
    capability: "signin",
    purpose: "sign-in",
    decision: "allow",
    resultId: issued.user.id,
  });

  const res = NextResponse.json({
    ok: true,
    user: {
      id: issued.user.id,
      email: issued.user.email,
      tenantId: issued.user.tenantId,
      tenantName: issued.user.tenantName,
      roles: issued.user.roles,
    },
  });

  res.cookies.set(SESSION_COOKIE, issued.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: issued.expiresAt,
  });

  return res;
}
