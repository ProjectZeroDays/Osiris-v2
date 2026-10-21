import "server-only";
import type { IntegrationRequest } from "./types";
import { SECURITY_TOOL_CARDS } from "@/config/security-tools";
import { assertAssetOwnedByTenant, type AssetRecord } from "@/lib/auth/assets.server";
import { consentScope, hasValidConsent } from "@/lib/auth/consent.server";
import { getDb } from "@/db/client.server";

export interface AuthContext {
  authenticated: boolean;
  tenantId: string | null;
  actorId: string | null;
  roles: string[];
  /** True when the context came from the single-tenant fallback, not a session. */
  ephemeral?: boolean;
}

export function assertAuthorized(req: IntegrationRequest, ctx: AuthContext): void {
  if (!ctx.authenticated || !ctx.tenantId || !ctx.actorId) {
    throw new Error("INTEGRATION_UNAUTHENTICATED");
  }
  if (req.tenantId !== ctx.tenantId) throw new Error("INTEGRATION_TENANT_MISMATCH");

  const card = SECURITY_TOOL_CARDS.find((c) => c.id === req.tool);
  if (!card) throw new Error("UNKNOWN_TOOL");

  if (card.requiresAsset && !req.assetId) throw new Error("INTEGRATION_ASSET_REQUIRED");
  if (card.requiresConsent && !req.consentAttestation) {
    throw new Error("INTEGRATION_CONSENT_REQUIRED");
  }
}

/**
 * The checks that need the durable record.
 *
 * A body that says `assetId` is a claim. This confirms the asset exists and
 * belongs to the tenant, and that a consent record covers the exact
 * capability being requested — not merely that the client asserted one.
 *
 * With no database configured there is no registry to consult, so the
 * ownership check cannot be satisfied and the request is refused. Failing
 * closed is the only safe direction for a check whose absence cannot be
 * distinguished from its failure.
 */
export async function assertAuthorizedAgainstRegistry(
  req: IntegrationRequest,
  ctx: AuthContext,
): Promise<void> {
  const card = SECURITY_TOOL_CARDS.find((c) => c.id === req.tool);
  if (!card) throw new Error("UNKNOWN_TOOL");

  if (card.requiresAsset && req.assetId) {
    if (!getDb()) {
      // No registry: the asset cannot be confirmed to belong to this tenant.
      throw new Error("ASSET_REGISTRY_UNAVAILABLE");
    }
    await assertAssetOwnedByTenant(req.assetId, ctx.tenantId!);
  }

  if (card.requiresConsent) {
    const scope = consentScope(req.tool, req.capability);
    if (!(await hasValidConsent(ctx.tenantId!, scope))) {
      throw new Error("INTEGRATION_CONSENT_REQUIRED");
    }
  }
}
