import { describe, it, expect, vi, afterEach } from "vitest";
import * as metasploit from "@/lib/integrations/adapters/metasploit.server";
import * as exploitIndex from "@/lib/integrations/adapters/exploit-index.server";
import * as zenmap from "@/lib/integrations/adapters/zenmap.server";
import * as spytv from "@/lib/integrations/adapters/spytv.server";
import * as pagasus from "@/lib/integrations/adapters/pagasus-pro.server";
import * as maltego from "@/lib/integrations/adapters/maltego.server";
import * as dedsec from "@/lib/integrations/adapters/dedsec-cctv.server";

const ctx = { tenantId: "t", actorId: "a", signal: AbortSignal.timeout(5000) };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("adapters", () => {
  it("metasploit rejects malformed report", async () => {
    await expect(metasploit.importLabReport({}, ctx)).rejects.toThrow("INVALID_REPORT");
  });

  it("exploit-index marks findings unverified", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ description: "x" }), { status: 200 })),
    );
    const { findings } = await exploitIndex.readUntrustedCveMetadata("CVE-2024-0001", ctx);
    expect(findings[0].status).toBe("unverified");
    expect(findings[0].confidence).toBeLessThanOrEqual(0.5);
  });

  it("zenmap rejects a report with no hosts", async () => {
    await expect(zenmap.importReport({}, ctx)).rejects.toThrow("INVALID_REPORT");
  });

  it("spytv rejects a report with no findings", async () => {
    await expect(spytv.importDefenseReport({}, ctx)).rejects.toThrow("INVALID_REPORT");
  });

  it("pagasus-pro rejects a report with no findings", async () => {
    await expect(pagasus.importMinimizedAudit({}, ctx)).rejects.toThrow("INVALID_REPORT");
  });

  it("maltego rejects a graph with no entities", async () => {
    await expect(maltego.importReviewedGraph({}, ctx)).rejects.toThrow("INVALID_GRAPH");
  });

  it("dedsec rejects a config with no cameras", async () => {
    await expect(dedsec.importOwnedCameraConfig({}, ctx)).rejects.toThrow("INVALID_CONFIG");
  });

  it("imports carry the tenant from the context", async () => {
    const { findings } = await metasploit.importLabReport(
      { findings: [{ host: "10.0.0.1", cve: "CVE-2024-0001" }] },
      ctx,
    );
    expect(findings[0].tenantId).toBe("t");
    expect(findings[0].toolId).toBe("metasploit");
  });
});