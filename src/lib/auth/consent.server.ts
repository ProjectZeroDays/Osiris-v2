import "server-only";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db/client.server";
import { consents } from "@/db/schema";

/**
 * Consent attestations.
 *
 * Some tools act on something that is not the tenant's own infrastructure —
 * a handle, a third-party device, a person. Those need a recorded
 * attestation, scoped to the exact capability, and expiring.
 *
 * A request body that carries `consentAttestation: true` is a claim by the
 * client. This is the record the platform checks that claim against.
 */
export async function hasValidConsent(tenantId: string, scope: string): Promise<boolean> {
  const db = getDb();
  // No registry means no verified consent, so the answer is no.
  if (!db) return false;

  const [row] = await db
    .select()
    .from(consents)
    .where(
      and(
        eq(consents.tenantId, tenantId),
        eq(consents.scope, scope),
        or(isNull(consents.expiresAt), gt(consents.expiresAt, new Date())),
      ),
    )
    .limit(1);

  return Boolean(row);
}

/** The scope string a consent is recorded against for a tool capability. */
export function consentScope(tool: string, capability: string): string {
  return `${tool}:${capability}`;
}
