import { NextResponse } from "next/server";
import { resolveProviders } from "@/lib/ai/providers.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The providers this deployment has, without their keys.
 *
 * The list is what the settings window shows. A key is never in it: the
 * list says whether a provider is configured, not how to reach it.
 */
export async function GET() {
  const providers = resolveProviders();
  return NextResponse.json(
    {
      providers: providers.map((p) => ({
        id: p.id,
        label: p.label,
        kind: p.kind,
        endpoint: p.endpoint,
        needsKey: p.needsKey,
        models: p.models,
        notes: p.notes,
        configured: p.needsKey ? Boolean(process.env.OPENROUTER_API_KEY) : true,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
