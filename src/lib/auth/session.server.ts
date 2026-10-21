import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db/client.server";
import { sessions, users, tenants } from "@/db/schema";

/**
 * The session.
 *
 * The browser holds a random token in a cookie. The server stores the
 * token's *hash*, so a read of the sessions table gives away nothing, and
 * revoking a session takes effect at once rather than when the cookie
 * happens to expire.
 *
 * The previous shape — the cookie naming the user id — was not a session.
 * Anyone who knew a user's id could act as that user, forever, and there
 * was no way to end it.
 */

export const SESSION_COOKIE = "osiris_session";

/** How long a session lasts without being used. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;      // 12 hours
/** How long a session lasts in total, used or not. */
const SESSION_ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days

export interface SessionUser {
  id: string;
  email: string;
  tenantId: string;
  tenantName: string;
  roles: string[];
}

/** The hash of a token. The token itself is never stored. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  user: SessionUser;
}

/**
 * Create a session for a user.
 *
 * The token is returned once, to be put in a cookie. Everything the
 * server keeps is its hash.
 */
export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<IssuedSession | null> {
  const db = getDb();
  if (!db) return null;

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      tenantId: users.tenantId,
      tenantName: tenants.name,
      roles: users.roles,
    })
    .from(users)
    .innerJoin(tenants, eq(users.tenantId, tenants.id))
    .where(and(eq(users.id, userId), isNull(users.disabledAt)))
    .limit(1);

  if (!user) return null;

  await db.insert(sessions).values({
    id: hashToken(token),
    userId: user.id,
    tenantId: user.tenantId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS),
    lastSeenAt: now,
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  });

  return {
    token,
    expiresAt,
    user: {
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      tenantName: user.tenantName,
      roles: user.roles ?? [],
    },
  };
}

/**
 * The user a token belongs to, or null.
 *
 * An expired session is not a session, and neither is one whose user has
 * been disabled since it was made.
 */
export async function resolveSession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const db = getDb();
  if (!db) return null;

  const now = new Date();
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      tenantId: users.tenantId,
      tenantName: tenants.name,
      roles: users.roles,
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(tenants, eq(sessions.tenantId, tenants.id))
    .where(
      and(
        eq(sessions.id, hashToken(token)),
        gt(sessions.expiresAt, now),
        isNull(users.disabledAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  // The last-seen time is what makes an idle timeout possible later.
  void db
    .update(sessions)
    .set({ lastSeenAt: now })
    .where(eq(sessions.id, row.sessionId))
    .catch(() => undefined);

  return {
    id: row.id,
    email: row.email,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    roles: row.roles ?? [],
  };
}

/** End a session. The cookie it was made from stops working at once. */
export async function revokeSession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const db = getDb();
  if (!db) return false;

  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.id, hashToken(token)))
    .returning({ id: sessions.id });

  return deleted.length > 0;
}

/** End every session a user holds. Used when a password changes. */
export async function revokeUserSessions(userId: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  return deleted.length;
}

/** Remove the sessions that have run out. */
export async function pruneSessions(now = new Date()): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const deleted = await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, now), isNull(sessions.expiresAt)))
    .returning({ id: sessions.id });
  return deleted.length;
}

/** How many users the platform has. The first-run check reads this. */
export async function countUsers(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const rows = await db.select({ id: users.id }).from(users);
  return rows.length;
}
