import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client.server";
import { devices } from "@/db/schema";

export interface DeviceContext {
  deviceId: string;
  tenantId: string;
  allowedTools: string[];
}

/**
 * Device identity for sensor push feeds.
 *
 * A browser session says who is looking. It says nothing about whether a
 * box on a rooftop is allowed to push a Remote ID frame. A device proves
 * itself with a shared secret; the platform stores only its hash and
 * compares in constant time.
 *
 * A secret that never changes is a secret that eventually leaks and
 * cannot be replaced without breaking the device. So a secret can be
 * rotated: the new one takes effect at once, and the old one keeps
 * working for a grace window, long enough for a sensor to be told the
 * new one and short enough that a leaked secret stops working.
 */
export function hashDeviceSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** A fresh secret, for provisioning a device. Shown once and never again. */
export function generateDeviceSecret(): string {
  return randomBytes(32).toString("hex");
}

/**
 * How long the previous secret keeps working after a rotation.
 *
 * A sensor pushes every few seconds and is usually somewhere awkward, so
 * the window is generous: long enough for a device to be told the new
 * secret and to come back with it, short enough that a secret that
 * leaked before the rotation is not still working a day later.
 */
export const PREVIOUS_SECRET_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Resolve the device behind a request.
 *
 * Header: `X-OSIRIS-Device: <deviceId>:<secret>`.
 *
 * The comparison is constant-time so a caller cannot learn the stored hash
 * by timing how long the rejection took. The previous secret is compared
 * the same way, and only while the grace window is open.
 */
export async function resolveDevice(req: Request): Promise<DeviceContext | null> {
  const raw = req.headers.get("x-osiris-device");
  if (!raw) return null;

  const sep = raw.indexOf(":");
  if (sep <= 0) return null;
  const deviceId = raw.slice(0, sep);
  const secret = raw.slice(sep + 1);
  if (!deviceId || !secret) return null;

  const db = getDb();
  if (!db) return null;

  const [row] = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  if (!row) return null;

  if (!secretMatches(secret, row.secretHash)) {
    // The old secret, if the rotation is still inside its grace window.
    if (
      !row.previousSecretHash ||
      !secretMatches(secret, row.previousSecretHash) ||
      !withinGraceWindow(row.secretRotatedAt)
    ) {
      return null;
    }
  }

  await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, deviceId));
  return { deviceId: row.id, tenantId: row.tenantId, allowedTools: row.allowedTools ?? [] };
}

/** A constant-time comparison of a secret against a stored hash. */
function secretMatches(secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashDeviceSecret(secret), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Whether a rotation is still inside its grace window. */
function withinGraceWindow(rotatedAt: Date | null): boolean {
  if (!rotatedAt) return false;
  const age = Date.now() - rotatedAt.getTime();
  return age >= 0 && age < PREVIOUS_SECRET_GRACE_MS;
}

export function deviceAllowsTool(d: DeviceContext, tool: string): boolean {
  return d.allowedTools.includes(tool) || d.allowedTools.includes("*");
}

/** A device, as an operator sees it. Never the secret. */
export interface DeviceSummary {
  id: string;
  label: string;
  tenantId: string;
  allowedTools: string[];
  lastSeenAt: string | null;
  createdAt: string;
  /** When the secret was last rotated, if it was. */
  secretRotatedAt: string | null;
  /** When the previous secret stops working, if there is one. */
  previousSecretValidUntil: string | null;
}

/** A device and the secret it is provisioned with. The secret is shown once. */
export interface DeviceWithSecret extends DeviceSummary {
  /** Shown once. The platform keeps only its hash. */
  secret: string;
}

/** The devices a tenant has. */
export async function listDevices(tenantId: string): Promise<DeviceSummary[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(devices)
    .where(eq(devices.tenantId, tenantId))
    .orderBy(devices.createdAt);

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    tenantId: r.tenantId,
    allowedTools: r.allowedTools ?? [],
    lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    secretRotatedAt: r.secretRotatedAt ? r.secretRotatedAt.toISOString() : null,
    previousSecretValidUntil: previousSecretValidUntil(r),
  }));
}

/**
 * Create a device.
 *
 * The secret is returned once and never again: the platform keeps only
 * its hash, so it cannot show it a second time. A caller that loses it
 * rotates.
 */
export async function createDevice(input: {
  id: string;
  tenantId: string;
  label: string;
  allowedTools?: string[];
}): Promise<DeviceWithSecret | null> {
  const db = getDb();
  if (!db) return null;

  const secret = generateDeviceSecret();
  const now = new Date();
  await db.insert(devices).values({
    id: input.id,
    tenantId: input.tenantId,
    label: input.label,
    secretHash: hashDeviceSecret(secret),
    allowedTools: input.allowedTools ?? [],
    createdAt: now,
  });

  return {
    id: input.id,
    label: input.label,
    tenantId: input.tenantId,
    allowedTools: input.allowedTools ?? [],
    lastSeenAt: null,
    createdAt: now.toISOString(),
    secretRotatedAt: null,
    previousSecretValidUntil: null,
    secret,
  };
}

/**
 * Rotate a device's secret.
 *
 * The new secret takes effect at once. The old one keeps working until
 * the grace window ends, so a device that has not been told yet is not
 * silenced by the rotation.
 *
 * The secret is returned once, for the same reason it is on creation.
 */
export async function rotateDeviceSecret(
  deviceId: string,
  tenantId: string,
): Promise<DeviceWithSecret | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.tenantId, tenantId)))
    .limit(1);
  if (!row) return null;

  const secret = generateDeviceSecret();
  const now = new Date();
  await db
    .update(devices)
    .set({
      secretHash: hashDeviceSecret(secret),
      previousSecretHash: row.secretHash,
      secretRotatedAt: now,
    })
    .where(and(eq(devices.id, deviceId), eq(devices.tenantId, tenantId)));

  return {
    id: row.id,
    label: row.label,
    tenantId: row.tenantId,
    allowedTools: row.allowedTools ?? [],
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    secretRotatedAt: now.toISOString(),
    previousSecretValidUntil: new Date(
      now.getTime() + PREVIOUS_SECRET_GRACE_MS,
    ).toISOString(),
    secret,
  };
}

/** When the previous secret stops working, if there is one. */
function previousSecretValidUntil(row: {
  previousSecretHash: string | null;
  secretRotatedAt: Date | null;
}): string | null {
  if (!row.previousSecretHash || !row.secretRotatedAt) return null;
  return new Date(
    row.secretRotatedAt.getTime() + PREVIOUS_SECRET_GRACE_MS,
  ).toISOString();
}
