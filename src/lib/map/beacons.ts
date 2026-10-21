/**
 * The beacon registry.
 *
 * Every tool that produces a geospatial entity gets one kind of marker, and
 * every marker opens a card. The kinds are declared here so the map, the
 * windows, and the cards all agree on what a "flock-camera" looks like
 * without any of them knowing about the others.
 *
 * A beacon is a claim about the world, and its colour is part of the claim:
 * red is a surveillance device we are fairly sure of, cyan is a live drone
 * whose position is a moment old, and everything is drawn with a glow so it
 * reads on both the dark and the satellite basemap.
 */

export type BeaconShape = "pin" | "circle" | "diamond" | "hex" | "triangle" | "square";

export interface BeaconStyle {
  shape: BeaconShape;
  color: string;
  glow?: string;
  /** The sprite id. Doubles as the icon name in the popup card. */
  icon: string;
  size: number;
  /** Drawn with a slow pulse — for entities that move. */
  pulse?: boolean;
  /** A human label for the kind, used in the card and in legends. */
  label: string;
}

export const BEACONS: Record<string, BeaconStyle> = {
  "flock-camera": {
    shape: "hex", color: "#ef4444", glow: "#7f1d1d", icon: "cam",
    size: 18, label: "Surveillance camera",
  },
  "drone": {
    shape: "triangle", color: "#22d3ee", glow: "#0e7490", icon: "drone",
    size: 20, pulse: true, label: "Drone",
  },
  "drone-operator": {
    shape: "circle", color: "#06b6d4", glow: "#0e7490", icon: "person",
    size: 14, label: "Drone operator",
  },
  "surveillance": {
    shape: "square", color: "#f59e0b", glow: "#78350f", icon: "eye",
    size: 16, label: "Surveillance device",
  },
  "wifi-ap": {
    shape: "diamond", color: "#3b82f6", glow: "#1e3a8a", icon: "wifi",
    size: 16, label: "Wireless access point",
  },
  "plate-hit": {
    shape: "pin", color: "#a855f7", glow: "#581c87", icon: "plate",
    size: 18, label: "Plate read",
  },
  "camera-feed": {
    shape: "circle", color: "#10b981", glow: "#064e3b", icon: "video",
    size: 16, label: "Camera feed",
  },
  "security-finding": {
    shape: "pin", color: "#d4af37", glow: "#8b7325", icon: "shield",
    size: 16, label: "Security finding",
  },

  // v13/v15 -- public-safety radio. The colour is the service, so a
  // police feed and a fire feed are separable at a glance.
  "scanner-police": {
    shape: "circle", color: "#1d4ed8", glow: "#1e3a8a", icon: "radio",
    size: 16, pulse: true, label: "Police radio feed",
  },
  "scanner-fire": {
    shape: "circle", color: "#dc2626", glow: "#7f1d1d", icon: "flame",
    size: 16, pulse: true, label: "Fire radio feed",
  },
  "scanner-ems": {
    shape: "circle", color: "#059669", glow: "#064e3b", icon: "cross",
    size: 16, pulse: true, label: "EMS radio feed",
  },
  "scanner-other": {
    shape: "circle", color: "#7c3aed", glow: "#4c1d95", icon: "radio",
    size: 14, label: "Radio feed",
  },

  // Emergency broadcasts. An Amber Alert is the one that has to be
  // seen, so it is the largest and the hottest.
  "cap-alert": {
    shape: "hex", color: "#f59e0b", glow: "#78350f", icon: "alert",
    size: 20, pulse: true, label: "Emergency alert",
  },
  "amber-alert": {
    shape: "hex", color: "#f59e0b", glow: "#78350f", icon: "alert",
    size: 24, pulse: true, label: "Amber Alert",
  },
  "silver-alert": {
    shape: "hex", color: "#64748b", glow: "#334155", icon: "alert",
    size: 20, pulse: true, label: "Silver Alert",
  },
  "blue-alert": {
    shape: "hex", color: "#2563eb", glow: "#1e3a8a", icon: "alert",
    size: 20, pulse: true, label: "Blue Alert",
  },

  // Cell infrastructure and the anomalies against it.
  "cell-tower": {
    shape: "triangle", color: "#64748b", glow: "#334155", icon: "tower",
    size: 12, label: "Cell tower",
  },
  "imsi-anomaly": {
    shape: "hex", color: "#f43f5e", glow: "#881337", icon: "alert",
    size: 18, pulse: true, label: "Possible IMSI catcher",
  },

  // Police incidents, coloured by severity.
  "police-low": {
    shape: "circle", color: "#22c55e", glow: "#14532d", icon: "shield",
    size: 12, label: "Incident (low)",
  },
  "police-medium": {
    shape: "circle", color: "#eab308", glow: "#713f12", icon: "shield",
    size: 14, label: "Incident (medium)",
  },
  "police-high": {
    shape: "circle", color: "#f97316", glow: "#7c2d12", icon: "shield",
    size: 16, label: "Incident (high)",
  },
  "police-critical": {
    shape: "circle", color: "#dc2626", glow: "#7f1d1d", icon: "shield",
    size: 18, pulse: true, label: "Incident (critical)",
  },
};

/** The kinds that carry a live, moving position. */
export const LIVE_BEACON_KINDS = Object.entries(BEACONS)
  .filter(([, s]) => s.pulse)
  .map(([k]) => k);

/** The style for a kind, or null when the kind is not registered. */
export function beaconStyle(kind: string): BeaconStyle | null {
  return BEACONS[kind] ?? null;
}

/**
 * How sure we are of a detection.
 *
 * A raw signal — a MAC address, a single frame — is a heuristic. Matching
 * it against a known signature makes it probable. Seeing it twice, or
 * seeing a device confirm its own presence, makes it confirmed. The tier is
 * carried with the detection and shown wherever the detection is shown.
 */
export type AttributionTier = "confirmed" | "probable" | "heuristic";

export const ATTRIBUTION_LABEL: Record<AttributionTier, string> = {
  confirmed: "Confirmed",
  probable: "Probable",
  heuristic: "Heuristic",
};

export const ATTRIBUTION_TONE: Record<AttributionTier, "ok" | "warn" | "muted"> = {
  confirmed: "ok",
  probable: "warn",
  heuristic: "muted",
};
