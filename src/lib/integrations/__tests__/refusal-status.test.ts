import { describe, it, expect } from "vitest";
import {
  statusForRefusal,
  codeForRefusal,
} from "@/lib/integrations/refusal-status";

/**
 * What a refused integration call is answered with.
 *
 * The status tells a caller what to do next, so it has to say the right
 * thing: a caller that is not signed in is not going to get anywhere by
 * trying again, and a worker that is busy is going to get through if it
 * waits. Flattening both into one status would tell the caller the
 * wrong thing about the platform's own health.
 */

describe("a refused integration call", () => {
  it("answers an unsigned caller with 401", () => {
    expect(statusForRefusal("INTEGRATION_UNAUTHENTICATED")).toBe(401);
    expect(statusForRefusal("INTEGRATION_TENANT_MISMATCH")).toBe(401);
  });

  it("answers a call that is not permitted with 403", () => {
    expect(statusForRefusal("INTEGRATION_DENIED")).toBe(403);
    expect(statusForRefusal("INTEGRATION_CONSENT_REQUIRED")).toBe(403);
    expect(statusForRefusal("INTEGRATION_ASSET_REQUIRED")).toBe(403);
    expect(statusForRefusal("INTEGRATION_QUOTA_EXCEEDED")).toBe(403);
    expect(statusForRefusal("INTEGRATION_SOURCE_COOLDOWN:30")).toBe(403);
  });

  it("answers a tool that is not configured with 503", () => {
    expect(statusForRefusal("COLLECTION_WORKER_NOT_CONFIGURED")).toBe(503);
  });

  it("answers a busy worker with 429, not a failure", () => {
    // The worker refuses a call when it is already running as many tools
    // as it will. It is busy, not broken, and the caller can come back.
    // A 502 would say the platform is unwell, and it is not.
    expect(statusForRefusal("COLLECTION_WORKER_BUSY")).toBe(429);
  });

  it("answers a malformed request with 400", () => {
    expect(statusForRefusal("INTEGRATION_INVALID_BODY")).toBe(400);
  });

  it("answers anything else with 502", () => {
    // An upstream that failed is the platform's problem, and says so.
    expect(statusForRefusal("COLLECTION_WORKER_HTTP_500")).toBe(502);
    expect(statusForRefusal("SOMETHING_UNEXPECTED")).toBe(502);
  });

  it("names the refusal without its detail", () => {
    // The code is what a caller branches on, and it must not carry the
    // message - which may hold something from a third party.
    expect(codeForRefusal("INTEGRATION_CONSENT_REQUIRED")).toBe(
      "INTEGRATION_CONSENT_REQUIRED",
    );
    expect(codeForRefusal("INTEGRATION_SOURCE_COOLDOWN:30")).toBe(
      "INTEGRATION_SOURCE_COOLDOWN",
    );
  });
});
