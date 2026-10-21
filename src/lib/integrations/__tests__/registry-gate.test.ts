import { describe, it, expect, afterEach } from "vitest";
import {
  REGISTRY_REQUIRE_AUTH_FLAG,
  registryRequiresAuth,
  registrySurface,
} from "@/lib/integrations/registry-gate";

/**
 * The registry's gate.
 *
 * Two things depend on this decision: the route, which enforces it, and
 * the health check, which reports it. If they read the flag separately
 * they can disagree, and a health check that lies about the surface is
 * worse than one that says nothing.
 *
 * So the decision is in one place, and this is that place's test.
 */

const original = process.env[REGISTRY_REQUIRE_AUTH_FLAG];

afterEach(() => {
  if (original === undefined) delete process.env[REGISTRY_REQUIRE_AUTH_FLAG];
  else process.env[REGISTRY_REQUIRE_AUTH_FLAG] = original;
});

describe("the registry gate", () => {
  it("is open unless the deployment says otherwise", () => {
    delete process.env[REGISTRY_REQUIRE_AUTH_FLAG];
    expect(registryRequiresAuth()).toBe(false);
  });

  it("recognises the ways a deployment says yes", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on", " 1 "]) {
      process.env[REGISTRY_REQUIRE_AUTH_FLAG] = value;
      expect(registryRequiresAuth(), `flag=${value}`).toBe(true);
    }
  });

  it("treats anything it does not recognise as no", () => {
    // A typo in a deployment's environment should not lock the operator
    // out of the platform's own catalogue. The values that mean no mean
    // no, and so does anything unrecognised.
    for (const value of ["", "0", "false", "no", "off", "banana"]) {
      process.env[REGISTRY_REQUIRE_AUTH_FLAG] = value;
      expect(registryRequiresAuth(), `flag=${value}`).toBe(false);
    }
  });

  it("is read per call, not cached at startup", () => {
    // A deployment that changes its environment should not be stuck with
    // the answer it was started with.
    delete process.env[REGISTRY_REQUIRE_AUTH_FLAG];
    expect(registryRequiresAuth()).toBe(false);
    process.env[REGISTRY_REQUIRE_AUTH_FLAG] = "1";
    expect(registryRequiresAuth()).toBe(true);
    delete process.env[REGISTRY_REQUIRE_AUTH_FLAG];
    expect(registryRequiresAuth()).toBe(false);
  });
});

describe("the surface a client meets", () => {
  it("reports an open registry on a deployment with no database", () => {
    // A bare deployment runs single-tenant: there is no account to sign
    // in as, so closing the registry would refuse the only operator there
    // is, with no way back in.
    delete process.env[REGISTRY_REQUIRE_AUTH_FLAG];
    const surface = registrySurface(false);
    expect(surface.open).toBe(true);
    expect(surface.sessionRequired).toBe(false);
    expect(surface.database).toBe(false);
  });

  it("reports an open registry on a bare deployment even with the flag set", () => {
    // The flag is honoured where it can be honoured. Where it cannot,
    // it is not obeyed, and the surface says the registry is open rather
    // than claiming a gate that is not there.
    process.env[REGISTRY_REQUIRE_AUTH_FLAG] = "1";
    const surface = registrySurface(false);
    expect(surface.open).toBe(true);
    expect(surface.sessionRequired).toBe(false);
  });

  it("reports a closed registry on a deployment with a database", () => {
    process.env[REGISTRY_REQUIRE_AUTH_FLAG] = "1";
    const surface = registrySurface(true);
    expect(surface.open).toBe(false);
    expect(surface.sessionRequired).toBe(true);
    expect(surface.database).toBe(true);
  });

  it("reports an open registry on a database deployment with no flag", () => {
    delete process.env[REGISTRY_REQUIRE_AUTH_FLAG];
    const surface = registrySurface(true);
    expect(surface.open).toBe(true);
    expect(surface.sessionRequired).toBe(true);
  });
});
