import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";
import { z } from "zod";

/**
 * User-owned camera feeds.
 *
 * Only the operator's own cameras. There is no public catalogue behind
 * this, and no proxy that could be pointed at somebody else's feed.
 */

const FeedSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(256),
  url: z.string().url().max(2048),
  embedUrl: z.string().url().max(2048).optional(),
  region: z.string().max(128).optional(),
  lat: z.number().finite().min(-90).max(90).optional(),
  lon: z.number().finite().min(-180).max(180).optional(),
  provider: z.string().max(64).optional(),
  streamType: z.enum(["iframe", "hls", "mjpeg"]).optional(),
});

const FeedsSchema = z.object({ feeds: z.array(FeedSchema).max(500) });

export interface CameraFeed {
  id: string;
  label: string;
  url: string;
  embedUrl?: string;
  region?: string;
  lat?: number;
  lon?: number;
  provider?: string;
  streamType?: "iframe" | "hls" | "mjpeg";
}

export async function listFeeds(payload: unknown, ctx: AdapterContext) {
  const parsed = FeedsSchema.safeParse(payload);
  if (!parsed.success) throw new Error("FEED_INVALID_CONFIG");

  const findings: SecurityFinding[] = parsed.data.feeds
    .filter((f) => f.lat !== undefined && f.lon !== undefined)
    .map((f) => ({
      id: `feed:${f.id}`,
      toolId: "camera-feed",
      assetId: ctx.assetId ?? null,
      tenantId: ctx.tenantId,
      sourceUrl: f.url,
      observedAt: null,
      importedAt: new Date().toISOString(),
      severity: null,
      confidence: 0.95,
      status: "observed",
      evidenceHash: null,
      retentionUntil: null,
      properties: {
        kind: "camera-feed",
        label: f.label,
        url: f.url,
        region: f.region ?? null,
        lat: f.lat ?? null,
        lon: f.lon ?? null,
        provider: f.provider ?? null,
        streamType: f.streamType ?? null,
      },
    }));

  return { feeds: parsed.data.feeds, findings, count: findings.length };
}

/**
 * The embed player for a feed.
 *
 * The embed URL is returned as data for the caller to render, not fetched
 * and re-served: the platform does not proxy somebody's video.
 */
export async function embedPlayer(payload: unknown, ctx: AdapterContext) {
  const p = payload as { feed?: CameraFeed };
  if (!p?.feed?.url) throw new Error("FEED_INVALID_REQUEST");

  const feed = p.feed;
  return {
    kind: feed.streamType ?? "iframe",
    src: feed.embedUrl ?? feed.url,
    title: feed.label,
    region: feed.region ?? null,
    lat: feed.lat ?? null,
    lon: feed.lon ?? null,
  };
}
