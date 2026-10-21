import { beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/integrations/health/route";
import { recordFailure, recordSuccess } from "@/lib/integrations/health.server";

/**
 * What the integrations health route tells a caller.
 *
 * It answers without a session, on purpose: a load balancer's probe cannot
 * sign in, so a health check that demanded one would never fire. That makes
 * the surface public, and a public surface has to be chosen rather than
 * stumbled into. The route therefore reports the same kind of thing
 * `/api/health` reports — process-level facts — and nothing that came out
 * of an upstream.
 *
 * The case that decides it is a failing source. An upstream failure lands
 * in `recordFailure` as `err.message`, which for an HTTP-backed tool is the
 * client's own text: a status line, a URL, sometimes a fragment of the
 * response. The dispatcher serves a stripped form of that same string, but
 * only to a caller it has already authenticated. Serving it here would put
 * it in front of anyone who asks.
 */
describe("the integrations health route", () => {
  beforeEach(() => {
    // The source table is module state and outlives a single test. A
    // source left failing would fail the next test's assertion about
    // `down`, which is a test reporting its own residue.
    recordSuccess("reset-source");
  });

  it("answers without a session", async () => {
    // No sign-in, no cookie, nothing. This is the load balancer's call.
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("says a source is down without saying why", async () => {
    const upstreamText =
      "connect ECONNREFUSED 104.16.27.34:443 at https://api.shodan.io/shodan/host/203.0.113.7";
    for (let i = 0; i < 4; i++) recordFailure("shodan", upstreamText);

    const response = await GET();
    const body = await response.json();

    // The health itself is the point of the endpoint, and it is a 503 so
    // a load balancer can act on it without parsing the body.
    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.down).toContain("shodan");
    expect(body.sources.shodan.health).toBe("down");

    // And the text the upstream sent is not on a public surface. Not the
    // address, not the tool's own name beside it — nothing that a caller
    // with no session could not already have guessed is confirmed here.
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(body)).not.toContain("104.16.27.34");
    expect(JSON.stringify(body)).not.toContain("api.shodan.io");
    expect(JSON.stringify(body)).not.toContain("lastError");
  });

  it("keeps the counts an operator watches", async () => {
    recordSuccess("zenmap");
    for (let i = 0; i < 2; i++) recordFailure("metasploit", "SHODAN_NOT_CONFIGURED: no key");

    const body = await (await GET()).json();

    // The degradation is still visible — what is withheld is the text,
    // not the state. An operator sees that a source is struggling and
    // goes to the audit trail for the reason.
    expect(body.sources.metasploit.health).toBe("degraded");
    expect(body.sources.metasploit.consecutiveFailures).toBe(2);
    expect(body.sources.metasploit.lastFailureAt).toBeGreaterThan(0);
    expect(body.degraded).toContain("metasploit");
    expect(body.sources.zenmap.health).toBe("healthy");
  });

  it("reports the platform's own shape rather than guessing at it", async () => {
    const body = await (await GET()).json();

    // The same facts `/api/health` states, so a client asking either one
    // learns the same thing about the deployment.
    expect(body.service).toBe("osiris-integrations");
    expect(typeof body.database).toBe("boolean");
    expect(body.tools).toBeGreaterThan(0);
    expect(typeof body.timestamp).toBe("string");
  });
});
