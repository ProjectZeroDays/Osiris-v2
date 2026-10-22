import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";
import { fetchCapAlerts, type CapAlert } from "./alerts/cap.server";
import { sourceProperties } from "../licenses";

/**
 * Scanner and radio feeds.
 *
 * Public-safety radio is a live public record, and the feeds that carry
 * it are all allowlisted: Broadcastify, OpenMHz, and a direct Icecast or
 * Shoutcast station the operator names. An arbitrary stream URL is never
 * accepted — a proxy that would fetch anything would be a proxy that
 * fetches anything.
 */

export const SCANNER_SOURCES = {
  broadcastify: {
    label: "Broadcastify",
    kind: "aggregator" as const,
    docs: "https://www.broadcastify.com/",
    needsKey: true,
  },
  openmhz: {
    label: "OpenMHz",
    kind: "aggregator" as const,
    docs: "https://openmhz.com/",
    needsKey: false,
  },
  icecast: {
    label: "Icecast/Shoutcast station",
    kind: "direct" as const,
    docs: "https://icecast.org/",
    needsKey: false,
  },
  cap: {
    label: "CAP emergency alerts",
    kind: "alert" as const,
    docs: "https://docs.oasis-open.org/emergency/cap/",
    needsKey: false,
  },
} as const;

export type ScannerSourceId = keyof typeof SCANNER_SOURCES;

export type ScannerService = "police" | "fire" | "ems" | "aircraft" | "rail" | "other";

export interface ScannerFeed {
  id: string;
  source: ScannerSourceId;
  /**
   * The directory's terms, recorded with the record.
   *
   * A directory of other people's streams is not the platform's to
   * redistribute, and a record that does not say where it came from
   * cannot be cleared. The terms are written onto every feed rather
   * than held once here, because the feed is what travels.
   */
  license: string;
  sourceAttribution: string;
  shareAlike: boolean;
  label: string;
  agency: string | null;
  service: ScannerService;
  streamUrl: string;
  callsUrl: string | null;
  lat: number | null;
  lon: number | null;
  county: string | null;
  state: string | null;
  status: "live" | "offline" | "unknown";
  listeners: number | null;
  lastChecked: string;
}

/** The service a feed carries, read from what the directory says. */
export function classifyService(raw: string | undefined): ScannerService {
  if (!raw) return "other";
  const s = String(raw).toLowerCase();
  if (s.includes("police") || s.includes("law")) return "police";
  if (s.includes("fire")) return "fire";
  if (s.includes("ems") || s.includes("medical")) return "ems";
  if (s.includes("air") || s.includes("aviation")) return "aircraft";
  if (s.includes("rail") || s.includes("train")) return "rail";
  return "other";
}

/**
 * The Broadcastify directory.
 *
 * Two modes: the public directory, which needs no key, and the Calls
 * API, which needs one. The query shape is fixed; the caller supplies a
 * state and a service and nothing else.
 */
export async function listBroadcastifyFeeds(
  params: { state?: string; service?: ScannerService },
  _ctx: AdapterContext,
): Promise<{ feeds: ScannerFeed[] }> {
  const key = process.env.BROADCASTIFY_API_KEY;
  const base = key
    ? "https://api.broadcastify.com/feeds"
    : "https://www.broadcastify.com/listen/";

  const qs = new URLSearchParams();
  if (params.state) qs.set("state", params.state);
  if (params.service) qs.set("service", params.service);
  if (key) qs.set("key", key);

  const res = await fetch(`${base}?${qs}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("BROADCASTIFY_UPSTREAM_ERROR");
  const raw = (await res.json()) as { feeds?: unknown[] };

  return {
    feeds: (raw.feeds ?? []).slice(0, 2000).flatMap((f) => {
      const feed = f as Record<string, unknown>;
      const label = String(feed.descr ?? feed.name ?? "Unknown feed").slice(0, 200);
      return [{
        id: `scanner:broadcastify:${String(feed.id ?? label)}`,
        // The directory's terms, recorded with the record. A directory
        // of other people's streams is not the platform's to
        // redistribute, and a record that does not say where it came
        // from cannot be cleared. The terms are written onto every feed
        // rather than held once in the adapter, because the feed is
        // what travels.
        ...sourceProperties("broadcastify"),
        label,
        agency: (feed.agency as string) ?? null,
        service: classifyService((feed.service as string) ?? (feed.descr as string)),
        streamUrl: String(feed.streamUrl ?? feed.url ?? ""),
        callsUrl: (feed.callsUrl as string) ?? null,
        lat: typeof feed.lat === "number" ? feed.lat : null,
        lon: typeof feed.lon === "number" ? feed.lon : null,
        county: (feed.county as string) ?? null,
        state: (feed.state as string) ?? null,
        status: feed.status === "live" ? "live" : "unknown",
        listeners: typeof feed.listeners === "number" ? feed.listeners : null,
        lastChecked: new Date().toISOString(),
      }];
    }),
  };
}

/** The OpenMHz systems directory — community-run, no key. */
export async function listOpenMhzSystems(_p: unknown, _ctx: AdapterContext) {
  const res = await fetch("https://api.openmhz.com/systems", { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("OPENMHZ_UPSTREAM_ERROR");
  const raw = (await res.json()) as { systems?: unknown[] };

  return {
    feeds: (raw.systems ?? []).slice(0, 500).flatMap((s) => {
      const sys = s as Record<string, unknown>;
      const id = String(sys.id ?? "");
      return [{
        id: `scanner:openmhz:${id}`,
        // The directory's terms, recorded with the record.
        ...sourceProperties("openmhz"),
        label: String(sys.name ?? id).slice(0, 200),
        agency: (sys.agency as string) ?? null,
        service: "other" as const,
        streamUrl: String(sys.streamUrl ?? `https://api.openmhz.com/${id}/stream`),
        callsUrl: `https://api.openmhz.com/${id}/calls`,
        lat: typeof sys.lat === "number" ? sys.lat : null,
        lon: typeof sys.lon === "number" ? sys.lon : null,
        county: (sys.county as string) ?? null,
        state: (sys.state as string) ?? null,
        status: "live" as const,
        listeners: null,
        lastChecked: new Date().toISOString(),
      }];
    }),
  };
}

/**
 * The live emergency alerts, from the CAP adapter.
 *
 * The findings come back with them, because an alert that is only in
 * the response is an alert that is only in the response: the durable
 * form is what the map draws and what the store keeps.
 */
export async function fetchCapFeed(
  params: { source?: "nws" | "ipaws" | "state"; bbox?: [number, number, number, number] },
  ctx: AdapterContext,
): Promise<{ alerts: CapAlert[]; findings: SecurityFinding[] }> {
  // v13/v15 — fully connected to CAP feed (NWS/IPAWS/state)
  const result = fetchCapAlerts(params, ctx);
  return result;
}

/**
 * A direct stream the operator named.
 *
 * The URL is checked against an allowlist of the hosts a radio station
 * actually runs on, so the stream route cannot be pointed at anything
 * else.
 */
const ALLOWED_STREAM_HOSTS = new Set([
  "icecast.org", "www.icecast.org",
  "openmhz.com", "api.openmhz.com",
  "broadcastify.com", "www.broadcastify.com",
  "stream.theplaylist.net", "radio.live24.se",
]);

export function isAllowedStreamHost(url: string): boolean {
  try {
    return ALLOWED_STREAM_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export async function importFeedList(payload: unknown, _ctx: AdapterContext) {
  const p = payload as { feeds?: ScannerFeed[] };
  if (!p?.feeds || !Array.isArray(p.feeds)) throw new Error("SCANNER_INVALID_FEED_LIST");

  const feeds = p.feeds.slice(0, 2000).filter((f) => {
    if (!f?.streamUrl) return false;
    return isAllowedStreamHost(f.streamUrl);
  });

  return { feeds, dropped: p.feeds.length - feeds.length };
}
