import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client.server";
import { drones, surveillanceDevices } from "@/db/schema";

/**
 * The entities a sensor sees.
 *
 * A finding is one observation: a drone at a place at a moment, a camera
 * at a place at a moment. The findings table keeps the latest one, which
 * is right for a beacon and wrong for a device — a camera seen five
 * hundred times is one camera, seen five hundred times, and the count is
 * the interesting part.
 *
 * So the entities have their own tables: one row per drone, one row per
 * surveillance device, each carrying how many times it has been seen and
 * when it was first and last seen. A finding is a moment; an entity is
 * a thing.
 *
 * The attribution tier is never raised by a sighting. A device that has
 * been seen a hundred times is not a hundred times more certain: a
 * sighting confirms that the device was there, and nothing more.
 */

export interface DroneObservation {
  uasId: string;
  operatorId?: string | null;
  lat: number;
  lon: number;
  altM?: number | null;
  speedMps?: number | null;
  headingDeg?: number | null;
  manufacturer?: string | null;
  observedAt: Date;
}

export interface DeviceObservation {
  /** The device's own id, e.g. `flock:aa:bb:cc:dd:ee:ff`. */
  id: string;
  mac: string;
  vendor?: string | null;
  deviceClass: string;
  lat: number;
  lon: number;
  /** How sure the platform is, 0 to 100. */
  confidenceScore: number;
  observedAt: Date;
  properties?: Record<string, unknown>;
}

/**
 * Record that a drone was seen.
 *
 * The row is the drone's: its last known position, and when it was last
 * seen. The count of sightings is not here — that is what the findings
 * table is for.
 */
export async function recordDrone(
  tenantId: string,
  observation: DroneObservation,
): Promise<void> {
  const db = getDb();
  if (!db) return;

  const id = `rid:${observation.uasId}`;
  const existing = await db
    .select({ id: drones.id })
    .from(drones)
    .where(and(eq(drones.id, id), eq(drones.tenantId, tenantId)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(drones)
      .set({
        operatorId: observation.operatorId ?? null,
        lat: observation.lat,
        lon: observation.lon,
        altM: observation.altM ?? null,
        speedMps: observation.speedMps ?? null,
        headingDeg: observation.headingDeg ?? null,
        manufacturer: observation.manufacturer ?? null,
        lastSeen: observation.observedAt,
      })
      .where(eq(drones.id, id));
    return;
  }

  await db.insert(drones).values({
    id,
    tenantId,
    uasId: observation.uasId,
    operatorId: observation.operatorId ?? null,
    lat: observation.lat,
    lon: observation.lon,
    altM: observation.altM ?? null,
    speedMps: observation.speedMps ?? null,
    headingDeg: observation.headingDeg ?? null,
    manufacturer: observation.manufacturer ?? null,
    observedAt: observation.observedAt,
    lastSeen: observation.observedAt,
  });
}

/**
 * Record that a device was seen.
 *
 * A device that is seen again is the same device: the row is updated,
 * the observation count goes up, and the first time it was seen is kept.
 * A sighting confirms that the device was there; it does not make the
 * attribution any stronger, so the tier is only ever set, never raised
 * by repetition.
 */
export async function recordDeviceObservation(
  tenantId: string,
  observation: DeviceObservation,
): Promise<void> {
  const db = getDb();
  if (!db) return;

  const existing = await db
    .select({
      id: surveillanceDevices.id,
      observations: surveillanceDevices.observations,
      firstSeen: surveillanceDevices.firstSeen,
      attribution: surveillanceDevices.attribution,
    })
    .from(surveillanceDevices)
    .where(
      and(
        eq(surveillanceDevices.id, observation.id),
        eq(surveillanceDevices.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    await db
      .update(surveillanceDevices)
      .set({
        lat: observation.lat,
        lon: observation.lon,
        // The count goes up; the first sighting is kept. The last one is
        // now, and the score is the last sighting's — the attribution
        // tier is a judgement about the source and is not raised by
        // repetition.
        observations: (row.observations ?? 0) + 1,
        confidenceScore: observation.confidenceScore,
        lastSeen: observation.observedAt,
        properties: observation.properties ?? {},
      })
      .where(eq(surveillanceDevices.id, observation.id));
    return;
  }

  await db.insert(surveillanceDevices).values({
    id: observation.id,
    tenantId,
    mac: observation.mac,
    vendor: observation.vendor ?? null,
    deviceClass: observation.deviceClass,
    lat: observation.lat,
    lon: observation.lon,
    confidenceScore: observation.confidenceScore,
    observations: 1,
    firstSeen: observation.observedAt,
    lastSeen: observation.observedAt,
    properties: observation.properties ?? {},
  });
}

/** The drones a tenant has seen, most recently seen first. */
export async function listDrones(tenantId: string, limit = 200) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(drones)
    .where(eq(drones.tenantId, tenantId))
    .orderBy(sql`${drones.lastSeen} DESC`)
    .limit(Math.min(Math.max(limit, 1), 1000));
}

/** The surveillance devices a tenant has seen, most recently seen first. */
export async function listDevices(tenantId: string, limit = 500) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(surveillanceDevices)
    .where(eq(surveillanceDevices.tenantId, tenantId))
    .orderBy(sql`${surveillanceDevices.lastSeen} DESC`)
    .limit(Math.min(Math.max(limit, 1), 1000));
}
