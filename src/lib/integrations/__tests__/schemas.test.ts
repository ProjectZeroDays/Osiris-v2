import { describe, it, expect } from "vitest";
import {
  FlockDetectionSchema,
  RidFrameSchema,
  MetasploitReportSchema,
  IntegrationRequestBodySchema,
  ExploitIndexCveSchema,
  PagasusAuditSchema,
} from "@/lib/integrations/schemas";

describe("schemas", () => {
  it("accepts a well-formed Flock detection", () => {
    const parsed = FlockDetectionSchema.safeParse({
      mac: "aabbccddeeff",
      method: "wifi",
      rssi: -62,
      gps: { lat: 51.5, lon: -0.12 },
      sourceDevice: "sensor-1",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a latitude out of range", () => {
    const parsed = FlockDetectionSchema.safeParse({
      mac: "aabbccddeeff",
      gps: { lat: 91, lon: 0 },
      sourceDevice: "sensor-1",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-finite coordinate", () => {
    const parsed = FlockDetectionSchema.safeParse({
      mac: "aabbccddeeff",
      gps: { lat: Number.NaN, lon: 0 },
      sourceDevice: "sensor-1",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a detection with no device", () => {
    const parsed = FlockDetectionSchema.safeParse({
      mac: "aabbccddeeff",
      gps: { lat: 0, lon: 0 },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a Remote ID frame with no uasId", () => {
    const parsed = RidFrameSchema.safeParse({
      drone: { lat: 0, lon: 0 },
      sourceDevice: "sensor-1",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a Remote ID frame with an operator position", () => {
    const parsed = RidFrameSchema.safeParse({
      uasId: "FA3ABCDE12345",
      operatorId: "op-1",
      drone: { lat: 51.5, lon: -0.12, altM: 80 },
      operator: { lat: 51.6, lon: -0.2, altM: 10 },
      sourceDevice: "sensor-1",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a heading outside 0-360", () => {
    const parsed = RidFrameSchema.safeParse({
      uasId: "FA3ABCDE12345",
      drone: { lat: 0, lon: 0, headingDeg: 400 },
      sourceDevice: "sensor-1",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a severity outside the enum", () => {
    const parsed = MetasploitReportSchema.safeParse({
      findings: [{ host: "10.0.0.1", severity: "catastrophic" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown key in the request body", () => {
    const parsed = IntegrationRequestBodySchema.safeParse({
      purpose: "test",
      tenantId: "someone-elses-tenant",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a well-formed request body", () => {
    const parsed = IntegrationRequestBodySchema.safeParse({
      purpose: "approved lab assessment",
      assetId: "asset-1",
      consentAttestation: true,
      payload: { any: "shape" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-uuid request id", () => {
    const parsed = IntegrationRequestBodySchema.safeParse({ requestId: "not-a-uuid" });
    expect(parsed.success).toBe(false);
  });

  it("truncates an over-long description rather than accepting it", () => {
    const parsed = ExploitIndexCveSchema.safeParse({ description: "x".repeat(5000) });
    expect(parsed.success).toBe(false);
  });

  it("rejects a report with no findings", () => {
    const parsed = PagasusAuditSchema.safeParse({ device: { model: "Pixel" } });
    expect(parsed.success).toBe(false);
  });
});
