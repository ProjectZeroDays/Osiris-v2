/**
 * The universal popup card.
 *
 * One card renders every beacon's details, driven by a schema per entity
 * kind. The card does not know what a Flock camera is; the schema does.
 * A field that is missing from the data shows as a dash rather than
 * disappearing, so the shape of the card stays the same between two
 * detections of the same kind.
 */

export type PopupFormat = "date" | "coord" | "pct" | "link" | "text";

export interface PopupField {
  key: string;
  label: string;
  format?: PopupFormat;
  /** Hidden when the value is missing, rather than shown as a dash. */
  optional?: boolean;
}

export interface PopupAction {
  label: string;
  /** The integration capability the action calls. */
  capability: string;
}

export interface PopupSchema {
  title: (p: Record<string, unknown>) => string;
  subtitle?: (p: Record<string, unknown>) => string;
  fields: PopupField[];
  actions?: PopupAction[];
  /** A link out, when the detection has one worth opening. */
  linkTo?: (p: Record<string, unknown>) => string | null;
}

const str = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v);

export const POPUP_SCHEMAS: Record<string, PopupSchema> = {
  "flock-camera": {
    title: (p) => str(p.vendor) || "Unknown camera",
    subtitle: (p) => (p.mac ? `MAC ${str(p.mac)}` : ""),
    fields: [
      { key: "confidence", label: "Confidence", format: "pct" },
      { key: "band", label: "Band" },
      { key: "method", label: "Method" },
      { key: "firstSeen", label: "First seen", format: "date" },
      { key: "lastSeen", label: "Last seen", format: "date" },
      { key: "observations", label: "Observations" },
    ],
    actions: [{ label: "HIBF lookup", capability: "hibf.lookupMac" }],
    linkTo: (p) => {
      const url = (p.hibfMatch as { url?: string } | undefined)?.url;
      return typeof url === "string" ? url : null;
    },
  },

  drone: {
    title: (p) => `Drone ${str(p.uasId)}`,
    subtitle: (p) => (p.manufacturer ? str(p.manufacturer) : "Unknown make"),
    fields: [
      { key: "altM", label: "Altitude (m)" },
      { key: "speedMps", label: "Speed (m/s)" },
      { key: "headingDeg", label: "Heading" },
      { key: "observedAt", label: "Observed", format: "date" },
    ],
    actions: [{ label: "Show track", capability: "rid.exportTrack" }],
  },

  "drone-operator": {
    title: (p) => `Operator ${str(p.operatorId)}`,
    subtitle: () => "Remote ID operator",
    fields: [
      { key: "altM", label: "Altitude (m)" },
      { key: "lastSeen", label: "Last seen", format: "date" },
    ],
  },

  surveillance: {
    title: (p) => str(p.deviceClass) || "Surveillance device",
    subtitle: (p) => (p.vendor ? str(p.vendor) : ""),
    fields: [
      { key: "attribution", label: "Attribution" },
      { key: "confidenceScore", label: "Confidence", format: "pct" },
      { key: "observations", label: "Observations" },
      { key: "lastSeen", label: "Last seen", format: "date" },
    ],
  },

  "wifi-ap": {
    title: (p) => str(p.ssid) || "<hidden>",
    subtitle: (p) => (p.bssid ? `BSSID ${str(p.bssid)}` : ""),
    fields: [
      { key: "security", label: "Security" },
      { key: "channel", label: "Channel" },
      { key: "band", label: "Band" },
      { key: "wps", label: "WPS" },
      { key: "signalDbm", label: "Signal (dBm)" },
    ],
    actions: [{ label: "Show captures", capability: "wifi.importCracked" }],
  },

  "plate-hit": {
    title: (p) => str(p.plate) || "Plate read",
    subtitle: (p) => (p.vehicle ? str(p.vehicle) : ""),
    fields: [
      { key: "confidence", label: "Confidence", format: "pct" },
      { key: "observedAt", label: "Observed", format: "date" },
      { key: "source", label: "Source" },
    ],
  },

  "camera-feed": {
    title: (p) => str(p.label) || "Camera feed",
    subtitle: (p) => (p.region ? str(p.region) : ""),
    fields: [
      { key: "provider", label: "Provider" },
      { key: "updatedAt", label: "Updated", format: "date" },
    ],
    linkTo: (p) => (typeof p.url === "string" ? p.url : null),
  },

  "security-finding": {
    title: (p) => str(p.title) || "Finding",
    subtitle: (p) => {
      // Where the finding came from, and whether anybody checked it. A
      // tool's assertion is not the platform's fact, and the card says
      // which it is.
      const tool = str(p.tool);
      const attribution = str(p.attribution);
      const bits = [];
      if (tool) bits.push(`from ${tool}`);
      if (attribution) bits.push(attribution);
      return bits.join(" · ");
    },
    fields: [
      { key: "severity", label: "Severity" },
      { key: "status", label: "Status" },
      { key: "confidence", label: "Confidence", format: "pct" },
      { key: "verified", label: "Verified" },
      { key: "toolSha256", label: "Tool hash" },
      { key: "importedAt", label: "Imported", format: "date" },
    ],
  },

  // v13/v15 -- public-safety radio.
  "scanner-police": {
    title: (p) => str(p.label) || "Police feed",
    subtitle: (p) => [p.agency, p.county, p.state].filter(Boolean).join(" · "),
    fields: [
      { key: "service", label: "Service" },
      { key: "status", label: "Status" },
      { key: "listeners", label: "Listeners" },
      { key: "lastChecked", label: "Last checked", format: "date" },
    ],
  },
  "scanner-fire": {
    title: (p) => str(p.label) || "Fire feed",
    subtitle: (p) => [p.agency, p.county, p.state].filter(Boolean).join(" · "),
    fields: [
      { key: "service", label: "Service" },
      { key: "status", label: "Status" },
      { key: "listeners", label: "Listeners" },
      { key: "lastChecked", label: "Last checked", format: "date" },
    ],
  },
  "scanner-ems": {
    title: (p) => str(p.label) || "EMS feed",
    subtitle: (p) => [p.agency, p.county, p.state].filter(Boolean).join(" · "),
    fields: [
      { key: "service", label: "Service" },
      { key: "status", label: "Status" },
      { key: "listeners", label: "Listeners" },
      { key: "lastChecked", label: "Last checked", format: "date" },
    ],
  },
  "scanner-other": {
    title: (p) => str(p.label) || "Radio feed",
    subtitle: (p) => [p.agency, p.county, p.state].filter(Boolean).join(" · "),
    fields: [
      { key: "service", label: "Service" },
      { key: "status", label: "Status" },
      { key: "lastChecked", label: "Last checked", format: "date" },
    ],
  },

  // Emergency broadcasts. The family decides which card it is.
  //
  // The source and its licence are on the card. An alert is a public
  // record, and a public record that is passed on has to say where it
  // came from and under what terms — the terms are the source's, and
  // the card is where a reader sees them.
  "cap-alert": {
    title: (p) => str(p.event) || "Alert",
    subtitle: (p) => str(p.areaDesc),
    fields: [
      { key: "severity", label: "Severity" },
      { key: "urgency", label: "Urgency" },
      { key: "certainty", label: "Certainty" },
      { key: "onset", label: "Onset", format: "date" },
      { key: "expires", label: "Expires", format: "date" },
      { key: "headline", label: "Headline" },
      { key: "source", label: "Source" },
      { key: "license", label: "Licence" },
      { key: "sourceAttribution", label: "Attribution" },
    ],
  },
  "amber-alert": {
    title: (p) => str(p.event) || "Amber Alert",
    subtitle: (p) => str(p.areaDesc),
    fields: [
      { key: "severity", label: "Severity" },
      { key: "urgency", label: "Urgency" },
      { key: "onset", label: "Onset", format: "date" },
      { key: "expires", label: "Expires", format: "date" },
      { key: "headline", label: "Headline" },
      { key: "instruction", label: "Instruction" },
      { key: "source", label: "Source" },
      { key: "license", label: "Licence" },
      { key: "sourceAttribution", label: "Attribution" },
    ],
  },
  "silver-alert": {
    title: (p) => str(p.event) || "Silver Alert",
    subtitle: (p) => str(p.areaDesc),
    fields: [
      { key: "severity", label: "Severity" },
      { key: "urgency", label: "Urgency" },
      { key: "headline", label: "Headline" },
      { key: "source", label: "Source" },
      { key: "license", label: "Licence" },
      { key: "sourceAttribution", label: "Attribution" },
    ],
  },
  "blue-alert": {
    title: (p) => str(p.event) || "Blue Alert",
    subtitle: (p) => str(p.areaDesc),
    fields: [
      { key: "severity", label: "Severity" },
      { key: "urgency", label: "Urgency" },
      { key: "headline", label: "Headline" },
      { key: "source", label: "Source" },
      { key: "license", label: "Licence" },
      { key: "sourceAttribution", label: "Attribution" },
    ],
  },

  // Cell infrastructure.
  "imsi-anomaly": {
    title: (p) => `Possible catcher — ${str(p.anomalyKind) || "anomaly"}`,
    subtitle: (p) => str(p.cellId),
    fields: [
      { key: "confidence", label: "Confidence", format: "pct" },
      { key: "observedAt", label: "Observed", format: "date" },
      { key: "notes", label: "Notes" },
    ],
  },
  "cell-tower": {
    title: (p) => `${str(p.radio) || "Unknown"} cell`,
    subtitle: (p) => `${str(p.mcc)}/${str(p.mnc)} · LAC ${str(p.lac)} · CID ${str(p.cid)}`,
    fields: [
      { key: "rangeM", label: "Range (m)" },
      { key: "samples", label: "Samples" },
      { key: "updatedAt", label: "Updated", format: "date" },
    ],
  },

  // Police incidents.
  "police-low": {
    title: (p) => str(p.incidentKind) || "Incident",
    subtitle: (p) => str(p.address) || str(p.jurisdiction),
    fields: [
      { key: "severity", label: "Severity" },
      { key: "occurredAt", label: "Occurred", format: "date" },
      { key: "description", label: "Description" },
    ],
    linkTo: (p) => (typeof p.sourceUrl === "string" ? p.sourceUrl : null),
  },
  "police-medium": {
    title: (p) => str(p.incidentKind) || "Incident",
    subtitle: (p) => str(p.address) || str(p.jurisdiction),
    fields: [
      { key: "severity", label: "Severity" },
      { key: "occurredAt", label: "Occurred", format: "date" },
      { key: "description", label: "Description" },
    ],
    linkTo: (p) => (typeof p.sourceUrl === "string" ? p.sourceUrl : null),
  },
  "police-high": {
    title: (p) => str(p.incidentKind) || "Incident",
    subtitle: (p) => str(p.address) || str(p.jurisdiction),
    fields: [
      { key: "severity", label: "Severity" },
      { key: "occurredAt", label: "Occurred", format: "date" },
      { key: "description", label: "Description" },
    ],
    linkTo: (p) => (typeof p.sourceUrl === "string" ? p.sourceUrl : null),
  },
  "police-critical": {
    title: (p) => str(p.incidentKind) || "Incident",
    subtitle: (p) => str(p.address) || str(p.jurisdiction),
    fields: [
      { key: "severity", label: "Severity" },
      { key: "occurredAt", label: "Occurred", format: "date" },
      { key: "reportedAt", label: "Reported", format: "date" },
      { key: "description", label: "Description" },
    ],
    linkTo: (p) => (typeof p.sourceUrl === "string" ? p.sourceUrl : null),
  },
};

/** The schema for a kind, or null when the kind has no card. */
export function popupSchema(kind: string): PopupSchema | null {
  return POPUP_SCHEMAS[kind] ?? null;
}

/**
 * Format one field's value.
 *
 * A missing value is a dash, not an empty cell, and not a "null" or
 * "undefined" that leaked out of the data.
 */
export function formatPopupValue(value: unknown, format?: PopupFormat): string {
  if (value === null || value === undefined || value === "") return "—";

  switch (format) {
    case "date": {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
    }
    case "coord": {
      const lat = Number((value as { lat?: unknown })?.lat);
      const lon = Number((value as { lon?: unknown })?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "—";
      return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    }
    case "pct": {
      const n = Number(value);
      if (!Number.isFinite(n)) return "—";
      // A score already in 0-1 is shown as a percentage; one already in
      // 0-100 is left alone.
      const pct = n <= 1 ? n * 100 : n;
      return `${Math.round(pct)}%`;
    }
    case "link": {
      const url = String(value);
      return url.replace(/^https?:\/\//, "").slice(0, 60);
    }
    default:
      return String(value);
  }
}
