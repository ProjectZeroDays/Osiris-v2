import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";
import { sourceProperties, type SourceId } from "../licenses";

/**
 * Cell towers and IMSI-catcher anomalies.
 *
 * A tower's location is public knowledge — OpenCellID and BeaconDB
 * publish it. What is not public is an *anomaly*: a serving cell that
 * does not belong, a sudden LAC change, a drop to 2G where LTE was
 * expected. Those are heuristics, and they are labelled as such. A
 * device that looks like a catcher usually is not one, and the platform
 * says "possible" rather than naming a villain.
 */

export interface CellTower {
  id: string;
  mcc: number; mnc: number; lac: number; cid: number;
  lat: number; lon: number;
  radio: "GSM" | "UMTS" | "LTE" | "NR" | "unknown";
  rangeM: number | null;
  samples: number;
  updatedAt: string;
  source: "opencellid" | "beacondb" | "observed";
}

export interface ImsiAnomaly {
  id: string;
  kind: "unknown-cell" | "lac-change" | "2g-downgrade" | "cid-collision" | "power-anomaly";
  lat: number; lon: number;
  observedAt: string;
  confidence: number;
  cellId: string | null;
  notes: string;
}

export interface CellObservation {
  mcc: number; mnc: number; lac: number; cid: number;
  lat: number; lon: number;
  radio?: string;
  signal?: number;
  observedAt: string;
}

/**
 * The known tower database.
 *
 * OpenCellID needs a key; BeaconDB is open. The bounding box is checked
 * before the request goes out, so a caller cannot ask for the whole
 * world.
 */
export async function fetchTowers(
  params: { bbox: [number, number, number, number]; radio?: CellTower["radio"] },
  _ctx: AdapterContext,
): Promise<{ towers: CellTower[] }> {
  const [s, w, n, e] = params.bbox;
  if (![s, w, n, e].every((v) => Number.isFinite(v))) throw new Error("CELL_INVALID_BBOX");
  if (s > n || w > e) throw new Error("CELL_INVALID_BBOX");

  const key = process.env.OPENCELLID_KEY;
  const url = key
    ? `https://opencellid.org/cell/getInArea?key=${key}&BBOX=${s},${w},${n},${e}&format=json`
    : "https://api.beacondb.net/v1/geolocate";

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error("CELL_UPSTREAM_ERROR");
  const raw = (await res.json()) as { cells?: unknown[] };

  return {
    towers: (raw.cells ?? []).slice(0, 5000).flatMap((c) => {
      const cell = c as Record<string, unknown>;
      if (typeof cell.lat !== "number" || typeof cell.lon !== "number") return [];
      const radio = String(cell.radio ?? "unknown").toUpperCase();
      if (params.radio && radio !== params.radio) return [];
      const known = ["GSM", "UMTS", "LTE", "NR"] as const;
      return [{
        id: `cell:${cell.mcc}-${cell.mnc}-${cell.lac}-${cell.cellid ?? cell.cid}`,
        mcc: Number(cell.mcc), mnc: Number(cell.mnc),
        lac: Number(cell.lac), cid: Number(cell.cellid ?? cell.cid),
        lat: cell.lat, lon: cell.lon,
        radio: (known as readonly string[]).includes(radio)
          ? (radio as CellTower["radio"])
          : "unknown",
        rangeM: typeof cell.range === "number" ? cell.range : null,
        samples: typeof cell.samples === "number" ? cell.samples : 1,
        updatedAt: String(cell.updated ?? new Date().toISOString()),
        source: key ? "opencellid" : "beacondb",
      }];
    }),
  };
}

/**
 * Flag the anomalies in an observed set of cell scans.
 *
 * Every rule here is a heuristic, and each carries the confidence it
 * deserves. None of them is a detection of a catcher; they are the
 * things worth a second look.
 */
export async function ingestCellScan(
  payload: { observations?: CellObservation[] },
  ctx: AdapterContext,
): Promise<{ anomalies: ImsiAnomaly[]; findings: SecurityFinding[] }> {
  const observations = payload?.observations ?? [];
  if (!Array.isArray(observations)) throw new Error("CELL_INVALID_OBSERVATIONS");

  // Where the tower data came from, and therefore what its terms are.
  // The observation is the operator's own — a scan of a cell the operator
  // can see — but the tower it is compared against is published data, and
  // a finding that is compared against OpenCellID's towers inherits
  // their share-alike clause when it is handed on. The finding says so,
  // so the question can be answered later without going back to the
  // adapter.
  const towerSource: SourceId = process.env.OPENCELLID_KEY ? "opencellid" : "beacondb";
  const towerTerms = sourceProperties(towerSource);

  const anomalies: ImsiAnomaly[] = [];
  const seen = new Set<string>();

  for (const o of observations) {
    if (![o.mcc, o.mnc, o.lac, o.cid, o.lat, o.lon].every((v) => Number.isFinite(v))) {
      continue;
    }
    const cellId = `${o.mcc}-${o.mnc}-${o.lac}-${o.cid}`;

    // A 2G serving cell where LTE was expected is the classic pattern.
    if (o.radio === "GSM") {
      anomalies.push({
        id: `anom:2g:${cellId}:${o.observedAt}`,
        kind: "2g-downgrade", lat: o.lat, lon: o.lon,
        observedAt: o.observedAt, confidence: 0.6,
        cellId,
        notes: "GSM serving cell while LTE expected — possible catcher",
      });
    }

    // A very strong signal from a cell that should be far away.
    if (typeof o.signal === "number" && o.signal > -50) {
      anomalies.push({
        id: `anom:power:${cellId}:${o.observedAt}`,
        kind: "power-anomaly", lat: o.lat, lon: o.lon,
        observedAt: o.observedAt, confidence: 0.5,
        cellId,
        notes: `Unusually strong signal (${o.signal} dBm)`,
      });
    }

    // The same cell id seen at two places at once cannot be one tower.
    const geoKey = `${cellId}@${o.lat.toFixed(3)},${o.lon.toFixed(3)}`;
    if (seen.has(cellId) && !seen.has(geoKey)) {
      anomalies.push({
        id: `anom:cid:${cellId}:${o.observedAt}`,
        kind: "cid-collision", lat: o.lat, lon: o.lon,
        observedAt: o.observedAt, confidence: 0.45,
        cellId,
        notes: "The same cell id was seen at more than one position",
      });
    }
    seen.add(geoKey);
  }

  const findings: SecurityFinding[] = anomalies.map((a) => ({
    id: a.id,
    toolId: "imsi-catcher",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: a.observedAt,
    importedAt: new Date().toISOString(),
    severity: null,
    confidence: a.confidence,
    // An anomaly is a pattern, not an observation. It is inferred.
    status: "inferred",
    evidenceHash: null,
    retentionUntil: null,
    properties: {
      kind: "imsi-anomaly",
      anomalyKind: a.kind,
      cellId: a.cellId,
      lat: a.lat,
      lon: a.lon,
      notes: a.notes,
      attribution: "heuristic",
      // The tower data the anomaly was judged against, and its terms.
      // The observation is the operator's; the comparison is not, and a
      // record that does not say which is which cannot be cleared for
      // redistribution.
      ...towerTerms,
    },
  }));

  return { anomalies, findings };
}
