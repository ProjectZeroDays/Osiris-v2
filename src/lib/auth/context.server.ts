import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/db/client.server";
import { resolveSession, SESSION_COOKIE, type SessionUser } from "./session.server";

export interface AuthContext {
  authenticated: boolean;
  tenantId: string | null;
  actorId: string | null;
  roles: string[];
  /** True when the context came from the single-tenant fallback, not a session. */
  ephemeral: boolean;
  email?: string | null;
  tenantName?: string | null;
}

/**
 * The single-tenant fallback identity.
 *
 * A deployment with no database and no session still has to answer an
 * authorization question. Rather than failing every request, the platform
 * falls back to one well-known tenant whose rows live only in memory. It is
 * marked `ephemeral` so callers that persist can refuse to write against
 * it.
 */
const SINGLE_TENANT: AuthContext = {
  authenticated: true,
  tenantId: "single-tenant",
  actorId: "local-operator",
  roles: ["analyst", "admin"],
  ephemeral: true,
  email: "local-operator@localhost",
  tenantName: "Local",
};

const UNAUTHENTICATED: AuthContext = {
  authenticated: false,
  tenantId: null,
  actorId: null,
  roles: [],
  // Not ephemeral. Ephemeral means the single-tenant fallback — a
  // deployment with no database, which needs no sign-in. An
  // unauthenticated caller on a deployment that *does* have a database is
  // being refused, and must not be mistaken for the fallback.
  ephemeral: false,
};

/**
 * The caller's identity.
 *
 * The session cookie names a random token; the server keeps only its
 * hash. The tenant comes from the session record, never from the request,
 * so a client cannot ask to act as another tenant by sending a different
 * id.
 */
export async function getAuthContext(): Promise<AuthContext> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    const user = await resolveSession(token);
    if (user) return contextFromUser(user, false);
    // A token that does not resolve is not a session. With a database it
    // means the caller is not signed in, and saying so is the answer.
    if (getDb()) return UNAUTHENTICATED;
  }

  // No session. A database deployment demands one; a bare deployment
  // (no DATABASE_URL) falls back to the single-tenant identity.
  if (!getDb()) return SINGLE_TENANT;
  return UNAUTHENTICATED;
}

function contextFromUser(user: SessionUser, ephemeral: boolean): AuthContext {
  return {
    authenticated: true,
    tenantId: user.tenantId,
    actorId: user.id,
    roles: user.roles,
    email: user.email,
    tenantName: user.tenantName,
    ephemeral,
  };
}

export function hasRole(ctx: AuthContext, role: string): boolean {
  return ctx.roles.includes(role) || ctx.roles.includes("admin");
}
