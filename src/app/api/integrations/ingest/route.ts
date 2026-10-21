import { NextResponse } from "next/server";
import { resolveDevice, deviceAllowsTool } from "@/lib/auth/device.server";
import { recordAudit } from "@/lib/integrations/audit.server";
import { persistFindings } from "@/lib/integrations/persistence.server";
import {
  consumeDeviceFrames,
  DEVICE_DAILY_FRAME_QUOTA,
} from "@/lib/integrations/quota.server";
import type { SecurityFinding } from "@/lib/integrations/types";
import { RidFrameSchema, RidIngestSchema, FlockIngestSchema } from "@/lib/integrations/schemas";
import { z } from "zod";
import type { SecurityToolId } from "@/config/security-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The sensor push endpoint.
 *
 * A box on a rooftop proves itself with a shared secret, not with a
 * browser session. The secret is compared in constant time against a
 * stored hash, the device is checked against the tools it is allowed to
 * push, and the payload is validated before a single row is written.
 *
 * The device never chooses its tenant: that comes from the device
 * record, so a compromised device cannot write into another tenant.
 */

/** How many detections one push may carry. */
const MAX_PUSH = 5_000;

const SurveillancePushSchema = z.object({
  detections: z.array(z.object({
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
  })).max(MAX_PUSH),
});

const PlatePushSchema = z.object({
  events: z.array(z.object({
    plate: z.string().min(2).max(16),
    vehicle: z.string().max(128).optional(),
    confidence: z.number().finite().min(0).max(100).optional(),
    lat: z.number().finite().min(-90).max(90),
    lon: z.number().finite().min(-180).max(180),
    observedAt: z.string().max(64).optional(),
    sourceDevice: z.string().min(1).max(64),
    edgeId: z.string().max(64).optional(),
  })).max(MAX_PUSH),
});

export async function POST(req: Request) {
  const device = await resolveDevice(req);
  if (!device) {
    return NextResponse.json(
      { ok: false, errorCode: "DEVICE_UNAUTHENTICATED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, errorCode: "INVALID_BODY" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // The device declares which tool it is pushing for, and the record
  // decides whether it is allowed to.
  const kind = (body as { kind?: string })?.kind ?? "";
  const TOOL_FOR_KIND: Record<string, SecurityToolId> = {
    "remote-id": "esp32-drone-rid",
    "surveillance": "esp32-surveillance-cams",
    flock: "flock-detector",
    plate: "plate-ocr",
  };

  const tool = TOOL_FOR_KIND[kind];
  if (!tool) {
    return NextResponse.json(
      { ok: false, errorCode: "UNKNOWN_PUSH_KIND" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!deviceAllowsTool(device, tool)) {
    recordAudit({
      tenantId: device.tenantId,
      actorId: `device:${device.deviceId}`,
      tool,
      capability: "sensor.ingest",
      purpose: "sensor push",
      decision: "deny",
      reason: "TOOL_NOT_ALLOWED_FOR_DEVICE",
    });
    return NextResponse.json(
      { ok: false, errorCode: "TOOL_NOT_ALLOWED_FOR_DEVICE" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const ctx = {
    tenantId: device.tenantId,
    actorId: `device:${device.deviceId}`,
    signal: AbortSignal.timeout(10_000),
  };

  /**
   * Charge the push against the device's allowance.
   *
   * The plan's risk list names "rate limits" alongside device identity
   * and rotation, and this is what they were missing. A device that
   * pushes a million frames a minute was bounded only by what the
   * upstream would accept, and every frame it pushed was a write.
   *
   * The counter is per device, not per tenant: one misbehaving sensor on
   * a roof must not starve the others. The unit is frames, because a
   * frame is the thing that costs — a write, a finding, a beacon.
   *
   * The charge happens after the body is validated and before the work
   * is done, so a malformed push costs nothing and a valid one that
   * exceeds the allowance is refused before it is written.
   */
  const chargePush = async (frames: number): Promise<void> => {
    const quota = await consumeDeviceFrames(
      device.tenantId,
      device.deviceId,
      frames,
      DEVICE_DAILY_FRAME_QUOTA,
    );
    if (!quota.allowed) {
      throw new Error("DEVICE_PUSH_QUOTA_EXCEEDED");
    }
  };

  try {
    let findings: Array<Record<string, unknown>> = [];
    let count = 0;

    if (kind === "remote-id") {
      // The whole body, not the array inside it. The schema is shaped as
      // `{ frames: [...] }`, and handing it the array instead meant every
      // push was refused as invalid — the one path a sensor has.
      const parsed = RidIngestSchema.safeParse(body);
      if (!parsed.success) throw new Error("RID_INVALID_FRAMES");
      await chargePush(parsed.data.frames.length);
      const rid = await import("@/lib/integrations/adapters/esp32-rid.server");
      const out = await rid.ingestFrames(parsed.data, ctx);
      findings = out.findings as unknown as Array<Record<string, unknown>>;
      count = out.count;
    } else if (kind === "flock") {
      // The whole body here too, for the same reason.
      const parsed = FlockIngestSchema.safeParse(body);
      if (!parsed.success) throw new Error("FLOCK_INVALID_DETECTIONS");
      await chargePush(parsed.data.detections.length);
      const flock = await import("@/lib/integrations/adapters/flock.server");
      const out = await flock.ingestDetections(parsed.data, ctx);
      findings = out.findings as unknown as Array<Record<string, unknown>>;
      count = out.count;
      // The camera, as a thing: one row however many times it is seen.
      for (const detection of parsed.data.detections) {
        await flock.recordFlockDevice(detection, ctx);
      }
    } else if (kind === "surveillance") {
      const parsed = SurveillancePushSchema.safeParse(body);
      if (!parsed.success) throw new Error("SURVEILLANCE_INVALID_DETECTION");
      await chargePush(parsed.data.detections.length);
      const surv = await import("@/lib/integrations/adapters/esp32-surveillance.server");
      const out = await surv.ingestDetection(parsed.data, ctx);
      findings = out.findings as unknown as Array<Record<string, unknown>>;
      count = out.count;
      // The device, as a thing.
      for (const detection of parsed.data.detections) {
        await surv.recordSurveillanceDevice(detection, ctx);
      }
    } else if (kind === "plate") {
      const parsed = PlatePushSchema.safeParse(body);
      if (!parsed.success) throw new Error("PLATE_INVALID_EVENTS");
      const plate = await import("@/lib/integrations/adapters/plate-ocr.server");
      const out = await plate.recognize(parsed.data, ctx);
      findings = out.findings as unknown as Array<Record<string, unknown>>;
      count = out.count;
    }

    const auditId = recordAudit({
      tenantId: device.tenantId,
      actorId: `device:${device.deviceId}`,
      tool,
      capability: "sensor.ingest",
      purpose: "sensor push",
      decision: "allow",
      resultId: `push:${count}`,
    });

    /**
     * The findings are kept.
     *
     * A detection that is returned and not stored is a detection that is
     * lost: it leaves no trace, it belongs to no tenant, and it cannot be
     * deleted on the deadline it was given. The sensor push is the same
     * path the dispatcher takes, and it writes to the same place — so a
     * drone seen by a rooftop box reaches the map as a beacon rather than
     * existing only in the response.
     */
    const stored = await persistFindings(
      tool,
      device.tenantId,
      findings as unknown as SecurityFinding[],
    );

    return NextResponse.json(
      { ok: true, tool, kind, count, auditId, stored },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "PUSH_FAILED";
    recordAudit({
      tenantId: device.tenantId,
      actorId: `device:${device.deviceId}`,
      tool,
      capability: "sensor.ingest",
      purpose: "sensor push",
      decision: "deny",
      reason: message,
    });
    return NextResponse.json(
      { ok: false, errorCode: message },
      {
        // A push that is malformed is the caller's mistake (400). A push
        // that is over the device's allowance is refused too (429), and
        // the device is told so it can back off rather than retry into
        // the wall. Anything else is ours.
        status: message.includes("INVALID")
          ? 400
          : message.includes("QUOTA_EXCEEDED")
            ? 429
            : 500,
        headers: {
          "Cache-Control": "no-store",
          ...(message.includes("QUOTA_EXCEEDED")
            ? { "Retry-After": "3600" }
            : {}),
        },
      },
    );
  }
}
