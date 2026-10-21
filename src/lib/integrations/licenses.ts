/**
 * The licences of the sources the platform reads.
 *
 * A source's terms are not decoration. Some of them oblige whoever
 * redistributes the data to do something: OpenStreetMap and OpenCellID
 * carry share-alike clauses, and a database derived from either may
 * inherit its licence if it is handed on.
 *
 * So the licence is recorded where the data is read, in the finding
 * itself, and a record that says where it came from travels with it
 * into the database and out through the API. A finding whose source
 * cannot be named cannot be cleared for redistribution, and that is the
 * question this registry exists to answer.
 *
 * The registry is the code's side of the record. The human-readable
 * table is `docs/LICENSES.md`, and a test holds the two together: a
 * source added here without a row in the document, or a row in the
 * document without an entry here, fails the build.
 *
 * Where a licence is not known, the entry says so rather than guessing.
 * "Provider terms" is not a licence, and writing one down as if it were
 * would be worse than saying that the terms have not been read.
 */

/** How a licence obliges whoever redistributes the data. */
export type ShareAlike = "none" | "share-alike" | "attribution";

export interface SourceLicense {
  /** The licence, as the source states it. */
  readonly license: string;
  /** The attribution the source asks for, in the form to display. */
  readonly attribution: string;
  /** What the licence obliges a redistributor to do. */
  readonly obligation: ShareAlike;
  /** Where the terms are stated. */
  readonly url: string;
}

/**
 * The sources the platform reads.
 *
 * The key is the source's own name, and it is what a finding carries in
 * its `source` property. A finding whose source is not in this registry
 * is a finding whose provenance is unrecorded, which the test catches.
 */
export const SOURCE_LICENSES = {
  // ── Cell towers ────────────────────────────────────────────────────────
  opencellid: {
    license: "CC-BY-SA-4.0",
    attribution: "OpenCellID contributors",
    obligation: "share-alike",
    url: "https://opencellid.org/",
  },
  beacondb: {
    license: "CC0-1.0",
    attribution: "BeaconDB",
    obligation: "none",
    url: "https://beacondb.net/",
  },

  // ── Maps and places ─────────────────────────────────────────────────────
  osm: {
    license: "ODbL",
    attribution: "© OpenStreetMap contributors",
    obligation: "share-alike",
    url: "https://www.openstreetmap.org/copyright",
  },
  carto: {
    license: "ODbL (OSM-derived basemap)",
    attribution: "© OpenStreetMap contributors © CARTO",
    obligation: "share-alike",
    url: "https://carto.com/basemaps",
  },

  // ── Emergencies and hazards ─────────────────────────────────────────────
  nws: {
    license: "Public domain",
    attribution: "NOAA / National Weather Service",
    obligation: "attribution",
    url: "https://www.weather.gov/",
  },
  ipaws: {
    license: "Public domain",
    attribution: "FEMA IPAWS",
    obligation: "attribution",
    url: "https://www.fema.gov/emergency-managers/risk-analysis/knowledge-systems/ipaws",
  },
  state: {
    license: "Varies",
    attribution: "State EMA",
    obligation: "attribution",
    url: "",
  },
  usgs: {
    license: "Public domain",
    attribution: "USGS",
    obligation: "attribution",
    url: "https://earthquake.usgs.gov/",
  },
  firms: {
    license: "Public domain",
    attribution: "NASA FIRMS",
    obligation: "attribution",
    url: "https://firms.modaps.eosdis.nasa.gov/",
  },

  // ── Police and civic records ───────────────────────────────────────────
  socrata: {
    license: "Varies per dataset",
    attribution: "The publishing jurisdiction",
    obligation: "attribution",
    url: "https://dev.socrata.com/",
  },
  arcgis: {
    license: "Varies per dataset",
    attribution: "The publishing jurisdiction",
    obligation: "attribution",
    url: "https://developers.arcgis.com/",
  },

  // ── Radio and scanner feeds ────────────────────────────────────────────
  broadcastify: {
    license: "Provider terms",
    attribution: "Broadcastify",
    obligation: "attribution",
    url: "https://www.broadcastify.com/",
  },
  openmhz: {
    license: "Provider terms",
    attribution: "OpenMHz",
    obligation: "attribution",
    url: "https://openmhz.com/",
  },

  // ── Security tools ─────────────────────────────────────────────────────
  shodan: {
    license: "Provider terms (API)",
    attribution: "Shodan",
    obligation: "attribution",
    url: "https://www.shodan.io/",
  },
  haveibeenflocked: {
    license: "Provider terms",
    attribution: "HaveIBeenFlocked",
    obligation: "attribution",
    url: "https://haveibeenflocked.com/",
  },
  "exploit-index": {
    license: "Untrusted metadata; no redistribution",
    attribution: "Exploit-Index",
    obligation: "attribution",
    url: "",
  },
} as const satisfies Record<string, SourceLicense>;

export type SourceId = keyof typeof SOURCE_LICENSES;

/** The licences that oblige a redistributor to do something. */
export const SHARE_ALIKE_SOURCES: readonly SourceId[] = Object.entries(
  SOURCE_LICENSES,
)
  .filter(([, v]) => v.obligation === "share-alike")
  .map(([k]) => k as SourceId);

/** The licence of a source, or null when the source is not registered. */
export function licenseFor(source: string): SourceLicense | null {
  const entry = (SOURCE_LICENSES as Record<string, SourceLicense>)[source];
  return entry ?? null;
}

/**
 * The properties a finding carries about where it came from.
 *
 * A finding that names its source and that source's licence can be
 * cleared for redistribution. A finding that does not can only be
 * asked about.
 *
 * The credit is called `sourceAttribution` and not `attribution`,
 * because `attribution` already means the platform's own confidence
 * tier — how far its own judgement can be trusted. Two different
 * questions deserve two different names: "who do we credit" and "how
 * much should you believe this".
 *
 * The argument is a registered source, so the answer is never missing:
 * a source that is not in the registry is a mistake, and the type says
 * so. The source's type is preserved, so a record built from this still
 * says `broadcastify` rather than `string`.
 */
export function sourceProperties<S extends SourceId>(source: S): {
  source: S;
  license: string;
  sourceAttribution: string;
  shareAlike: boolean;
} {
  const entry = licenseFor(source);
  if (!entry) {
    // The type says this cannot happen. If it does, the registry and
    // the type have drifted apart, and saying so is better than
    // returning a record with no licence on it.
    throw new Error(`LICENSE_UNKNOWN_SOURCE:${source}`);
  }
  return {
    source,
    license: entry.license,
    sourceAttribution: entry.attribution,
    shareAlike: entry.obligation === "share-alike",
  };
}
