import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";
import { FlockDetectionSchema, FlockIngestSchema } from "@/lib/integrations/schemas";
import { recordDeviceObservation } from "../device-registry.server";
import type { z } from "zod";

/** A Flock detection, as the schema validates it. */
type FlockDetection = z.infer<typeof FlockDetectionSchema>;

/**
 * Flock camera detections.
 *
 * The detector firmware is on the operator's own device; OSIRIS consumes
 * the JSON it emits. A detection is a camera that was seen, and a camera
 * that was seen once is a guess — the confidence tier is carried with it
 * and never raised on the platform's own judgement.
 */

const MAX_DETECTIONS = 5_000;

/**
 * The tier a Flock detection earns.
 *
 * The reference firmware uses three tiers: below 30 is low, 30 to 59 is
 * probable, 60 and above is high. "High" is a strong guess, not a fact,
 * so it maps to "probable" here and only a positive match against a
 * known device would be "confirmed".
 */
export function flockAttribution(confidence?: number): "confirmed" | "probable" | "heuristic" {
  if (confidence === undefined) return "heuristic";
  if (confidence >= 60) return "probable";
  return "heuristic";
}

export async function ingestDetection(payload: unknown, ctx: AdapterContext) {
  const parsed = FlockDetectionSchema.safeParse(payload);
  if (!parsed.success) throw new Error("FLOCK_INVALID_DETECTION");
  const d = parsed.data;

  const finding: SecurityFinding = {
    id: `flock:${d.mac}:${d.gps.lat.toFixed(4)}:${d.gps.lon.toFixed(4)}`,
    toolId: "flock-detector",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: d.last ? new Date(d.last).toISOString() : null,
    importedAt: new Date().toISOString(),
    severity: null,
    confidence: (d.confidence ?? 30) / 100,
    status: "observed",
    evidenceHash: null,
    retentionUntil: null,
    properties: {
      kind: "flock-camera",
      mac: d.mac,
      vendor: "Flock Safety",
      deviceClass: "alpr",
      lat: d.gps.lat,
      lon: d.gps.lon,
      confidence: d.confidence ?? null,
      attribution: flockAttribution(d.confidence),
      method: d.method ?? null,
      channel: d.channel ?? null,
      rssi: d.rssi ?? null,
      ssid: d.ssid ?? null,
      firmwareSig: d.firmware_sig ?? false,
      matchedSignatures: d.matched_signatures ?? [],
      firstSeen: d.first ?? null,
      lastSeen: d.last ?? null,
      observations: d.count ?? 1,
      sourceDevice: d.sourceDevice,
    },
  };

  return { findings: [finding] };
}

/**
 * The camera, as a thing rather than a sighting.
 *
 * A finding is a moment: this camera, at this place, at this time. The
 * device record is the camera itself — one row, however many times it is
 * seen, carrying how many times it has been seen and when it was first
 * and last seen.
 */
export async function recordFlockDevice(
  d: FlockDetection,
  ctx: AdapterContext,
): Promise<void> {
  await recordDeviceObservation(ctx.tenantId, {
    id: `flock:${d.mac}`,
    mac: d.mac,
    vendor: "Flock Safety",
    deviceClass: "alpr",
    lat: d.gps.lat,
    lon: d.gps.lon,
    confidenceScore: d.confidence ?? 30,
    observedAt: d.last ? new Date(d.last) : new Date(),
    properties: {
      method: d.method ?? null,
      ssid: d.ssid ?? null,
      sourceDevice: d.sourceDevice,
    },
  });
}

export async function ingestDetections(payload: unknown, ctx: AdapterContext) {
  const parsed = FlockIngestSchema.safeParse(payload);
  if (!parsed.success) throw new Error("FLOCK_INVALID_DETECTIONS");
  if (parsed.data.detections.length > MAX_DETECTIONS) throw new Error("FLOCK_TOO_MANY_DETECTIONS");

  const findings: SecurityFinding[] = [];
  for (const d of parsed.data.detections) {
    const one = await ingestDetection(d, ctx);
    findings.push(...one.findings);
  }
  return { findings, count: findings.length };
}

export async function listCameras(payload: unknown, ctx: AdapterContext) {
  const { findings } = await ingestDetections(payload, ctx);
  return { cameras: findings.map((f) => f.properties) };
}

/**
 * The DeFlock export.
 *
 * DeFlock expects a flat list of cameras with a MAC and a position. The
 * export is built from what was recorded, and it is written to the caller
 * rather than uploaded anywhere: the platform does not publish a
 * sighting list on the operator's behalf.
 */
export async function exportDeFlock(payload: unknown, ctx: AdapterContext) {
  const { findings } = await ingestDetections(payload, ctx);
  return {
    format: "deflock",
    version: 1,
    exportedAt: new Date().toISOString(),
    cameras: findings.map((f) => {
      const p = f.properties as Record<string, unknown>;
      return {
        mac: p.mac,
        lat: p.lat,
        lon: p.lon,
        confidence: p.confidence,
        method: p.method,
        lastSeen: p.lastSeen,
      };
    }),
  };
}

export async function exportGeoJSON(payload: unknown, ctx: AdapterContext) {
  const { findings } = await ingestDetections(payload, ctx);
  return {
    type: "FeatureCollection",
    features: findings.map((f) => {
      const p = f.properties as Record<string, unknown>;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [Number(p.lon), Number(p.lat)] },
        properties: p,
      };
    }),
  };
}
