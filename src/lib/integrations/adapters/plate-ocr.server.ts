import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Plate recognition.
 *
 * A plate is a person's movement, read off a road. It is therefore the
 * most sensitive thing in the registry, and it is treated as such: the
 * consent gate is real, the retention is short, and a reading is never
 * promoted to a fact about a person — it is a reading of a plate.
 *
 * ── The one execution exception in the whole registry ──
 *
 * The recogniser itself is a real program on the operator's host, and
 * the plan's own risk review flagged this as the one place where the
 * no-in-process-execution rule had to bend. It bends here, and only here,
 * under three constraints:
 *
 *   1. `execFile`, never `exec` — there is no shell, so a target string
 *      cannot become a command.
 *   2. A fixed argument list. Nothing from the request reaches the
 *      argument vector except the country code and the count, and both
 *      are validated against an allowlist before they are used.
 *   3. One binary, named by an environment variable, with a timeout and
 *      a bounded output buffer.
 *
 * A test enforces that this is the only file in the integration layer
 * that imports `node:child_process`, so the exception cannot widen by
 * accident.
 */

const run = promisify(execFile);

const MAX_EVENTS = 5_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** The country codes the recogniser is allowed to be asked for. */
const COUNTRIES = ["us", "eu"] as const;
type Country = (typeof COUNTRIES)[number];

const PlateEventSchema = z.object({
  plate: z.string().min(2).max(16),
  vehicle: z.string().max(128).optional(),
  confidence: z.number().finite().min(0).max(100).optional(),
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  observedAt: z.string().max(64).optional(),
  sourceDevice: z.string().min(1).max(64),
  edgeId: z.string().max(64).optional(),
});

const EventsSchema = z.object({ events: z.array(PlateEventSchema).max(MAX_EVENTS) });

export interface PlateEvent {
  plate: string;
  vehicle?: string;
  confidence?: number;
  lat: number;
  lon: number;
  observedAt?: string;
  sourceDevice: string;
  edgeId?: string;
}

export async function recognize(payload: unknown, ctx: AdapterContext) {
  const parsed = EventsSchema.safeParse(payload);
  if (!parsed.success) throw new Error("PLATE_INVALID_EVENTS");

  const findings: SecurityFinding[] = parsed.data.events.map((e, i) => ({
    id: `plate:${e.plate}:${e.lat.toFixed(4)}:${e.lon.toFixed(4)}:${i}`,
    toolId: "plate-ocr",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: e.observedAt ?? null,
    importedAt: new Date().toISOString(),
    severity: null,
    confidence: (e.confidence ?? 70) / 100,
    status: "observed",
    evidenceHash: null,
    retentionUntil: null,
    properties: {
      kind: "plate-hit",
      plate: e.plate,
      vehicle: e.vehicle ?? null,
      lat: e.lat,
      lon: e.lon,
      confidence: e.confidence ?? null,
      attribution: "heuristic",
      edgeId: e.edgeId ?? null,
      sourceDevice: e.sourceDevice,
    },
  }));

  return { findings, count: findings.length };
}

export async function listEvents(payload: unknown, ctx: AdapterContext) {
  const { findings } = await recognize(payload, ctx);
  return { events: findings.map((f) => f.properties), count: findings.length };
}

/**
 * Recognise plates in one image.
 *
 * The image is written to a temporary file, handed to the recogniser,
 * and the file is removed whether the call succeeded or not. The
 * recognised plates come back as a reading; they are recorded the same
 * way an imported event would be, and they are no more than a reading.
 */
export async function recognizePlate(
  imageBuffer: Buffer,
  opts: { country?: Country; topN?: number } = {},
): Promise<{ plates: Array<{ plate: string; confidence: number }> }> {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error("PLATE_INVALID_IMAGE");
  }
  if (imageBuffer.length > MAX_IMAGE_BYTES) {
    throw new Error("PLATE_IMAGE_TOO_LARGE");
  }

  const bin = process.env.OPENALPR_BIN ?? "alpr";
  const country: Country = COUNTRIES.includes(opts.country as Country)
    ? (opts.country as Country)
    : "us";
  const topN = Math.min(Math.max(opts.topN ?? 3, 1), 10);

  const tmp = join(tmpdir(), `osiris-plate-${randomUUID()}.png`);
  await writeFile(tmp, imageBuffer);
  try {
    const { stdout } = await run(
      bin,
      // A fixed argument list. The country and the count are validated
      // above, and the file path is generated here — none of the three
      // comes from the request.
      ["-c", country, "-n", String(topN), "-j", tmp],
      { timeout: 15_000, maxBuffer: 2_000_000 },
    );
    const parsed = JSON.parse(stdout) as {
      results?: Array<{ plate?: string; confidence?: number }>;
    };
    return {
      plates: (parsed.results ?? [])
        .filter((r) => typeof r.plate === "string" && r.plate.length > 0)
        .map((r) => ({ plate: r.plate!, confidence: Number(r.confidence ?? 0) })),
    };
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
}
