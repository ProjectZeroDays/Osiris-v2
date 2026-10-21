import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as collection from "@/lib/integrations/adapters/tool-collection.server";

const ctx = { tenantId: "t", actorId: "a", signal: AbortSignal.timeout(5000) };

const ENV = ["OSIRIS_WORKER_URL", "OSIRIS_WORKER_KEY"];

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV) delete process.env[k];
  vi.unstubAllGlobals();
});

/** A worker that answers with a catalogue and then with a result. */
function stubWorker(result: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/api/tools")) {
      return new Response(
        JSON.stringify({
          total: 1,
          categories: ["recon"],
          tools: { recon: [{ name: "shodan", path: "shodan.py", category: "recon" }] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        success: true,
        result: {
          returncode: 0,
          result: { findings: [{ id: "f1", severity: "high", host: "10.0.0.1" }] },
          provenance: {
            tool: "shodan",
            tool_path: "C:/tools/recon/shodan.py",
            tool_sha256: "a".repeat(64),
            entry: "main",
            started_at: "2026-10-20T12:00:00Z",
            duration_ms: 42,
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }));
}

describe("the tool-collection adapter", () => {
  it("refuses to run without a worker configured", async () => {
    await expect(collection.listTools({}, ctx)).rejects.toThrow(
      "COLLECTION_WORKER_NOT_CONFIGURED",
    );
  });

  it("refuses to run without a key", async () => {
    process.env.OSIRIS_WORKER_URL = "http://127.0.0.1:8080";
    await expect(collection.listTools({}, ctx)).rejects.toThrow(
      "COLLECTION_WORKER_KEY_MISSING",
    );
  });

  it("refuses a worker that is not on a local address", async () => {
    // A worker that imports tool modules is not something to reach over
    // the public internet, and neither is the platform that asks it to.
    process.env.OSIRIS_WORKER_URL = "https://workers.example.com";
    process.env.OSIRIS_WORKER_KEY = "key";
    await expect(collection.listTools({}, ctx)).rejects.toThrow(
      "COLLECTION_WORKER_NOT_CONFIGURED",
    );
  });

  it("accepts the loopback and the compose service name", async () => {
    for (const host of ["127.0.0.1", "localhost", "osiris-intel", "host.docker.internal"]) {
      process.env.OSIRIS_WORKER_URL = `http://${host}:8080`;
      process.env.OSIRIS_WORKER_KEY = "key";
      // The call itself will fail to connect; what matters is that it
      // got past the configuration check.
      await expect(collection.listTools({}, ctx)).rejects.not.toThrow(
        /COLLECTION_WORKER_NOT_CONFIGURED|COLLECTION_WORKER_KEY_MISSING/,
      );
    }
  });

  it("requires a category and a tool to run one", async () => {
    process.env.OSIRIS_WORKER_URL = "http://127.0.0.1:8080";
    process.env.OSIRIS_WORKER_KEY = "key";
    await expect(collection.execute({}, ctx)).rejects.toThrow(
      "COLLECTION_TOOL_REQUIRED",
    );
    await expect(collection.listCategory({}, ctx)).rejects.toThrow(
      "COLLECTION_CATEGORY_REQUIRED",
    );
  });

  it("says the worker is busy when the worker is busy", async () => {
    // The worker refuses a tool call when it is already running as many
    // as it will. That is not a failure and not a gateway error: the
    // worker is busy, and the caller can come back. A bare HTTP status
    // would flatten that into something that reads like a fault.
    process.env.OSIRIS_WORKER_URL = "http://127.0.0.1:8080";
    process.env.OSIRIS_WORKER_KEY = "key";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/api/tools")) {
        return new Response(
          JSON.stringify({
            total: 1,
            categories: ["recon"],
            tools: { recon: [{ name: "shodan", path: "shodan.py", category: "recon" }] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          error: "The worker is already running 8 tools.",
          error_code: "WORKER_BUSY",
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    }));

    await expect(
      collection.execute({ category: "recon", tool: "shodan", params: {} }, ctx),
    ).rejects.toThrow("COLLECTION_WORKER_BUSY");
  });
});

describe("what a tool's result becomes", () => {
  beforeEach(() => {
    process.env.OSIRIS_WORKER_URL = "http://127.0.0.1:8080";
    process.env.OSIRIS_WORKER_KEY = "key";
  });

  it("records a tool's finding as inferred, not observed", async () => {
    // The platform did not verify the finding; the tool asserted it. The
    // difference has to be visible wherever the finding is shown.
    stubWorker({});
    const out = await collection.execute(
      { category: "recon", tool: "shodan", params: {} }, ctx);

    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].status).toBe("inferred");
    expect(out.findings[0].properties.attribution).toBe("tool-asserted");
    expect(out.findings[0].properties.verified).toBe(false);
  });

  it("records which code produced the finding", async () => {
    stubWorker({});
    const out = await collection.execute(
      { category: "recon", tool: "shodan", params: {} }, ctx);

    expect(out.provenance.tool).toBe("shodan");
    expect(out.provenance.toolSha256).toBe("a".repeat(64));
    expect(out.provenance.entry).toBe("main");
    expect(out.provenance.verified).toBe(false);
  });

  it("carries the tool's hash as the finding's evidence", async () => {
    // The evidence hash is what makes a result traceable: a finding
    // recorded against a hash belongs to that code, and a later run of a
    // changed tool is visibly a different thing.
    stubWorker({});
    const out = await collection.execute(
      { category: "recon", tool: "shodan", params: {} }, ctx);

    expect(out.findings[0].evidenceHash).toBe("a".repeat(64));
  });

  it("does not claim the platform verified anything", async () => {
    stubWorker({});
    const out = await collection.execute(
      { category: "recon", tool: "shodan", params: {} }, ctx);

    expect(out.provenance.attribution).toBe("tool-asserted");
    expect(out.provenance.verified).toBe(false);
  });
});
