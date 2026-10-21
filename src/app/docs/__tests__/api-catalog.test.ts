import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { API_GROUPS } from "../apiCatalog";

/**
 * The API catalog as a contract, not a courtesy.
 *
 * apiCatalog.ts claims to describe every public route under /api, and it
 * is the only machine-readable inventory the platform has — the docs page
 * renders straight from it. It also says it is "kept in sync by hand",
 * which is another way of saying it drifts, silently, until someone
 * notices in production.
 *
 * So the filesystem is the truth and the catalog is checked against it:
 * a route with no entry fails here, at the cost of one test, rather than
 * at the cost of a user finding an undocumented endpoint. Routes that
 * are deliberately not public are listed below with their reason —
 * an exemption that must be justified, not one that silently accumulates.
 */

const API_ROOT = join(process.cwd(), "src", "app", "api");

/** Every `route.ts` under src/app/api, as its URL path. */
function routePaths(dir = API_ROOT, prefix = "/api"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // `[tool]` and `[id]` are Next.js dynamic segments; the catalog
      // writes the same fact as `{tool}` and `{id}`.
      const segment = entry.startsWith("[") ? `{${entry.slice(1, -1)}}` : entry;
      out.push(...routePaths(full, `${prefix}/${segment}`));
    } else if (entry === "route.ts") {
      out.push(prefix);
    }
  }
  return out;
}

/**
 * Routes that are not part of the public API surface, with the reason
 * each one is exempt. Every entry here is a decision, and a new one
 * should be too.
 */
const NOT_PUBLIC: Record<string, string> = {
  "/api/auth/session": "Session probe for the app's own gate; answers only who the caller already is.",
  "/api/auth/setup": "First-run account creation; closed for good once an account exists.",
  "/api/auth/signin": "Sign-in for the app's own gate.",
  "/api/auth/signout": "Sign-out for the app's own gate.",
  "/api/integrations/{tool}/{action}": "Internal dispatcher for the security-tool windows; the public entry point is /api/integrations/tools.",
  "/api/integrations/retention": "Operator maintenance job, not a data feed.",
};

/** Catalog paths, with the duplicates a hand-kept list collects removed. */
const CATALOGUED = new Set(
  API_GROUPS.flatMap((g) => g.endpoints.map((e) => e.path)),
);

describe("the API catalog", () => {
  const routes = routePaths();

  it("finds the routes on disk", () => {
    // A sanity check on the walk itself: if this ever fails, the
    // comparisons below are comparing nothing to nothing.
    expect(routes.length).toBeGreaterThan(50);
    expect(routes).toContain("/api/health");
  });

  it("documents every public route", () => {
    const undocumented = routes
      .filter((r) => !CATALOGUED.has(r))
      .filter((r) => !(r in NOT_PUBLIC));
    expect(
      undocumented,
      "These routes exist but have no entry in src/app/docs/apiCatalog.ts. " +
        "Add one, or add the route to NOT_PUBLIC in this test with a reason.",
    ).toEqual([]);
  });

  it("claims no route that does not exist", () => {
    // The other direction matters more than it looks: a catalog that
    // documents a route nobody can call is a page that 404s on demand.
    const known = new Set(routes);
    const phantom = [...CATALOGUED].filter((p) => !known.has(p));
    expect(
      phantom,
      "These paths are in the catalog but have no route.ts on disk.",
    ).toEqual([]);
  });

  it("keeps its exemptions honest", () => {
    const known = new Set(routes);
    // An exemption for a route that no longer exists is not a decision
    // any more; it is clutter that hides the real ones.
    const stale = Object.keys(NOT_PUBLIC).filter((p) => !known.has(p));
    expect(stale, "These NOT_PUBLIC entries name routes that no longer exist.").toEqual([]);

    // And every exempted route must actually be exempt for a stated
    // reason, not merely absent from the catalog.
    const unexempted = Object.keys(NOT_PUBLIC).filter((p) => CATALOGUED.has(p));
    expect(
      unexempted,
      "These routes are in both the catalog and NOT_PUBLIC; pick one.",
    ).toEqual([]);
  });

  it("gives every endpoint a summary and a shape", () => {
    for (const group of API_GROUPS) {
      for (const ep of group.endpoints) {
        expect(ep.summary.trim().length, ep.path).toBeGreaterThan(0);
        expect(ep.returns.length, ep.path).toBeGreaterThan(0);
      }
    }
  });

  it("uses a stable, unique anchor for every endpoint", () => {
    const seen = new Set<string>();
    for (const group of API_GROUPS) {
      for (const ep of group.endpoints) {
        const id = `${Array.isArray(ep.method) ? ep.method[0] : ep.method}:${ep.path}`;
        expect(seen.has(id), `${id} appears more than once`).toBe(false);
        seen.add(id);
      }
    }
  });
});
