import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The metered upstreams, and where their spending is recorded.
 *
 * The platform reaches a handful of services that meter what the
 * operator sends them: a model provider, an AI provider, an aircraft
 * feed and a search API. Each of those spends real money, and the cost
 * ledger exists so the operator can see it.
 *
 * A new metered upstream that is not recorded is a silent drain on the
 * operator's account. So the list of metered services lives here, and
 * this test holds each one's route to the fact that it records what it
 * spends. Adding an upstream means adding it here, and the test fails
 * until the route records it.
 *
 * The list is deliberately short and specific. Most of the platform's
 * upstreams are free and keyless - Wikipedia, Shodan's InternetDB, the
 * adsb.fi feeds, celestrak - and recording a cost against those would
 * be inventing a unit, which the platform's rules forbid.
 */

const ROOT = process.cwd();

/** A route file, relative to the repository root. */
function routeFiles(dir = join(ROOT, "src", "app", "api")): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

interface MeteredUpstream {
  /** The service, as the operator would name it. */
  service: string;
  /** The route that reaches it, relative to the repository root. */
  route: string;
  /** The function that records what the call spent. */
  records: string;
  /** The unit the call is recorded in. */
  unit: string;
}

/**
 * Every upstream that meters what the operator sends it.
 *
 * This is the list a new metered upstream has to join. It is checked
 * against the code below: each entry's route must call the recorder it
 * names, and the recorder must write the unit it names.
 */
const METERED_UPSTREAMS: MeteredUpstream[] = [
  {
    service: "OpenRouter (chat completions)",
    route: "src/app/api/ai/chat/route.ts",
    records: "recordChatCost",
    unit: "ai-token",
  },
  {
    service: "OpenRouter (the model chat, through the dispatcher)",
    route: "src/lib/integrations/adapters/ai-settings.server.ts",
    records: "recordChatUsage",
    unit: "ai-token",
  },
  {
    service: "Gemini (the analyst and the briefing)",
    route: "src/app/api/ai/analyze/route.ts",
    records: "recordAiUsage",
    unit: "ai-token",
  },
  {
    service: "OpenSky (the aircraft feed)",
    route: "src/app/api/flights/route.ts",
    records: "recordFlightsUsage",
    unit: "opensky-credit",
  },
];

/**
 * The keyed routes that are *not* metered, and why.
 *
 * A key in the environment is not by itself a cost. Three kinds of key
 * appear in the platform and only one of them spends anything:
 *
 * - A key that authenticates an inbound caller is never spent; the
 *   caller is the one paying.
 * - A key for the operator's own service — their scanner, their intel
 *   container — is a request to their own machine.
 * - A free-tier token is a key with a rate limit but no charge.
 *
 * Each is listed here with the reason, so that a route is not quietly
 * added to the metered list for the wrong reason, and so that a route
 * that *does* start metering has to move.
 */
const KEYED_BUT_NOT_METERED: { route: string; why: string }[] = [
  {
    route: "src/app/api/ai/providers/route.ts",
    why: "It reports whether a provider is configured; it calls none.",
  },
  {
    route: "src/app/api/github-webhook/route.ts",
    why: "The secret authenticates an inbound webhook; the caller pays.",
  },
  {
    route: "src/app/api/sdk/ingest/route.ts",
    why: "The key authenticates an inbound device; the caller pays.",
  },
  {
    route: "src/app/api/scanner/route.ts",
    why: "The key is for the operator's own scanner service.",
  },
  {
    route: "src/app/api/cloudflare-radar/route.ts",
    why: "Radar's API is free; the token is rate limited but not billed.",
  },
  {
    route: "src/app/api/maritime/route.ts",
    why: "One persistent AIS subscription, not a per-call charge.",
  },
];

describe("the metered upstreams", () => {
  it("are all recorded", () => {
    // A metered upstream that records nothing is a drain on the
    // operator's account that nobody can see.
    //
    // The check is for a *call*, not for the name: a route that imports
    // the recorder and never calls it records nothing, and a test that
    // only looked for the name would pass it.
    const unrecorded: string[] = [];
    for (const upstream of METERED_UPSTREAMS) {
      const source = readFileSync(join(ROOT, upstream.route), "utf8");
      if (!new RegExp(`\\b${upstream.records}\\s*\\(`).test(source)) {
        unrecorded.push(`${upstream.service} (${upstream.route})`);
      }
    }
    expect(
      unrecorded,
      `These metered upstreams record no cost: ${unrecorded.join(", ")}`,
    ).toEqual([]);
  });

  it("record in the unit the provider charges in", () => {
    // The unit is the provider's own name for it. A unit that does not
    // say whose is a unit nobody can reconcile against a bill.
    //
    // The unit is checked in the module that writes it rather than in the
    // route that calls it: a route does not hold the unit, and looking
    // for it there would find nothing and prove nothing.
    const writers: Record<string, string> = {
      "src/app/api/ai/chat/route.ts": "src/lib/ai/usage.server.ts",
      "src/lib/integrations/adapters/ai-settings.server.ts": "src/lib/ai/usage.server.ts",
      "src/app/api/ai/analyze/route.ts": "src/lib/ai/usage.server.ts",
      "src/app/api/flights/route.ts": "src/lib/integrations/flights-usage.server.ts",
    };
    for (const upstream of METERED_UPSTREAMS) {
      const writer = readFileSync(join(ROOT, writers[upstream.route]), "utf8");
      expect(writer, `${upstream.service}`).toContain(upstream.unit);
    }
  });

  it("each record against a row of their own", () => {
    // A row carries one unit, so two upstreams that count in different
    // units cannot share one. The Gemini calls and the model chat both
    // count tokens but are different features, and the OpenSky credits
    // are a different unit entirely.
    const recorders = METERED_UPSTREAMS.map((u) => u.route);
    expect(new Set(recorders).size).toBe(recorders.length);
  });

  it("leave no keyed route unaccounted for", () => {
    // Every route that uses a key is either metered and recorded, or
    // listed above with the reason it is not metered. A new keyed route
    // that is neither fails here, so it cannot be added quietly.
    const accounted = new Set([
      ...METERED_UPSTREAMS.map((u) => u.route.replace(/\\/g, "/")),
      ...KEYED_BUT_NOT_METERED.map((u) => u.route.replace(/\\/g, "/")),
    ]);
    const unaccounted: string[] = [];
    for (const file of routeFiles()) {
      const source = readFileSync(file, "utf8");
      const usesKey = /process\.env\.[A-Z_]*(KEY|TOKEN|SECRET|CRED)/.test(source);
      if (!usesKey) continue;
      const rel = file.replace(/\\/g, "/").replace(`${ROOT.replace(/\\/g, "/")}/`, "");
      if (!accounted.has(rel)) unaccounted.push(rel);
    }
    expect(
      unaccounted,
      "These routes use a keyed service but are neither metered nor listed " +
        "as free. Either the service meters and it has to be recorded, or " +
        "it does not and it has to be listed with the reason.",
    ).toEqual([]);
  });

  it("list the free ones with a reason", () => {
    // A route listed as free has to say why, so the list is a record of
    // the decision rather than a list of names.
    for (const { route, why } of KEYED_BUT_NOT_METERED) {
      expect(why.length, route).toBeGreaterThan(10);
      expect(existsSync(join(ROOT, route)), route).toBe(true);
    }
  });
});
