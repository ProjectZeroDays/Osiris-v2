import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";
import { z } from "zod";

/**
 * Wifite3 — the wireless tool.
 *
 * This is the one tool in the registry that transmits. A scan may send
 * deauth frames and attempt WPS PINs, which can knock a neighbour's
 * device off the network. So the split matters: the imports are passive
 * files that anyone may bring, and only `wifi.requestScan` triggers the
 * tool, and only with the consent attestation in hand.
 *
 * The binary itself is never run by the platform — the operator's host
 * runs it, with a monitor-mode interface, and the results come back as
 * files. `WIFITE_BIN` names the binary the operator has installed, and
 * it is recorded, not executed here.
 */

export type WifiSecurity =
  | "open" | "wep" | "wpa" | "wpa2" | "wpa3" | "wpa2-enterprise" | "unknown";

export type HandshakeKind = "wpa-handshake" | "pmkid" | "wep-ivs" | "wps-pin";

const AP_SCHEMA = z.object({
  bssid: z.string().min(6).max(32),
  ssid: z.string().max(64).nullable().optional(),
  channel: z.number().int().min(1).max(200).nullable().optional(),
  band: z.enum(["2.4", "5", "6"]).nullable().optional(),
  security: z.enum(["open", "wep", "wpa", "wpa2", "wpa3", "wpa2-enterprise", "unknown"]).optional(),
  wps: z.boolean().optional(),
  signalDbm: z.number().finite().nullable().optional(),
  firstSeen: z.string().max(64).optional(),
  lastSeen: z.string().max(64).optional(),
  observations: z.number().int().min(0).optional(),
  lat: z.number().finite().min(-90).max(90).nullable().optional(),
  lon: z.number().finite().min(-180).max(180).nullable().optional(),
  sourceDevice: z.string().max(64).optional(),
});

const CAPTURE_SCHEMA = z.object({
  bssid: z.string().min(6).max(32),
  kind: z.enum(["wpa-handshake", "pmkid", "wep-ivs", "wps-pin"]),
  capturedAt: z.string().max(64).optional(),
  filePath: z.string().max(512).nullable().optional(),
  cracked: z.boolean().optional(),
  passphrase: z.string().max(128).nullable().optional(),
  crackedBy: z.string().max(64).nullable().optional(),
  confidence: z.number().finite().nullable().optional(),
});

export async function listInterfaces(_payload: unknown, _ctx: AdapterContext) {
  const bin = process.env.WIFITE_BIN;
  if (!bin) {
    return {
      ok: false,
      reason: "WIFITE_NOT_CONFIGURED",
      interfaces: [],
      note: "Set WIFITE_BIN to the binary the operator has installed, and pass a monitor-mode interface into the container.",
    };
  }
  return {
    ok: true,
    binary: bin,
    variant: process.env.WIFITE_VARIANT ?? "upstream",
    interfaces: [],
    note: "Interfaces are enumerated on the operator's host, where the monitor-mode card lives.",
  };
}

export async function requestScan(payload: unknown, ctx: AdapterContext) {
  const p = payload as { target?: string };
  if (!p?.target) throw new Error("WIFI_INVALID_SCAN");

  const bin = process.env.WIFITE_BIN;
  if (!bin) throw new Error("WIFITE_NOT_CONFIGURED");

  /* The scan is requested, not performed here. The platform records the
     request and hands back what the operator's host should run. */
  return {
    ok: true,
    requested: true,
    target: p.target,
    binary: bin,
    variant: process.env.WIFITE_VARIANT ?? "upstream",
    command: `${bin} --target ${p.target}`,
    warning:
      "This transmits: a scan may deauthenticate nearby devices and attempt WPS PINs. Run it only on a network you are authorised to assess.",
  };
}

export async function importCapture(payload: unknown, ctx: AdapterContext) {
  const parsed = CAPTURE_SCHEMA.safeParse(payload);
  if (!parsed.success) throw new Error("WIFI_INVALID_CAPTURE");
  const c = parsed.data;

  const finding: SecurityFinding = {
    id: `wifi-cap:${c.bssid}:${c.kind}:${c.capturedAt ?? "unknown"}`,
    toolId: "wifite3",
    assetId: ctx.assetId ?? null,
    tenantId: ctx.tenantId,
    sourceUrl: null,
    observedAt: c.capturedAt ?? null,
    importedAt: new Date().toISOString(),
    severity: null,
    confidence: c.confidence ?? null,
    status: "observed",
    evidenceHash: null,
    retentionUntil: null,
    properties: {
      kind: "wifi-capture",
      bssid: c.bssid,
      captureKind: c.kind,
      capturedAt: c.capturedAt ?? null,
      filePath: c.filePath ?? null,
      cracked: c.cracked ?? false,
      crackedBy: c.crackedBy ?? null,
      // The passphrase is a secret. It is not stored in the finding; the
      // record says a key was recovered and points at the operator's file.
      passphrasePresent: Boolean(c.passphrase),
    },
  };

  return { findings: [finding] };
}

export async function importCracked(payload: unknown, ctx: AdapterContext) {
  const p = payload as { aps?: unknown[]; captures?: unknown[] };
  const aps = Array.isArray(p?.aps) ? p.aps : [];
  const captures = Array.isArray(p?.captures) ? p.captures : [];

  const findings: SecurityFinding[] = [];
  for (const raw of aps) {
    const parsed = AP_SCHEMA.safeParse(raw);
    if (!parsed.success) continue;
    const a = parsed.data;
    findings.push({
      id: `wifi:${a.bssid}`,
      toolId: "wifite3",
      assetId: ctx.assetId ?? null,
      tenantId: ctx.tenantId,
      sourceUrl: null,
      observedAt: a.firstSeen ?? null,
      importedAt: new Date().toISOString(),
      severity: null,
      confidence: null,
      status: "observed",
      evidenceHash: null,
      retentionUntil: null,
      properties: {
        kind: "wifi-ap",
        bssid: a.bssid,
        ssid: a.ssid ?? null,
        channel: a.channel ?? null,
        band: a.band ?? null,
        security: a.security ?? "unknown",
        wps: a.wps ?? false,
        signalDbm: a.signalDbm ?? null,
        firstSeen: a.firstSeen ?? null,
        lastSeen: a.lastSeen ?? null,
        observations: a.observations ?? 1,
        lat: a.lat ?? null,
        lon: a.lon ?? null,
        sourceDevice: a.sourceDevice ?? null,
      },
    });
  }

  for (const raw of captures) {
    const one = await importCapture(raw, ctx);
    findings.push(...one.findings);
  }

  return { findings, count: findings.length };
}

export async function exportReport(payload: unknown, ctx: AdapterContext) {
  const { findings } = await importCracked(payload, ctx);
  return {
    format: "osiris-wifi-report",
    version: 1,
    exportedAt: new Date().toISOString(),
    aps: findings
      .filter((f) => f.properties.kind === "wifi-ap")
      .map((f) => f.properties),
    captures: findings
      .filter((f) => f.properties.kind === "wifi-capture")
      .map((f) => f.properties),
  };
}
