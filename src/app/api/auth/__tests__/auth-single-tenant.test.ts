import { describe, it, expect, vi } from "vitest";

/**
 * The auth routes, on a deployment with no database.
 *
 * The database-backed suite skips when there is no `DATABASE_URL`, which
 * left the other half of the contract untested: a bare deployment runs
 * single-tenant, needs no setup and no sign-in, and answers every auth
 * route accordingly. These tests run the real routes against a client
 * that reports no database, because that is the deployment shape being
 * described.
 */

const { jar } = vi.hoisted(() => ({ jar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));

vi.mock("@/db/client.server", () => ({
  isDatabaseConfigured: false,
  getDb: () => null,
  requireDb: () => {
    throw new Error("DATABASE_URL_NOT_SET");
  },
  closeDb: async () => undefined,
}));

const post = (path: string, body: unknown) =>
  new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("the auth routes without a database", () => {
  it("says a bare deployment needs no setup and no sign-in", async () => {
    const { GET } = await import("../setup/route");
    const body = await (await GET()).json();
    expect(body.ok).toBe(true);
    expect(body.setupRequired).toBe(false);
    expect(body.signInRequired).toBe(false);
  });

  it("refuses the first-run route rather than inventing an account", async () => {
    const { POST } = await import("../setup/route");
    const res = await POST(
      post("/api/auth/setup", {
        email: "nobody@example.com",
        password: "correct-horse-battery",
      }),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("SETUP_NOT_AVAILABLE");
  });

  it("refuses the sign-in route rather than pretending an account exists", async () => {
    const { POST } = await import("../signin/route");
    const res = await POST(
      post("/api/auth/signin", {
        email: "nobody@example.com",
        password: "correct-horse-battery",
      }),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("SIGNIN_NOT_AVAILABLE");
  });

  it("names the single-tenant identity, and marks it ephemeral", async () => {
    const { GET } = await import("../session/route");
    const body = await (await GET()).json();
    expect(body.authenticated).toBe(true);
    // Ephemeral means: this identity came from the fallback, not from a
    // session. A caller that persists must refuse to write against it.
    expect(body.ephemeral).toBe(true);
    expect(body.user.tenantId).toBe("single-tenant");
    expect(body.user.roles).toContain("admin");
  });

  it("revokes nothing on sign-out, and says so", async () => {
    const { POST } = await import("../signout/route");
    const body = await (await POST()).json();
    expect(body.ok).toBe(true);
    expect(body.revoked).toBe(false);
  });

  it("treats a cookie that names nothing as no session at all", async () => {
    jar.set("osiris_session", "a-token-that-was-never-issued");
    const { GET } = await import("../session/route");
    // There is no database to resolve a token against, so the fallback
    // identity stands and the token is not mistaken for a session.
    const body = await (await GET()).json();
    expect(body.ephemeral).toBe(true);
    jar.delete("osiris_session");
  });
});
