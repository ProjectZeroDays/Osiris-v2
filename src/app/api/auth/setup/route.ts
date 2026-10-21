import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client.server";
import { tenants, users } from "@/db/schema";
import { hashPassword, passwordStrength, MAX_PASSWORD_LENGTH } from "@/lib/auth/password.server";
import { countUsers, createSession, SESSION_COOKIE } from "@/lib/auth/session.server";
import { getAuthContext } from "@/lib/auth/context.server";
import { recordAudit } from "@/lib/integrations/audit.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The first-run setup.
 *
 * A deployment with a database and no accounts has no way in: the platform
 * demands a session, and there is nobody to make one for. This is the way
 * in, and it is open only while the platform has no users at all — once
 * there is one account, this route is closed for good.
 *
 * The check and the insert are in one transaction, so two requests racing
 * at the first run cannot both create an administrator.
 */
export async function GET() {
  if (!getDb()) {
    return NextResponse.json(
      {
        ok: true,
        setupRequired: false,
        signInRequired: false,
        detail: "This deployment has no database, so it runs single-tenant and needs no setup.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const count = await countUsers();
  const auth = await getAuthContext();

  return NextResponse.json(
    {
      ok: true,
      setupRequired: count === 0,
      // There are accounts, and this caller is not one of them.
      signInRequired: count > 0 && !auth.authenticated,
      authenticated: auth.authenticated,
      userCount: count,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "SETUP_NOT_AVAILABLE", detail: "This deployment has no database." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const p = body as {
    email?: string;
    password?: string;
    tenantName?: string;
  };

  const email = typeof p?.email === "string" ? p.email.trim().toLowerCase() : "";
  const password = typeof p?.password === "string" ? p.password : "";
  const tenantName =
    (typeof p?.tenantName === "string" && p.tenantName.trim()) || "Primary";

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: "Choose a password." }, { status: 400 });
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: "That password is too long." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      {
        error: "A password must be at least 8 characters.",
        strength: passwordStrength(password),
      },
      { status: 400 },
    );
  }

  // The route is open only while the platform has no users. This is the
  // check that matters, and it is the one that must not be skipped.
  const existing = await countUsers();
  if (existing > 0) {
    return NextResponse.json(
      { error: "SETUP_ALREADY_COMPLETE" },
      { status: 403 },
    );
  }

  const passwordHash = await hashPassword(password);
  const tenantId = randomUUID();
  const userId = randomUUID();

  try {
    await db.transaction(async (tx) => {
      // Re-check inside the transaction: two requests arriving together
      // must not both decide they are the first.
      const rows = await tx.select({ id: users.id }).from(users).limit(1);
      if (rows.length > 0) {
        throw new Error("SETUP_ALREADY_COMPLETE");
      }
      await tx.insert(tenants).values({ id: tenantId, name: tenantName });
      await tx.insert(users).values({
        id: userId,
        tenantId,
        email,
        roles: ["analyst", "admin"],
        passwordHash,
      });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "SETUP_FAILED";
    if (message === "SETUP_ALREADY_COMPLETE") {
      return NextResponse.json({ error: "SETUP_ALREADY_COMPLETE" }, { status: 403 });
    }
    return NextResponse.json({ error: "SETUP_FAILED", detail: message }, { status: 500 });
  }

  const issued = await createSession(userId, {
    userAgent: req.headers.get("user-agent"),
    ip: req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip"),
  });

  recordAudit({
    tenantId,
    actorId: userId,
    tool: "auth.setup",
    capability: "first-run",
    purpose: "first-run setup",
    decision: "allow",
    resultId: userId,
  });

  const res = NextResponse.json({
    ok: true,
    user: issued
      ? {
          id: issued.user.id,
          email: issued.user.email,
          tenantId: issued.user.tenantId,
          tenantName: issued.user.tenantName,
          roles: issued.user.roles,
        }
      : null,
  });

  if (issued) {
    res.cookies.set(SESSION_COOKIE, issued.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: issued.expiresAt,
    });
  }

  return res;
}
