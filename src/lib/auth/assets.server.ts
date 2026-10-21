import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client.server";
import { assets } from "@/db/schema";

export interface AssetRecord {
  id: string;
  tenantId: string;
  label: string;
  kind: string;
  identifiers: Record<string, string>;
}

/**
 * The asset registry.
 *
 * An asset is a thing the tenant owns or is authorised to assess: a host, a
 * domain, a camera, a codebase. A tool that needs an asset is being pointed
 * at something specific, and the tenant must own it. Without a database
 * there is no registry to consult, so an asset cannot be verified and the
 * check fails closed.
 */
export async function assertAssetOwnedByTenant(
  assetId: string,
  tenantId: string,
): Promise<AssetRecord> {
  const db = getDb();
  if (!db) throw new Error("ASSET_REGISTRY_UNAVAILABLE");

  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.tenantId, tenantId)))
    .limit(1);

  if (!row) throw new Error("ASSET_NOT_OWNED");
  return row;
}

export async function listAssets(tenantId: string): Promise<AssetRecord[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(assets).where(eq(assets.tenantId, tenantId));
}
