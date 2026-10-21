import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context.server";
import { listDevices, listDrones } from "@/lib/integrations/device-registry.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The things the sensors have seen.
 *
 * A finding is a moment: this camera, at this place, at this time. This
 * is the camera — one row, however many times it has been seen, carrying
 * how many times and when it was first and last seen.
 *
 * The distinction is the whole point. A camera seen four hundred times is
 * one camera seen four hundred times, and a card that says so is a
 * different card from one that says "seen once". A drone that keeps
 * coming back to the same place is a pattern, and the pattern is only
 * visible against the drone's own history.
 *
 * The tenant is the caller's own, taken from the session and never from
 * the request: these are the positions of real cameras and real people,
 * and they are not public information.
 */
export async function GET(req: Request) {
  const auth = await getAuthContext();
  if (!auth.authenticated || !auth.tenantId) {
    return NextResponse.json(
      { ok: false, errorCode: "INTEGRATION_UNAUTHENTICATED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") ?? 500)));
  const kind = url.searchParams.get("kind") ?? "all";

  const wantsDrones = kind === "all" || kind === "drones";
  const wantsDevices = kind === "all" || kind === "devices";

  const [drones, devices] = await Promise.all([
    wantsDrones ? listDrones(auth.tenantId, limit) : Promise.resolve([]),
    wantsDevices ? listDevices(auth.tenantId, limit) : Promise.resolve([]),
  ]);

  return NextResponse.json(
    {
      ok: true,
      kind,
      drones: drones.map((d) => ({
        id: d.id,
        uasId: d.uasId,
        operatorId: d.operatorId,
        lat: d.lat,
        lon: d.lon,
        altM: d.altM,
        speedMps: d.speedMps,
        headingDeg: d.headingDeg,
        manufacturer: d.manufacturer,
        observedAt: d.observedAt.toISOString(),
        lastSeen: d.lastSeen.toISOString(),
      })),
      devices: devices.map((d) => ({
        id: d.id,
        mac: d.mac,
        vendor: d.vendor,
        deviceClass: d.deviceClass,
        attribution: d.attribution,
        lat: d.lat,
        lon: d.lon,
        confidenceScore: d.confidenceScore,
        observations: d.observations,
        firstSeen: d.firstSeen.toISOString(),
        lastSeen: d.lastSeen.toISOString(),
        properties: d.properties ?? {},
      })),
      counts: { drones: drones.length, devices: devices.length },
    },
    { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
