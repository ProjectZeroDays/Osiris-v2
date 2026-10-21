import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The registry gate.
 *
 * The route is open by default because two native clients read it and
 * neither could authenticate before it existed. A deployment may still
 * not want its capability surface answered for anyone who asks, so the
 * same route can be closed behind a session with an environment flag.
 *
 * The gate's behaviour depends on whether a database is configured, and
 * that is the whole point: a bare deployment has no sign-in, so its
 * single-tenant identity is the only one there is, and closing the
 * registry would lock out the operator with no way back in. A database
 * deployment has sessions, so it can refuse a caller who has none.
 *
 * These tests drive the real route and the real `getAuthContext`, with
 * only the two things a unit test cannot otherwise reach stood in: the
 * cookie jar, and whether a database is present.
 */

const { jar, db } = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  // What `getDb()` answers. `null` is a bare deployment. A stub is a
  // database deployment whose session lookup returns no row unless a
  // test puts one there.
  db: {
    hasDatabase: false,
    sessionRow: null as null | Record<string, unknown>,
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  }),
}));

vi.mock("@/db/client.server", () => {
  // The shape `resolveSession` walks: select().from().innerJoin()…
  // .where().limit(1). It answers with either no row or the row a test
  // planted, which is exactly the difference between "not signed in"
  // and "signed in as this user".
  const query = () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: async () => (db.sessionRow ? [db.sessionRow] : []),
            }),
          }),
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  });
  return { getDb: () => (db.hasDatabase ? query() : null) };
});

// `server-only` throws outside a React Server Component graph; the
// vitest config aliases it to a no-op, so the real auth modules load.
const { GET } = await import("../route");
const { SESSION_COOKIE } = await import("@/lib/auth/session.server");

const FLAG = "OSIRIS_REGISTRY_REQUIRE_AUTH";
const original = process.env[FLAG];

beforeEach(() => {
  jar.clear();
  db.hasDatabase = false;
  db.sessionRow = null;
});

afterEach(() => {
  if (original === undefined) delete process.env[FLAG];
  else process.env[FLAG] = original;
});

/** Turn the gate on or off the way a deployment would. */
const gate = (on: boolean) => {
  if (on) process.env[FLAG] = "1";
  else delete process.env[FLAG];
};

describe("the tool registry route", () => {
  it("answers with every tool, its capabilities and its risk class", async () => {
    gate(false);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(25);
    expect(body.tools).toHaveLength(25);
    expect(body.categories).toContain("active-transmit");

    const shodan = body.tools.find((t: { id: string }) => t.id === "shodan");
    expect(shodan.name).toBeTruthy();
    expect(shodan.riskClass).toBeTruthy();
    expect(Array.isArray(shodan.capabilities)).toBe(true);
  });

  it("never carries a credential in the listing", async () => {
    gate(false);
    const body = await (await GET()).json();
    const text = JSON.stringify(body);
    // The registry says whether a tool is configured, never how to reach
    // it. A key leaking here would be a key leaking to anyone who asked.
    expect(text).not.toMatch(/API_KEY|apiKey|secret|password|token/i);
  });

  it("is open by default, so a deployment that has not decided stays working", async () => {
    // The default is the absence of the flag. The test says so itself
    // rather than assuming the ambient environment has it unset — a
    // caller may legitimately export it to check the other shape.
    delete process.env[FLAG];
    expect(process.env[FLAG]).toBeUndefined();
    expect((await GET()).status).toBe(200);
  });

  it("is still open when the flag is set to anything the gate does not recognise", async () => {
    for (const value of ["", "0", "false", "no", "off", "banana"]) {
      process.env[FLAG] = value;
      expect((await GET()).status, `flag=${JSON.stringify(value)}`).toBe(200);
    }
  });
});

describe("the tool registry, once a database deployment has closed it", () => {
  beforeEach(() => {
    db.hasDatabase = true;
    gate(true);
  });

  it("refuses a caller with no session", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("REGISTRY_UNAUTHENTICATED");
    // A refusal must not carry the thing it refused to give.
    expect(body.tools).toBeUndefined();
  });

  it("refuses a cookie that resolves to no session, rather than guessing", async () => {
    jar.set(SESSION_COOKIE, "a-token-that-never-existed");
    expect((await GET()).status).toBe(401);
  });

  it("lets in a caller whose session resolves", async () => {
    db.sessionRow = {
      id: "user-1",
      email: "analyst@example.com",
      tenantId: "tenant-1",
      tenantName: "Example",
      roles: ["analyst"],
      sessionId: "session-1",
      expiresAt: new Date(Date.now() + 60_000),
    };
    jar.set(SESSION_COOKIE, "the-token-that-hashes-to-session-1");
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).total).toBe(25);
  });

  it("tells a refused client that a session is what is missing", async () => {
    const body = await (await GET()).json();
    expect(body.detail).toMatch(/session/i);
  });
});

describe("the tool registry, once a bare deployment has closed it", () => {
  it("still answers, because a bare deployment has no sign-in to demand", async () => {
    // No DATABASE_URL: `getAuthContext` falls back to the single-tenant
    // identity, which is authenticated. Closing the registry here would
    // refuse the only operator there is, with no way for them to sign in.
    db.hasDatabase = false;
    gate(true);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).total).toBe(25);
  });
});
