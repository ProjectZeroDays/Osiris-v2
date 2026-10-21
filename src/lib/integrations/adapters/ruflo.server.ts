import "server-only";
import type { AdapterContext, SecurityFinding } from "../types";

export async function readOnlySummary(query: string, ctx: AdapterContext) {
  const url = process.env.RUFLO_MCP_URL;
  if (!url) throw new Error("RUFLO_NOT_CONFIGURED");
  const res = await fetch(`${url}/tools/osiris.intelSummary.readOnly`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
    signal: ctx.signal,
  });
  if (!res.ok) throw new Error("RUFLO_UPSTREAM_ERROR");
  return (await res.json()) as { summary: string };
}

export async function createReportDraft(query: string, ctx: AdapterContext) {
  const url = process.env.RUFLO_MCP_URL;
  if (!url) throw new Error("RUFLO_NOT_CONFIGURED");
  const res = await fetch(`${url}/tools/osiris.reportDraft.createWithApproval`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
    signal: ctx.signal,
  });
  if (!res.ok) throw new Error("RUFLO_UPSTREAM_ERROR");
  return (await res.json()) as { draftId: string; status: string };
}