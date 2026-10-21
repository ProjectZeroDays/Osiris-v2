import "server-only";
import type { AdapterContext, SecurityFinding } from "../../types";
import { licenseFor, sourceProperties } from "../../licenses";

/** The terms of a source, as the shared registry records them. */
function termsFor(source: string): { license: string; attribution: string } {
  const entry = licenseFor(source);
  if (!entry) {
    throw new Error(`LICENSE_UNKNOWN_SOURCE:${source}`);
  }
  return { license: entry.license, attribution: entry.attribution };
}

/**
 * CAP 1.2 — the Common Alerting Protocol.
 *
 * Emergency broadcasts, Amber Alerts, Silver Alerts and Blue Alerts are all
 * CAP documents. They differ only in the `event` field and the `msgType`,
 * so one parser, one adapter and one beacon family serve all of them, and
 * the classification is a discrimination rather than a separate system.
 *
 * The sources are allowlisted. An endpoint the operator names through
 * the environment is accepted; an endpoint the caller names is not.
 */

/**
 * The parts of a source descriptor the parsers use.
 *
 * The parsers are pure functions over a document, so they take a
 * descriptor rather than one of the fixed sources — that is what makes
 * them testable without a network.
 */
export interface CapSourceDescriptor {
  label: string;
  url: string;
  format: "geojson" | "cap";
  license: string;
  attribution: string;
}

/**
 * The emergency alert sources.
 *
 * The licence and the attribution come from the shared registry, so
 * there is one place that says what these sources' terms are, and the
 * document that records them for a reader cannot drift away from what
 * the code actually writes into a finding.
 */
const CAP_SOURCES = {
  nws: {
    label: "NWS",
    url: "https://api.weather.gov/alerts/active",
    format: "geojson" as const,
    ...termsFor("nws"),
  },
  ipaws: {
    label: "IPAWS",
    // IPAWS-OPEN requires a registered COG; many states mirror it.
    url: process.env.IPAWS_URL ?? "https://apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/eas",
    format: "cap" as const,
    ...termsFor("ipaws"),
  },
  state: {
    label: "State EMA",
    url: process.env.STATE_EMA_CAP_URL ?? "",
    format: "cap" as const,
    ...termsFor("state"),
  },
} as const;

export type CapSourceId = keyof typeof CAP_SOURCES;

export const CAP_SOURCE_IDS = Object.keys(CAP_SOURCES) as CapSourceId[];

export type CapStatus = "Actual" | "Exercise" | "Test" | "Draft";
export type CapMsgType = "Alert" | "Update" | "Cancel" | "Ack" | "Error";
export type CapCategory =
  | "Geo" | "Met" | "Safety" | "Security" | "Rescue" | "Fire" | "Health"
  | "Env" | "Transport" | "Infra" | "CBRNE" | "Other";
export type CapUrgency = "Immediate" | "Expected" | "Future" | "Past" | "Unknown";
export type CapSeverity = "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
export type CapCertainty = "Observed" | "Likely" | "Possible" | "Unlikely" | "Unknown";

export interface CapAlert {
  id: string;
  source: CapSourceId;
  identifier: string;
  sender: string;
  sent: string;
  status: CapStatus;
  msgType: CapMsgType;
  event: string;
  category: CapCategory;
  urgency: CapUrgency;
  severity: CapSeverity;
  certainty: CapCertainty;
  headline: string;
  description: string;
  instruction: string | null;
  areaDesc: string;
  lat: number;
  lon: number;
  onset: string | null;
  expires: string | null;
  sourceUrl: string | null;
  /**
   * Who to credit for the source. Not the same thing as the platform's
   * own `attribution` tier, which says how far the platform's own
   * judgement can be trusted. Both are recorded, under their own names.
   */
  sourceAttribution: string;
  license: string;
}

/**
 * The alert families.
 *
 * An Amber Alert is a child abduction; a Silver Alert is a missing
 * vulnerable person; a Blue Alert is a search for a missing adult. They
 * are distinguished by the CAP `event` field, and a document that names
 * none of them is an ordinary alert.
 */
export type AlertFamily = "amber" | "silver" | "blue" | "cap";

export function alertFamily(event: string): AlertFamily {
  const e = event.toLowerCase();
  if (e.includes("child abduction") || e.includes("amber")) return "amber";
  if (e.includes("missing vulnerable") || e.includes("silver")) return "silver";
  if (e.includes("blue alert") || e.includes("missing adult")) return "blue";
  return "cap";
}

const CATEGORIES: CapCategory[] = [
  "Geo", "Met", "Safety", "Security", "Rescue", "Fire", "Health",
  "Env", "Transport", "Infra", "CBRNE", "Other",
];

export function classifyCategory(raw: string): CapCategory {
  const c = raw.trim() as CapCategory;
  return CATEGORIES.includes(c) ? c : "Other";
}

function classifyEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  const v = String(raw ?? "").trim() as T;
  return allowed.includes(v) ? v : fallback;
}

/**
 * Fetch the live alerts.
 *
 * A 429 is reported as a rate limit rather than a generic upstream
 * failure, because the operator's next move is different: wait, rather
 * than change the endpoint.
 */
export async function fetchCapAlerts(
  params: { source?: CapSourceId; bbox?: [number, number, number, number] },
  _ctx: AdapterContext,
): Promise<{ alerts: CapAlert[]; findings: SecurityFinding[] }> {
  const sourceId = params.source ?? "nws";
  if (!CAP_SOURCE_IDS.includes(sourceId)) throw new Error("CAP_UNKNOWN_SOURCE");
  const src = CAP_SOURCES[sourceId];
  if (!src.url) return { alerts: [], findings: [] };

  const res = await fetch(src.url, {
    headers: { accept: src.format === "geojson" ? "application/geo+json" : "application/xml" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429) throw new Error("CAP_RATE_LIMITED");
  if (!res.ok) throw new Error("CAP_UPSTREAM_ERROR");

  const alerts = src.format === "geojson"
    ? parseGeoJsonCap(await res.json(), src, sourceId)
    : parseXmlCap(await res.text(), src, sourceId);

  const kept = params.bbox ? alerts.filter((a) => inBbox(a, params.bbox!)) : alerts;

  return { alerts: kept, findings: capFindings(kept, sourceId) };
}

/**
 * The alerts, as findings.
 *
 * An alert that is only returned is an alert that is only in the
 * response the operator happened to be looking at. A finding is the
 * durable form: it is written to the store, it belongs to a tenant, and
 * it is what the map draws.
 *
 * The beacon kind is the alert's family, so an Amber Alert is an Amber
 * Alert on the map and gets the Amber card — the same `event` field
 * that decides the family is what decides the marker.
 */
export function capFindings(alerts: CapAlert[], sourceId: CapSourceId): SecurityFinding[] {
  const terms = sourceProperties(sourceId);
  return alerts
    // An alert with no place on the map is not a beacon. It is still
    // returned in the response, but a finding without coordinates would
    // be a row that the map tries to draw at the origin.
    //
    // The origin is also the parser's "no point" — a document without
    // one comes back as zero — and zero-zero is in the Gulf of Guinea,
    // so it is left out rather than drawn.
    .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))
    .filter((a) => a.lat !== 0 || a.lon !== 0)
    .map((a) => {
      const family = alertFamily(a.event);
      return {
        // The alert's own identifier, prefixed once. The parser already
        // prefixes the alert's id with the source, so prefixing it
        // again would produce a doubled name and an id nobody can read.
        id: `cap:${sourceId}:${a.identifier || a.id}`,
        toolId: "scanner-feeds" as const,
        assetId: null,
        tenantId: "",
        sourceUrl: a.sourceUrl,
        observedAt: a.sent || null,
        importedAt: new Date().toISOString(),
        severity: capSeverity(a.severity),
        confidence: null,
        // The alert is the authority's own statement about its own
        // area. It is observed, not inferred: the platform did not work
        // it out.
        status: "observed" as const,
        evidenceHash: null,
        retentionUntil: null,
        properties: {
          kind: family === "cap" ? "cap-alert" : `${family}-alert`,
          // The headline is what the map's marker says. Without it the
          // marker says the tool's id, which tells a reader nothing.
          title: a.headline || a.event,
          event: a.event,
          category: a.category,
          urgency: a.urgency,
          severity: a.severity,
          certainty: a.certainty,
          headline: a.headline,
          areaDesc: a.areaDesc,
          onset: a.onset,
          expires: a.expires,
          instruction: a.instruction,
          lat: a.lat,
          lon: a.lon,
          // The platform's own attribution tier: this is the authority
          // speaking, not the platform's judgement.
          attribution: "confirmed",
          // And the source's terms, which are a different thing.
          ...terms,
        },
      };
    });
}

/** A CAP severity, as the platform's own severity scale. */
function capSeverity(s: CapSeverity): SecurityFinding["severity"] {
  switch (s) {
    case "Extreme": return "critical";
    case "Severe": return "high";
    case "Moderate": return "medium";
    case "Minor": return "low";
    default: return null;
  }
}

function parseGeoJsonCap(
  raw: unknown,
  src: CapSourceDescriptor,
  sourceId: CapSourceId,
): CapAlert[] {
  const features = (raw as { features?: unknown[] })?.features ?? [];
  return features.flatMap((f) => {
    const feat = f as { id?: unknown; properties?: Record<string, unknown>; geometry?: unknown };
    const p = feat.properties ?? {};
    const c = centroidOf(feat.geometry);
    if (!c) return [];
    return [{
      id: `cap:${sourceId}:${String(feat.id ?? "")}`,
      source: sourceId,
      identifier: String(feat.id ?? ""),
      sender: String(p.senderName ?? ""),
      sent: String(p.sent ?? new Date().toISOString()),
      status: classifyEnum<CapStatus>(p.status, ["Actual", "Exercise", "Test", "Draft"], "Actual"),
      msgType: classifyEnum<CapMsgType>(p.messageType, ["Alert", "Update", "Cancel", "Ack", "Error"], "Alert"),
      event: String(p.event ?? "Alert").slice(0, 120),
      category: classifyCategory(String(p.category ?? "")),
      urgency: classifyEnum<CapUrgency>(p.urgency, ["Immediate", "Expected", "Future", "Past", "Unknown"], "Unknown"),
      severity: classifyEnum<CapSeverity>(p.severity, ["Extreme", "Severe", "Moderate", "Minor", "Unknown"], "Unknown"),
      certainty: classifyEnum<CapCertainty>(p.certainty, ["Observed", "Likely", "Possible", "Unlikely", "Unknown"], "Unknown"),
      headline: String(p.headline ?? "").slice(0, 500),
      description: String(p.description ?? "").slice(0, 2000),
      instruction: p.instruction ? String(p.instruction).slice(0, 2000) : null,
      areaDesc: String(p.areaDesc ?? "").slice(0, 500),
      lat: c[0], lon: c[1],
      onset: typeof p.onset === "string" ? p.onset : null,
      expires: typeof p.expires === "string" ? p.expires : null,
      sourceUrl: (p["@id"] as string) ?? null,
      sourceAttribution: src.attribution,
      license: src.license,
    }];
  });
}

/**
 * A minimal CAP 1.2 XML reader.
 *
 * CAP is a flat document of `<info>` blocks, each holding a handful of
 * text fields. A full XML parser is not needed for that, and the fields
 * are read with a bounded scan rather than a recursive descent — a
 * document from an upstream is untrusted, and the reader should not be
 * the thing that can be made to work hard.
 */
export function parseXmlCap(
  xml: string,
  src: CapSourceDescriptor,
  sourceId: CapSourceId,
): CapAlert[] {
  const alerts: CapAlert[] = [];
  const infoBlocks = xml.match(/<info\b[\s\S]*?<\/info>/gi) ?? [];

  for (const block of infoBlocks.slice(0, 500)) {
    const identifier = tagText(block, "identifier") || tagText(block, "id");
    const event = tagText(block, "event") || "Alert";
    const headline = tagText(block, "headline");
    const area = tagText(block, "areaDesc");
    const c = xmlCentroid(block);

    const alert: CapAlert = {
      id: `cap:${sourceId}:${identifier || headline || alerts.length}`,
      source: sourceId,
      identifier: identifier,
      sender: tagText(block, "sender"),
      sent: tagText(block, "sent"),
      status: classifyEnum<CapStatus>(tagText(block, "status"), ["Actual", "Exercise", "Test", "Draft"], "Actual"),
      msgType: classifyEnum<CapMsgType>(tagText(block, "msgType"), ["Alert", "Update", "Cancel", "Ack", "Error"], "Alert"),
      event: event.slice(0, 120),
      category: classifyCategory(tagText(block, "category")),
      urgency: classifyEnum<CapUrgency>(tagText(block, "urgency"), ["Immediate", "Expected", "Future", "Past", "Unknown"], "Unknown"),
      severity: classifyEnum<CapSeverity>(tagText(block, "severity"), ["Extreme", "Severe", "Moderate", "Minor", "Unknown"], "Unknown"),
      certainty: classifyEnum<CapCertainty>(tagText(block, "certainty"), ["Observed", "Likely", "Possible", "Unlikely", "Unknown"], "Unknown"),
      headline: headline.slice(0, 500),
      description: tagText(block, "description").slice(0, 2000),
      instruction: tagText(block, "instruction") ? tagText(block, "instruction").slice(0, 2000) : null,
      areaDesc: area.slice(0, 500),
      lat: c[0],
      lon: c[1],
      onset: tagText(block, "onset") || null,
      expires: tagText(block, "expires") || null,
      sourceUrl: null,
      sourceAttribution: src.attribution,
      license: src.license,
    };

    alerts.push(alert);
  }

  return alerts;
}

/** The text of the first `<tag>` in the block. */
function tagText(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
}

/** The first `<point><lat>..</lat><lon>..</lon></point>` in the block. */
function xmlCentroid(block: string): [number, number] {
  const lat = tagText(block, "lat");
  const lon = tagText(block, "lon");
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return [0, 0];
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return [0, 0];
  return [la, lo];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** The centroid of a GeoJSON geometry, or null when there is not one. */
export function centroidOf(geom: unknown): [number, number] | null {
  const g = geom as { type?: string; coordinates?: unknown } | null;
  if (!g?.type) return null;
  if (g.type === "Point") {
    const c = g.coordinates as [number, number];
    return Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? [c[1], c[0]] : null;
  }
  if (g.type === "Polygon") {
    const ring = (g.coordinates as [number, number][][])?.[0];
    if (!Array.isArray(ring) || ring.length === 0) return null;
    const lat = ring.reduce((a, c) => a + c[1], 0) / ring.length;
    const lon = ring.reduce((a, c) => a + c[0], 0) / ring.length;
    return [lat, lon];
  }
  return null;
}

function inBbox(a: { lat: number; lon: number }, bbox: [number, number, number, number]): boolean {
  const [south, west, north, east] = bbox;
  return a.lat >= south && a.lat <= north && a.lon >= west && a.lon <= east;
}
