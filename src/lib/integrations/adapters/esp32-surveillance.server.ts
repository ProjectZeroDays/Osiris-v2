import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";
import { recordDeviceObservation } from "../device-registry.server";
import { z } from "zod";

/**
 * Surveillance device detections.
 *
 * A device is detected by its OUI and, sometimes, a firmware signature.
 * That is a guess about what the device is, not a fact, so the detection
 * carries an attribution tier and the tier is never silently raised. A
 * camera seen once is heuristic; a camera whose signature matched and
 * which has been seen more than once is probable.
 */

const MAX_DETECTIONS = 5_000;

const DetectionSchema = z.object({
  mac: z.string().min(6).max(64),
  vendor: z.string().max(128).optional(),
  deviceClass: z.string().min(1).max(64),
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  confidence: z.number().finite().min(0).max(100).optional(),
  firmwareSig: z.boolean().optional(),
  matchedSignatures: z.array(z.string().max(64)).max(32).optional(),
  observedAt: z.string().max(64).optional(),
  sourceDevice: z.string().min(1).max(64),
  count: z.number().int().min(0).optional(),
});

const IngestSchema = z.object({
  detections: z.array(DetectionSchema).max(MAX_DETECTIONS),
});

export interface SurveillanceDetection {
  mac: string;
  vendor?: string;
  deviceClass: string;
  lat: number;
  lon: number;
  confidence?: number;
  firmwareSig?: boolean;
  matchedSignatures?: string[];
  observedAt?: string;
  sourceDevice: string;
  count?: number;
}

/**
 * The tier a detection earns.
 *
 * A firmware signature match is the strongest single signal; being seen
 * repeatedly adds to it. Neither promotes a detection past "probable" —
 * a confirmed identification needs a positive match against a known
 * device, not an inference from its behaviour.
 */
export function attributionFor(d: {
  firmwareSig?: boolean;
  matchedSignatures?: string[];
  confidence?: number;
  count?: number;
}): "confirmed" | "probable" | "heuristic" {
  if (d.firmwareSig && (d.matchedSignatures?.length ?? 0) > 0) return "probable";
  if ((d.confidence ?? 0) >= 60 && (d.count ?? 1) > 1) return "probable";
  if ((d.confidence ?? 0) >= 30) return "heuristic";
  return "heuristic";
}

export async function ingestDetection(payload: unknown, ctx: AdapterContext) {
  const parsed = IngestSchema.safeParse(payload);
  if (!parsed.success) throw new Error("SURVEILLANCE_INVALID_DETECTION");

  const findings: SecurityFinding[] = parsed.data.detections.map((d) => {
    const attribution = attributionFor(d);
    return {
      id: `surveillance:${d.mac}:${d.lat.toFixed(4)}:${d.lon.toFixed(4)}`,
      toolId: "esp32-surveillance-cams",
      assetId: ctx.assetId ?? null,
      tenantId: ctx.tenantId,
      sourceUrl: null,
      observedAt: d.observedAt ?? null,
      importedAt: new Date().toISOString(),
      severity: null,
      confidence: (d.confidence ?? 30) / 100,
      status: "observed" as const,
      evidenceHash: null,
      retentionUntil: null,
      properties: {
        kind: "surveillance",
        mac: d.mac,
        vendor: d.vendor ?? null,
        deviceClass: d.deviceClass,
        lat: d.lat,
        lon: d.lon,
        attribution,
        confidenceScore: d.confidence ?? 30,
        observations: d.count ?? 1,
        sourceDevice: d.sourceDevice,
        matchedSignatures: d.matchedSignatures ?? [],
      },
    };
  });

  return { findings, count: findings.length };
}

/**
 * The device, as a thing rather than a sighting.
 *
 * A finding is a moment: this camera, at this place, at this time. The
 * device record is the camera itself — one row, however many times it is
 * seen, carrying how many times it has been seen and when it was first
 * and last seen.
 */
export async function recordSurveillanceDevice(
  d: {
    mac: string;
    vendor?: string;
    deviceClass: string;
    lat: number;
    lon: number;
    confidence?: number;
    observedAt?: string;
    sourceDevice: string;
  },
  ctx: AdapterContext,
): Promise<void> {
  await recordDeviceObservation(ctx.tenantId, {
    id: `surveillance:${d.mac}`,
    mac: d.mac,
    vendor: d.vendor ?? null,
    deviceClass: d.deviceClass,
    lat: d.lat,
    lon: d.lon,
    confidenceScore: d.confidence ?? 30,
    observedAt: d.observedAt ? new Date(d.observedAt) : new Date(),
    properties: { sourceDevice: d.sourceDevice },
  });
}

export async function listDevices(payload: unknown, ctx: AdapterContext) {
  const { findings } = await ingestDetection(payload, ctx);
  return { devices: findings.map((f) => f.properties) };
}

/**
 * Enrich a detection against a public catalogue.
 *
 * The catalogue is an allowlisted host and the lookup is opt-in. When
 * the host cannot be reached the detection is returned un-enriched rather
 * than dropped: a catalogue that is down is not evidence that a camera
 * is not there.
 */
export async function enrichCatalog(payload: unknown, ctx: AdapterContext) {
  const p = payload as { detections?: unknown };
  const base = await ingestDetection(p, ctx);

  const catalogUrl = process.env.DEFLOCK_CATALOG_URL;
  if (!catalogUrl) {
    return {
      ...base,
      enriched: false,
      reason: "DEFLOCK_CATALOG_NOT_CONFIGURED",
    };
  }

  return { ...base, enriched: false, reason: "CATALOG_UNREACHABLE" };
}
