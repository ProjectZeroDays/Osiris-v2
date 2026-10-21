import { describe, it, expect } from "vitest";
import { assertAuthorized } from "@/lib/integrations/authz.server";

const base = { requestId: "r", tenantId: "t1", actorId: "a1", purpose: "p" } as const;

describe("authz", () => {
  it("rejects unauthenticated", () => {
    expect(() =>
      assertAuthorized(
        { ...base, tool: "shodan", capability: "host.lookupVerifiedAsset", assetId: "x" },
        { authenticated: false, tenantId: null, actorId: null, roles: [] },
      ),
    ).toThrow("UNAUTHENTICATED");
  });

  it("rejects tenant mismatch", () => {
    expect(() =>
      assertAuthorized(
        { ...base, tenantId: "t2", tool: "shodan", capability: "host.lookupVerifiedAsset", assetId: "x" },
        { authenticated: true, tenantId: "t1", actorId: "a1", roles: [] },
      ),
    ).toThrow("TENANT_MISMATCH");
  });

  it("requires asset for shodan", () => {
    expect(() =>
      assertAuthorized(
        { ...base, tool: "shodan", capability: "host.lookupVerifiedAsset" },
        { authenticated: true, tenantId: "t1", actorId: "a1", roles: [] },
      ),
    ).toThrow("ASSET_REQUIRED");
  });

  it("requires consent for sherlock", () => {
    expect(() =>
      assertAuthorized(
        { ...base, tool: "sherlock", capability: "controlledHandle.checkSingle" },
        { authenticated: true, tenantId: "t1", actorId: "a1", roles: [] },
      ),
    ).toThrow("CONSENT_REQUIRED");
  });

  it("rejects an unknown tool", () => {
    expect(() =>
      assertAuthorized(
        { ...base, tool: "not-a-tool" as never, capability: "x" },
        { authenticated: true, tenantId: "t1", actorId: "a1", roles: [] },
      ),
    ).toThrow("UNKNOWN_TOOL");
  });

  it("allows a fully satisfied request", () => {
    expect(() =>
      assertAuthorized(
        {
          ...base,
          tool: "sherlock",
          capability: "controlledHandle.checkSingle",
          consentAttestation: true,
        },
        { authenticated: true, tenantId: "t1", actorId: "a1", roles: ["analyst"] },
      ),
    ).not.toThrow();
  });
});