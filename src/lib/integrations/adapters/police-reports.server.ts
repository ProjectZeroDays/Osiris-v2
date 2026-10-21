import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";

/**
 * Police incident and dispatch reports.
 *
 * There is no single global feed. Every city publishes its own, through
 * one of a handful of open-data platforms, and the set of portals
 * changes with every municipal budget. So the hosts are allowlisted and
 * the adapter is per-jurisdiction by construction.
 *
 * An incident report is a record of something that happened to somebody.
 * It is public, but the person at the centre of it is not, so the
 * description is kept short and the address is kept to the block.
 */

export const REPORT_SOURCES = {
  socrata: {
    label: "Socrata open data",
    kind: "api" as const,
    docs: "https://dev.socrata.com/",
  },
  ckan: {
    label: "CKAN open data",
    kind: "api" as const,
    docs: "https://ckan.org/",
  },
  arcgis: {
    label: "ArcGIS FeatureServer",
    kind: "api" as const,
    docs: "https://developers.arcgis.com/rest/",
  },
  cad: {
    label: "CAD/RMS export",
    kind: "import" as const,
    docs: "",
  },
} as const;

export type ReportSourceId = keyof typeof REPORT_SOURCES;

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export interface PoliceIncident {
  id: string;
  source: ReportSourceId;
  jurisdiction: string;
  kind: string;
  severity: IncidentSeverity;
  lat: number; lon: number;
  occurredAt: string;
  reportedAt: string;
  address: string | null;
  description: string | null;
  sourceUrl: string | null;
}

/** The open-data portals the platform is willing to talk to. */
const ALLOWED_SOCRATA_HOSTS = new Set([
  "data.cityofchicago.org",
  "data.seattle.gov",
  "data.sfgov.org",
  "data.cityofnewyork.us",
  "data.lacity.org",
  "data.austintexas.gov",
  "data.boston.gov",
  "data.phila.gov",
  "data.dc.gov",
  "data.cityofnewark.com",
]);

const ALLOWED_ARCGIS_HOSTS = new Set([
  "services.arcgis.com",
  "gisdata-csrwd.hub.arcgis.com",
  "opendata.arcgis.com",
]);

/**
 * How serious an incident looks, from the category the report uses.
 *
 * This is a reading of a label, not a judgement. A call that a
 * jurisdiction filed as "theft" is a theft; the platform does not
 * upgrade it because the label is less dramatic than what happened.
 */
export function classifySeverity(kind: string): IncidentSeverity {
  const k = kind.toLowerCase();
  if (k.includes("homicide") || k.includes("shots") || k.includes("robbery") || k.includes("rape")) return "critical";
  if (k.includes("assault") || k.includes("burglary") || k.includes("arson") || k.includes("stabbing")) return "high";
  if (k.includes("theft") || k.includes("vehicle") || k.includes("vandal")) return "medium";
  return "low";
}

export async function fetchSocrataIncidents(
  params: { host: string; datasetId: string; since?: string; limit?: number },
  _ctx: AdapterContext,
): Promise<{ incidents: PoliceIncident[] }> {
  if (!ALLOWED_SOCRATA_HOSTS.has(params.host)) throw new Error("SOCRATA_HOST_NOT_ALLOWED");
  if (!/^[a-z0-9-]{2,64}$/i.test(params.datasetId)) throw new Error("SOCRATA_INVALID_DATASET");

  const limit = Math.min(params.limit ?? 1000, 5000);
  const where = params.since
    ? `?$where=reported_date>'${encodeURIComponent(params.since)}'&$limit=${limit}`
    : `?$limit=${limit}`;
  const url = `https://${params.host}/resource/${params.datasetId}.json${where}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error("SOCRATA_UPSTREAM_ERROR");
  const raw = (await res.json()) as unknown[];

  return {
    incidents: raw.flatMap((r) => {
      const row = r as Record<string, unknown>;
      const loc = (row.location ?? row.geom ?? row.point) as
        | { latitude?: unknown; longitude?: unknown }
        | undefined;
      const lat = typeof loc?.latitude === "string" ? parseFloat(loc.latitude) : Number(loc?.latitude);
      const lon = typeof loc?.longitude === "string" ? parseFloat(loc.longitude) : Number(loc?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

      const kind = String(row.primary_type ?? row.type ?? row.offense ?? "unknown").slice(0, 80);
      const caseNumber = String(row.case_number ?? row.id ?? "");

      return [{
        id: `socrata:${params.host}:${caseNumber || Math.random().toString(36).slice(2)}`,
        source: "socrata" as const,
        jurisdiction: params.host.split(".")[1] ?? params.host,
        kind,
        severity: classifySeverity(kind),
        lat, lon,
        occurredAt: String(row.date ?? row.occurred_date ?? row.reported_date ?? new Date().toISOString()),
        reportedAt: String(row.reported_date ?? new Date().toISOString()),
        address: String(row.block ?? row.address ?? "").slice(0, 200) || null,
        description: String(row.description ?? "").slice(0, 500) || null,
        sourceUrl: `https://${params.host}/resource/${params.datasetId}.json?case_number=${encodeURIComponent(caseNumber)}`,
      }];
    }),
  };
}

export async function fetchArcgisIncidents(
  params: { host: string; layerPath: string; since?: string; limit?: number },
  _ctx: AdapterContext,
): Promise<{ incidents: PoliceIncident[] }> {
  if (!ALLOWED_ARCGIS_HOSTS.has(params.host)) throw new Error("ARCGIS_HOST_NOT_ALLOWED");
  if (!/^[A-Za-z0-9_/-]{2,128}$/.test(params.layerPath)) throw new Error("ARCGIS_INVALID_LAYER");

  const limit = Math.min(params.limit ?? 1000, 5000);
  const where = params.since ? `&where=reported_date>'${encodeURIComponent(params.since)}'` : "";
  const url = `https://${params.host}/${params.layerPath}/query?f=geojson&outSR=4326&resultRecordCount=${limit}${where}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error("ARCGIS_UPSTREAM_ERROR");
  const j = (await res.json()) as { features?: unknown[] };

  return {
    incidents: (j.features ?? []).flatMap((f) => {
      const feat = f as { geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> };
      const coords = feat.geometry?.coordinates;
      const lon = Number(coords?.[0]);
      const lat = Number(coords?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
      const p = feat.properties ?? {};
      const kind = String(p.type ?? p.offense ?? "unknown").slice(0, 80);

      return [{
        id: `arcgis:${String(p.OBJECTID ?? p.id ?? Math.random().toString(36).slice(2))}`,
        source: "arcgis" as const,
        jurisdiction: params.host.split(".")[0],
        kind,
        severity: classifySeverity(kind),
        lat, lon,
        occurredAt: String(p.date ?? p.reported_date ?? new Date().toISOString()),
        reportedAt: String(p.reported_date ?? new Date().toISOString()),
        address: String(p.address ?? "").slice(0, 200) || null,
        description: String(p.description ?? "").slice(0, 500) || null,
        sourceUrl: null,
      }];
    }),
  };
}

/**
 * A CAD export brought in as a file.
 *
 * The export is the jurisdiction's own record, and the import is
 * recorded like any other.
 */
export async function importCadReport(payload: unknown, ctx: AdapterContext) {
  const p = payload as { jurisdiction?: string; incidents?: unknown[] };
  if (!p?.incidents || !Array.isArray(p.incidents)) throw new Error("CAD_INVALID_REPORT");

  const jurisdiction = String(p.jurisdiction ?? "unknown").slice(0, 128);

  const findings: SecurityFinding[] = p.incidents.slice(0, 5000).flatMap((raw) => {
    const i = raw as Record<string, unknown>;
    const lat = Number(i.lat ?? i.latitude);
    const lon = Number(i.lon ?? i.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const kind = String(i.kind ?? i.type ?? "unknown").slice(0, 80);
    const severity = classifySeverity(kind);

    return [{
      id: `cad:${jurisdiction}:${String(i.id ?? Math.random().toString(36).slice(2))}`,
      toolId: "police-reports",
      assetId: ctx.assetId ?? null,
      tenantId: ctx.tenantId,
      sourceUrl: null,
      observedAt: String(i.occurredAt ?? new Date().toISOString()),
      importedAt: new Date().toISOString(),
      severity: severity === "critical" ? "critical" : severity,
      confidence: null,
      status: "observed",
      evidenceHash: null,
      retentionUntil: null,
      properties: {
        kind: `police-${severity}`,
        incidentKind: kind,
        jurisdiction,
        lat, lon,
        address: String(i.address ?? "").slice(0, 200) || null,
        description: String(i.description ?? "").slice(0, 500) || null,
        attribution: "heuristic",
        // A jurisdiction's own record, under that jurisdiction's own
        // terms. The terms vary per dataset, so the finding names the
        // portal and carries the obligation rather than a licence
        // nobody checked.
        source: "socrata",
        license: "Varies per dataset",
        sourceAttribution: "The publishing jurisdiction",
        shareAlike: false,
      },
    }];
  });

  return { findings, count: findings.length };
}
