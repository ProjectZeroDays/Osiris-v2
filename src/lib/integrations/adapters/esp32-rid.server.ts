import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";
import { recordDrone } from "../device-registry.server";
import { RidFrameSchema, RidIngestSchema } from "@/lib/integrations/schemas";

/**
 * Drone Remote ID (OpenDroneID).
 *
 * The frames are decoded by firmware the operator flashed on their own
 * hardware; OSIRIS consumes the decoded output and never touches the
 * radio. Two entity types come out of the same frame: the drone, and the
 * operator — whose position is part of the broadcast, not a guess.
 */

export interface RidFrame {
  uasId: string;
  operatorId?: string;
  drone: { lat: number; lon: number; altM?: number; speedMps?: number; headingDeg?: number };
  operator?: { lat: number; lon: number; altM?: number };
  rssi?: number;
  sourceDevice: string;
  observedAt?: string;
}

export async function ingestFrame(payload: unknown, ctx: AdapterContext) {
  const parsed = RidFrameSchema.safeParse(payload);
  if (!parsed.success) throw new Error("RID_INVALID_FRAME");
  const f = parsed.data as RidFrame & { observedAt?: string };

  const observedAt = f.observedAt ?? new Date().toISOString();
  const findings: SecurityFinding[] = [];

  findings.push({
    id: `rid:drone:${f.uasId}`,
    toolId: "esp32-drone-rid",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt,
    importedAt: new Date().toISOString(),
    severity: null,
    confidence: 0.9,
    status: "observed",
    evidenceHash: null,
    retentionUntil: null,
    properties: {
      kind: "drone",
      uasId: f.uasId,
      operatorId: f.operatorId ?? null,
      lat: f.drone.lat,
      lon: f.drone.lon,
      altM: f.drone.altM ?? null,
      speedMps: f.drone.speedMps ?? null,
      headingDeg: f.drone.headingDeg ?? null,
      rssi: f.rssi ?? null,
      sourceDevice: f.sourceDevice,
    },
  });

  if (f.operator) {
    findings.push({
      id: `rid:operator:${f.operatorId ?? f.uasId}`,
      toolId: "esp32-drone-rid",
      assetId: ctx.assetId ?? null,
      tenantId: ctx.tenantId,
      sourceUrl: null,
      observedAt,
      importedAt: new Date().toISOString(),
      severity: null,
      confidence: 0.9,
      status: "observed",
      evidenceHash: null,
      retentionUntil: null,
      properties: {
        kind: "drone-operator",
        operatorId: f.operatorId ?? null,
        uasId: f.uasId,
        lat: f.operator.lat,
        lon: f.operator.lon,
        altM: f.operator.altM ?? null,
        sourceDevice: f.sourceDevice,
      },
    });
  }

  return { findings };
}

export async function ingestFrames(payload: unknown, ctx: AdapterContext) {
  const parsed = RidIngestSchema.safeParse(payload);
  if (!parsed.success) throw new Error("RID_INVALID_FRAMES");

  const findings: SecurityFinding[] = [];
  for (const frame of parsed.data.frames) {
    const one = await ingestFrame(frame, ctx);
    findings.push(...one.findings);
    // The drone, as a thing: one row however many times it is seen, with
    // its last known position and when it was last seen.
    await recordDrone(ctx.tenantId, {
      uasId: frame.uasId,
      operatorId: frame.operatorId ?? null,
      lat: frame.drone.lat,
      lon: frame.drone.lon,
      altM: frame.drone.altM ?? null,
      speedMps: frame.drone.speedMps ?? null,
      headingDeg: frame.drone.headingDeg ?? null,
      observedAt: (frame as { observedAt?: string }).observedAt
        ? new Date((frame as { observedAt?: string }).observedAt!)
        : new Date(),
    });
  }
  return { findings, count: findings.length };
}

export async function listDrones(payload: unknown, ctx: AdapterContext) {
  const { findings } = await ingestFrames(payload, ctx);
  return {
    drones: findings
      .filter((f) => f.properties.kind === "drone")
      .map((f) => f.properties),
  };
}

export async function listOperators(payload: unknown, ctx: AdapterContext) {
  const { findings } = await ingestFrames(payload, ctx);
  return {
    operators: findings
      .filter((f) => f.properties.kind === "drone-operator")
      .map((f) => f.properties),
  };
}

export async function exportTrack(payload: unknown, ctx: AdapterContext) {
  const p = payload as { uasId?: string; frames?: RidFrame[] };
  if (!p?.uasId) throw new Error("RID_INVALID_TRACK");

  const frames = p.frames ?? [];
  const points = frames
    .filter((f) => f.uasId === p.uasId)
    .map((f) => [f.drone.lon, f.drone.lat]);

  return {
    uasId: p.uasId,
    type: "Feature",
    geometry: { type: "LineString", coordinates: points },
    properties: { kind: "drone", uasId: p.uasId },
  };
}
