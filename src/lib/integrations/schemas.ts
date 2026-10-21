import { z } from "zod";

/**
 * Schemas at every boundary.
 *
 * Anything that arrives from outside the process — an imported report, a
 * decoded network frame, a sensor push, an upstream response — is untrusted
 * until it has been through one of these. A schema that is never applied is
 * a cast, and a cast is a promise the data never made.
 */

const lat = z.number().finite().min(-90).max(90);
const lon = z.number().finite().min(-180).max(180);

/** A finding's severity, with an explicit "we do not know" case. */
export const SeveritySchema = z.enum(["info", "low", "medium", "high", "critical"]);

/** How a finding came to be believed. */
export const FindingStatusSchema = z.enum(["observed", "inferred", "unverified"]);

/**
 * Attribution tier for a detected device. `heuristic` is the default and the
 * only tier a raw signal may carry: a MAC address is a guess about a device,
 * never a fact about one.
 */
export const AttributionTierSchema = z.enum(["confirmed", "probable", "heuristic"]);

// ── Flock / ALPR-style surveillance detections (v7) ──────────────────────

export const FlockDetectionSchema = z.object({
  mac: z.string().min(6).max(64),
  method: z.enum(["wifi", "ble", "subghz", "lora"]).optional(),
  rssi: z.number().finite().optional(),
  channel: z.number().int().min(0).max(200).optional(),
  ssid: z.string().max(128).optional(),
  confidence: z.number().finite().optional(),
  firmware_sig: z.boolean().optional(),
  matched_signatures: z.array(z.string().max(64)).max(32).optional(),
  gps: z.object({ lat, lon }),
  first: z.number().optional(),
  last: z.number().optional(),
  count: z.number().int().min(0).optional(),
  sourceDevice: z.string().max(64),
});

export const FlockIngestSchema = z.object({
  detections: z.array(FlockDetectionSchema).max(5000),
});

// ── Drone Remote ID (v6) ──────────────────────────────────────────────────

export const RidFrameSchema = z.object({
  uasId: z.string().min(1).max(64),
  operatorId: z.string().max(64).optional(),
  drone: z.object({
    lat, lon,
    altM: z.number().finite().optional(),
    speedMps: z.number().finite().optional(),
    headingDeg: z.number().finite().min(0).max(360).optional(),
  }),
  operator: z.object({ lat, lon, altM: z.number().finite().optional() }).optional(),
  rssi: z.number().finite().optional(),
  sourceDevice: z.string().max(64),
});

export const RidIngestSchema = z.object({
  frames: z.array(RidFrameSchema).max(2000),
});

// ── v4 tool report shapes ─────────────────────────────────────────────────

export const ShodanHostSchema = z.object({
  ip_str: z.string().max(64).optional(),
  ports: z.array(z.number().int().min(0).max(65535)).max(256).optional(),
  hostnames: z.array(z.string().max(253)).max(64).optional(),
  org: z.string().max(256).optional(),
  last_update: z.string().max(64).optional(),
});

export const ZenmapReportSchema = z.object({
  hosts: z.array(z.object({
    ip: z.string().min(1).max(64),
    ports: z.array(z.object({
      port: z.number().int().min(0).max(65535),
      service: z.string().max(64).optional(),
    })).max(256).optional(),
  })).max(2000),
});

export const MetasploitReportSchema = z.object({
  findings: z.array(z.object({
    host: z.string().min(1).max(256),
    cve: z.string().max(64).optional(),
    status: z.string().max(64).optional(),
    severity: SeveritySchema.optional(),
  })).max(5000),
});

export const MaltegoGraphSchema = z.object({
  entities: z.array(z.object({
    id: z.string().min(1).max(128),
    type: z.string().max(64),
    value: z.string().max(512),
  })).max(5000),
});

export const SherlockMatchSchema = z.object({
  found: z.array(z.object({
    site: z.string().max(128),
    url: z.string().max(2048),
  })).max(500),
});

export const DedSecCameraConfigSchema = z.object({
  cameras: z.array(z.object({
    id: z.string().min(1).max(128),
    label: z.string().max(256),
    lat: lat.optional(),
    lon: lon.optional(),
  })).max(500),
});

export const ExploitIndexCveSchema = z.object({
  description: z.string().max(4096).optional(),
  references: z.array(z.string().max(2048)).max(64).optional(),
});

export const SpyTvDefenseReportSchema = z.object({
  findings: z.array(z.object({
    id: z.string().min(1).max(128),
    title: z.string().max(512),
    severity: SeveritySchema.optional(),
    cve: z.string().max(64).optional(),
  })).max(2000),
});

export const PagasusAuditSchema = z.object({
  device: z.object({
    model: z.string().max(128).optional(),
    os: z.string().max(128).optional(),
  }).optional(),
  findings: z.array(z.object({
    id: z.string().min(1).max(128),
    title: z.string().max(512),
  })).max(2000),
});

export const RufloSummarySchema = z.object({
  summary: z.string().max(65536),
});

// ── The request envelope for the gated dispatcher ─────────────────────────

/**
 * What a caller may put in the body of a dispatch request.
 *
 * The dispatcher fills in the identity fields from the session; a client
 * cannot claim a tenant, an actor, or an approval it does not hold.
 */
export const IntegrationRequestBodySchema = z.object({
  requestId: z.string().uuid().optional(),
  assetId: z.string().min(1).max(128).optional(),
  consentAttestation: z.boolean().optional(),
  purpose: z.string().min(1).max(1024).optional(),
  approvalId: z.string().min(1).max(128).optional(),
  payload: z.unknown().optional(),
}).strict();

export type IntegrationRequestBody = z.infer<typeof IntegrationRequestBodySchema>;

export type FlockDetection = z.infer<typeof FlockDetectionSchema>;
export type RidFrame = z.infer<typeof RidFrameSchema>;
