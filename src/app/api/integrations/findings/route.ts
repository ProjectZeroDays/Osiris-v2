import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client.server";
import { findings } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context.server";
import { BEACONS } from "@/lib/map/beacons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The detections, as map records.
 *
 * A finding becomes a beacon only if it says where it is. A finding with
 * coordinates is a place on the map; a finding without them is a row in a
 * table, and the map is not the place for it.
 *
 * The kind is derived from the tool, and a finding whose kind has no
 * registered beacon is left out rather than drawn as a generic dot —
 * a marker that means nothing is worse than no marker.
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
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200)));
  const toolFilter = url.searchParams.get("tool");
  /**
   * The map's feed asks for the findings that have a place on it. A
   * finding with no coordinates is a row, not a beacon, so it is not
   * placed on the map — but it is still a finding, and a caller asking
   * for the findings wants it. `?geospatial=0` asks for all of them.
   */
  const geospatialOnly = url.searchParams.get("geospatial") !== "0";

  const db = getDb();
  if (!db) {
    // No database: there is no durable finding store to read from.
    return NextResponse.json(
      { ok: true, type: "FeatureCollection", features: [], database: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const rows = await db
    .select()
    .from(findings)
    .where(
      // The tenant always. The tool only when the caller asked for one:
      // a caller asking for "the findings" wants all of them, and a
      // query that quietly matched nothing would be a silent lie.
      toolFilter
        ? and(eq(findings.tenantId, auth.tenantId), eq(findings.toolId, toolFilter))
        : eq(findings.tenantId, auth.tenantId),
    )
    .orderBy(desc(findings.importedAt))
    .limit(limit);

  // Every finding, whether or not it has a place on the map.
  const all = rows.map((f) => ({
    id: f.id,
    toolId: f.toolId,
    tenantId: f.tenantId,
    status: f.status,
    severity: f.severity,
    confidence: f.confidence,
    evidenceHash: f.evidenceHash,
    observedAt: f.observedAt ? f.observedAt.toISOString() : null,
    importedAt: f.importedAt.toISOString(),
    retentionUntil: f.retentionUntil ? f.retentionUntil.toISOString() : null,
    sourceUrl: f.sourceUrl,
    properties: (f.properties ?? {}) as Record<string, unknown>,
  }));

  const features = rows
    .map((f) => {
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const lat = Number(props.lat);
      const lon = Number(props.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      const kind = String(props.kind ?? props.beaconKind ?? "security-finding");
      if (!BEACONS[kind]) return null;

      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [lon, lat] },
        properties: {
          kind,
          title: String(props.title ?? f.toolId),
          severity: f.severity,
          confidence: f.confidence,
          status: f.status,
          // Whether anybody checked this, and which code produced it.
          attribution: props.attribution ?? null,
          verified: props.verified ?? null,
          toolSha256: f.evidenceHash,
          observedAt: props.observedAt ?? f.observedAt,
          importedAt: f.importedAt.toISOString(),
          sourceUrl: f.sourceUrl,
          toolId: f.toolId,
          ...props,
        },
      };
    })
    .filter(Boolean);

  return NextResponse.json(
    {
      ok: true,
      type: "FeatureCollection",
      features: geospatialOnly
        ? features
        : all.map((f) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [0, 0] },
            properties: f.properties,
            finding: f,
          })),
      findings: all,
      count: all.length,
      mapped: features.length,
      database: true,
    },
    { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
