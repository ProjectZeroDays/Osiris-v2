import type { SecurityToolId, RiskClass } from "@/config/security-tools";

export type Capability = string;

export interface IntegrationRequest {
  requestId: string;
  tenantId: string;
  actorId: string;
  tool: SecurityToolId;
  capability: Capability;
  assetId?: string;
  consentAttestation?: boolean;
  purpose: string;
  approvalId?: string;
  payload?: unknown;
}

export type FindingStatus = "observed" | "inferred" | "unverified";

export interface SecurityFinding {
  id: string;
  toolId: SecurityToolId;
  assetId: string | null;
  tenantId: string;
  sourceUrl: string | null;
  observedAt: string | null;
  importedAt: string;
  severity: "info" | "low" | "medium" | "high" | "critical" | null;
  confidence: number | null;
  status: FindingStatus;
  evidenceHash: string | null;
  retentionUntil: string | null;
  properties: Record<string, unknown>;
}

export interface IntegrationResult<T = unknown> {
  ok: boolean;
  requestId: string;
  tool: SecurityToolId;
  capability: Capability;
  data?: T;
  findings?: SecurityFinding[];
  errorCode?: string;
  auditId: string;
}

export interface AdapterContext {
  tenantId: string;
  actorId: string;
  assetId?: string;
  signal: AbortSignal;
}