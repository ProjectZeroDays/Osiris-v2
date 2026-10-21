import {
  pgTable, text, timestamp, integer, doublePrecision,
  jsonb, index, uniqueIndex, pgEnum,
} from "drizzle-orm/pg-core";

/**
 * The durable record.
 *
 * Everything the platform learns has to survive a restart, has to belong to
 * exactly one tenant, and has to be deletable on a deadline. The in-memory
 * shapes in `src/lib/integrations/types.ts` are the wire format; this is the
 * store. A finding is never written here without a tenant, and never kept
 * past `retentionUntil`.
 */

export const findingStatus = pgEnum("finding_status", ["observed", "inferred", "unverified"]);
export const severity = pgEnum("severity", ["info", "low", "medium", "high", "critical"]);
export const attributionTier = pgEnum("attribution_tier", ["confirmed", "probable", "heuristic"]);

// ── Tenancy + auth ────────────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  email: text("email").notNull(),
  roles: jsonb("roles").$type<string[]>().notNull().default([]),
  /**
   * The password hash, in the scrypt format. Null for a user that signs in
   * by some other means, and null for the first-run account until it is
   * given one.
   */
  passwordHash: text("password_hash"),
  /** Set when the account may not sign in: locked, disabled, or revoked. */
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ emailIdx: uniqueIndex("users_email_idx").on(t.email) }));

/**
 * The sessions.
 *
 * The cookie the browser holds is a random token; what the server stores
 * is its hash. A session row is therefore useless to anyone who reads the
 * table, and a cookie that is stolen cannot be replayed once the session
 * is revoked — which is the whole point of keeping sessions rather than
 * treating a user id in a cookie as a session.
 */
export const sessions = pgTable("sessions", {
  /** The hash of the token, never the token itself. */
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  /** Where the session was made from, for the audit trail. */
  userAgent: text("user_agent"),
  ip: text("ip"),
}, (t) => ({
  userIdx: index("sessions_user_idx").on(t.userId),
  expiryIdx: index("sessions_expiry_idx").on(t.expiresAt),
}));

// ── Asset registry ────────────────────────────────────────────────────────

export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  label: text("label").notNull(),
  /** "host" | "domain" | "camera" | "codebase" | ... */
  kind: text("kind").notNull(),
  identifiers: jsonb("identifiers").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ tenantIdx: index("assets_tenant_idx").on(t.tenantId) }));

// ── Consent attestations ──────────────────────────────────────────────────

export const consents = pgTable("consents", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  actorId: text("actor_id").notNull(),
  /** e.g. "sherlock:controlledHandle.checkSingle" */
  scope: text("scope").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  scopeIdx: index("consents_scope_idx").on(t.tenantId, t.scope),
}));

// ── Device auth (for sensor push mode) ────────────────────────────────────

export const devices = pgTable("devices", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  label: text("label").notNull(),
  secretHash: text("secret_hash").notNull(),
  /**
   * The previous secret's hash, kept for a grace window after a rotation.
   *
   * A secret that changes instantly is a secret that breaks a sensor: the
   * box on the rooftop has to be told the new one, and until it is, it is
   * pushing frames with a secret the platform no longer accepts. So the
   * old one keeps working for a while — long enough for a device to pick
   * the new one up, short enough that a leaked secret stops working.
   */
  previousSecretHash: text("previous_secret_hash"),
  /** When the secret was last rotated. The grace window runs from here. */
  secretRotatedAt: timestamp("secret_rotated_at", { withTimezone: true }),
  allowedTools: jsonb("allowed_tools").$type<string[]>().notNull().default([]),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ tenantIdx: index("devices_tenant_idx").on(t.tenantId) }));

// ── Findings (all tools) ──────────────────────────────────────────────────

export const findings = pgTable("findings", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  toolId: text("tool_id").notNull(),
  assetId: text("asset_id").references(() => assets.id),
  sourceUrl: text("source_url"),
  observedAt: timestamp("observed_at", { withTimezone: true }),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
  severity: severity("severity"),
  confidence: doublePrecision("confidence"),
  status: findingStatus("status").notNull().default("unverified"),
  evidenceHash: text("evidence_hash"),
  retentionUntil: timestamp("retention_until", { withTimezone: true }),
  properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
}, (t) => ({
  tenantToolIdx: index("findings_tenant_tool_idx").on(t.tenantId, t.toolId),
  retentionIdx: index("findings_retention_idx").on(t.retentionUntil),
}));

// ── Surveillance devices (dedup target) ───────────────────────────────────

export const surveillanceDevices = pgTable("surveillance_devices", {
  /** `flock:${mac}:${geohash}` */
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  mac: text("mac").notNull(),
  vendor: text("vendor"),
  deviceClass: text("device_class").notNull(),
  attribution: attributionTier("attribution").notNull().default("heuristic"),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  confidenceScore: integer("confidence_score").notNull().default(0),
  observations: integer("observations").notNull().default(1),
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
  properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
}, (t) => ({
  macGeoIdx: index("surveillance_mac_geo_idx").on(t.mac, t.lat, t.lon),
  tenantIdx: index("surveillance_tenant_idx").on(t.tenantId),
}));

// ── Drone / operator entities ─────────────────────────────────────────────

export const drones = pgTable("drones", {
  /** `rid:${uasId}` */
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  uasId: text("uas_id").notNull(),
  operatorId: text("operator_id"),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  altM: doublePrecision("alt_m"),
  speedMps: doublePrecision("speed_mps"),
  headingDeg: doublePrecision("heading_deg"),
  manufacturer: text("manufacturer"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
}, (t) => ({ tenantIdx: index("drones_tenant_idx").on(t.tenantId) }));

// ── Audit ─────────────────────────────────────────────────────────────────

export const audit = pgTable("integration_audit", {
  id: text("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  tenantId: text("tenant_id"),
  actorId: text("actor_id"),
  deviceId: text("device_id"),
  tool: text("tool").notNull(),
  capability: text("capability").notNull(),
  assetId: text("asset_id"),
  purpose: text("purpose"),
  /** "allow" | "deny" */
  decision: text("decision").notNull(),
  reason: text("reason"),
  resultId: text("result_id"),
}, (t) => ({ atIdx: index("audit_at_idx").on(t.at) }));

// ── Quota counters ────────────────────────────────────────────────────────

export const quotaCounters = pgTable("quota_counters", {
  tenantId: text("tenant_id").notNull(),
  tool: text("tool").notNull(),
  /** YYYY-MM-DD */
  day: text("day").notNull(),
  count: integer("count").notNull().default(0),
  /**
   * What the day's calls have cost, in the unit the provider charges in.
   *
   * A count is a limit; a cost is a bill. They are kept side by side
   * because they are the same row — what the operator has spent of the
   * allowance, and what it cost. `costUnits` is zero for the tools whose
   * capabilities are free, which is most of them.
   */
  costUnits: doublePrecision("cost_units").notNull().default(0),
  /** The unit `costUnits` is in. `free` when the tool costs nothing. */
  costUnit: text("cost_unit").notNull().default("free"),
  /**
   * How many of the day's calls actually reported their usage.
   *
   * A metered provider that dropped the connection and a local model
   * that is free both land as zero tokens in `cost_units`, and the
   * number alone cannot say which. This column says how many of the
   * day's calls reported, so a zero with a `reportedCalls` below
   * `count` is a day that lost some replies rather than a day of free
   * models.
   */
  reportedCalls: integer("reported_calls").notNull().default(0),
}, (t) => ({ pk: uniqueIndex("quota_pk").on(t.tenantId, t.tool, t.day) }));
