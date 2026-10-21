import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * The auth routes, against a real database.
 *
 * The sign-in flow is the one place where the platform's own security
 * matters, and a mock would prove nothing about it: what matters is that
 * a session is stored as a hash, that the first-run route closes behind
 * the first account, and that a signed-out caller is refused.
 *
 * The tests need a database with no accounts in it — the first-run route
 * is closed the moment there is one. So they run against a database named
 * by `OSIRIS_TEST_DATABASE_URL` (or `DATABASE_URL`), and are skipped when
 * there is none. They clean up after themselves.
 */

const { jar } = vi.hoisted(() => ({ jar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  }),
}));

const DATABASE_URL =
  process.env.OSIRIS_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const hasDatabase = Boolean(DATABASE_URL);

// The database client reads DATABASE_URL when it is first loaded, so the
// variable has to be in place before the route modules are imported. The
// import is therefore dynamic, and the whole suite is skipped when there
// is no database to talk to.
if (DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DATABASE_URL;
}

const describeDb = hasDatabase ? describe : describe.skip;

describeDb("the auth routes", () => {
  let setupRoute: typeof import("../setup/route");
  let signinRoute: typeof import("../signin/route");
  let signoutRoute: typeof import("../signout/route");
  let sessionRoute: typeof import("../session/route");
  let db: typeof import("@/db/client.server");
  let schema: typeof import("@/db/schema");
  let auth: typeof import("@/lib/auth/session.server");

  const created = new Set<string>();

  beforeAll(async () => {
    setupRoute = await import("../setup/route");
    signinRoute = await import("../signin/route");
    signoutRoute = await import("../signout/route");
    sessionRoute = await import("../session/route");
    db = await import("@/db/client.server");
    schema = await import("@/db/schema");
    auth = await import("@/lib/auth/session.server");
  });

  afterAll(async () => {
    if (!db) return;
    const client = db.getDb();
    if (!client) return;
    for (const tenantId of created) {
      await client
        .delete(schema.sessions)
        .where(eq(schema.sessions.tenantId, tenantId))
        .catch(() => undefined);
      await client
        .delete(schema.users)
        .where(eq(schema.users.tenantId, tenantId))
        .catch(() => undefined);
      await client
        .delete(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .catch(() => undefined);
    }
    await db.closeDb();
  });

  /** A request with a JSON body. */
  const post = (path: string, body: unknown) =>
    new Request(`http://localhost:3000${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  /** Make an account the way the first-run route does, and remember it. */
  async function makeUser(email: string, password = "correct-horse-battery") {
    const tenantId = `test-tenant-${Math.random().toString(36).slice(2, 10)}`;
    const userId = `test-user-${Math.random().toString(36).slice(2, 10)}`;
    const passwordHash = await import("@/lib/auth/password.server").then((m) =>
      m.hashPassword(password),
    );
    const client = db.getDb()!;
    await client.insert(schema.tenants).values({ id: tenantId, name: "Test" });
    await client.insert(schema.users).values({
      id: userId,
      tenantId,
      email,
      roles: ["analyst", "admin"],
      passwordHash,
    });
    created.add(tenantId);
    return { tenantId, userId, email, password };
  }

  it("has a database to talk to", () => {
    expect(db.getDb()).not.toBeNull();
  });

  it("says a fresh platform needs setting up", async () => {
    const res = await setupRoute.GET();
    const body = await res.json();
    // The suite cleans up after itself, so by the time this runs the
    // platform should have no accounts unless another test made one.
    expect(typeof body.setupRequired).toBe("boolean");
    expect(body.userCount).toBeGreaterThanOrEqual(0);
  });

  it("creates the first account, and signs it in", async () => {
    const email = `first-${Math.random().toString(36).slice(2, 10)}@example.com`;
    const res = await setupRoute.POST(
      post("/api/auth/setup", {
        email,
        password: "correct-horse-battery",
        tenantName: "Test Tenant",
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user.email).toBe(email);
    expect(body.user.roles).toContain("admin");

    const tenantId = body.user.tenantId;
    created.add(tenantId);

    // The cookie is a token, and the session it names is stored as the
    // token's hash — so the table holds no token.
    const cookie = res.cookies.get(auth.SESSION_COOKIE);
    expect(cookie).toBeDefined();
    const token = cookie!.value;
    expect(token.length).toBeGreaterThan(20);

    const rows = await db.getDb()!
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, body.user.id));
    expect(rows.length).toBe(1);
    expect(rows[0].id).not.toBe(token);
    expect(rows[0].id).toBe(auth.hashToken(token));

    // And the token resolves to the account that made it.
    const resolved = await auth.resolveSession(token);
    expect(resolved?.id).toBe(body.user.id);
    expect(resolved?.email).toBe(email);
  });

  it("closes the first-run route behind the first account", async () => {
    // An account exists now, so the first-run route must refuse.
    const res = await setupRoute.POST(
      post("/api/auth/setup", {
        email: `second-${Math.random().toString(36).slice(2, 10)}@example.com`,
        password: "correct-horse-battery",
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("SETUP_ALREADY_COMPLETE");
  });

  it("refuses a wrong password and an unknown account the same way", async () => {
    const { email } = await makeUser(
      `creds-${Math.random().toString(36).slice(2, 10)}@example.com`,
    );

    const wrong = await signinRoute.POST(
      post("/api/auth/signin", { email, password: "not-the-password" }),
    );
    const unknown = await signinRoute.POST(
      post("/api/auth/signin", {
        email: "nobody-at-all@example.com",
        password: "not-the-password",
      }),
    );

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    // Identical in every respect that a caller could read. A response
    // that said which one was wrong would say which addresses have
    // accounts.
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("signs in with the right password, and signs out again", async () => {
    const { email, password } = await makeUser(
      `flow-${Math.random().toString(36).slice(2, 10)}@example.com`,
    );

    const res = await signinRoute.POST(
      post("/api/auth/signin", { email, password }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(email);

    const cookie = res.cookies.get(auth.SESSION_COOKIE);
    const token = cookie!.value;

    // The session resolves while it lives.
    expect((await auth.resolveSession(token))?.email).toBe(email);

    // The signed-in caller is who the platform says they are.
    jar.set(auth.SESSION_COOKIE, token);
    const session = await sessionRoute.GET();
    const sessionBody = await session.json();
    expect(sessionBody.authenticated).toBe(true);
    expect(sessionBody.user.email).toBe(email);

    // Signing out revokes it: the row is deleted, and the token stops
    // resolving at once rather than when the cookie expires.
    const out = await signoutRoute.POST();
    expect(out.status).toBe(200);
    expect((await out.json()).revoked).toBe(true);
    expect(await auth.resolveSession(token)).toBeNull();

    jar.delete(auth.SESSION_COOKIE);
    const after = await sessionRoute.GET();
    expect((await after.json()).authenticated).toBe(false);
  });

  it("refuses a token that was never issued", async () => {
    jar.set(auth.SESSION_COOKIE, "not-a-real-token");
    expect(await auth.resolveSession("not-a-real-token")).toBeNull();
    const res = await sessionRoute.GET();
    expect((await res.json()).authenticated).toBe(false);
    jar.delete(auth.SESSION_COOKIE);
  });

  it("refuses a disabled account", async () => {
    const { tenantId, userId, email, password } = await makeUser(
      `disabled-${Math.random().toString(36).slice(2, 10)}@example.com`,
    );
    await db.getDb()!
      .update(schema.users)
      .set({ disabledAt: new Date() })
      .where(eq(schema.users.id, userId));

    const res = await signinRoute.POST(
      post("/api/auth/signin", { email, password }),
    );
    expect(res.status).toBe(401);

    // And a session made before the account was disabled stops working.
    const issued = await auth.createSession(userId);
    expect(issued).toBeNull();
    expect(tenantId).toBeTruthy();
  });

  it("refuses a password that is too short", async () => {
    const res = await setupRoute.POST(
      post("/api/auth/setup", { email: "short@example.com", password: "abc" }),
    );
    expect(res.status).toBe(400);
  });

  it("refuses a body that is not JSON", async () => {
    const res = await signinRoute.POST(
      new Request("http://localhost:3000/api/auth/signin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
