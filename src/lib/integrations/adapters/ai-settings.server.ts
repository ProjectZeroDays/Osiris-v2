import "server-only";
import type { AdapterContext } from "../types";
import {
  resolveProviders,
  getProvider,
  providerKey,
  isPlausibleModel,
} from "@/lib/ai/providers.server";
import { readUsage, recordChatCost } from "@/lib/ai/usage.server";
import {
  startDownload,
  listDownloads,
  listInstalledModels,
  removeModel,
} from "@/lib/ai/model-download.server";

/**
 * The platform's model providers, as an integration.
 *
 * These are the deployment's own: a local model server the operator
 * runs, or a remote key the operator put in the environment. They are
 * separate from OI's providers, which take the visitor's key and keep it
 * in their browser.
 *
 * The origins are fixed. There is no "custom base URL": a caller-chosen
 * endpoint would turn the chat capability into a relay into anything the
 * server can reach.
 */

export async function listProviders(_payload: unknown, _ctx: AdapterContext) {
  return {
    providers: resolveProviders().map((p) => ({
      id: p.id,
      label: p.label,
      kind: p.kind,
      endpoint: p.endpoint,
      needsKey: p.needsKey,
      models: p.models,
      notes: p.notes,
      configured: p.needsKey ? Boolean(providerKey(p)) : true,
    })),
  };
}

export async function listDownloadsAction(_payload: unknown, _ctx: AdapterContext) {
  return { jobs: listDownloads(), installed: await listInstalledModels() };
}

export async function startDownloadAction(
  payload: unknown,
  _ctx: AdapterContext,
) {
  const p = payload as { url?: string; filename?: string };
  if (!p?.url || !p?.filename) throw new Error("AI_DOWNLOAD_INVALID");
  const job = await startDownload(p.url, p.filename);
  return { job };
}

export async function removeModelAction(payload: unknown, _ctx: AdapterContext) {
  const p = payload as { filename?: string };
  if (!p?.filename) throw new Error("AI_MODEL_INVALID");
  return { removed: await removeModel(p.filename) };
}

/**
 * One chat, through whichever provider the deployment has.
 *
 * The provider is chosen from the registry, so a request can only reach
 * an origin the operator configured. The key stays in the environment
 * and is never echoed back.
 *
 * What the call cost is recorded as well as returned. The reply is read
 * in full here anyway — that is what a JSON return value means — so its
 * usage is simply part of the body, and the figure is the provider's own
 * rather than an estimate the platform computed. The other chat surface,
 * the streaming proxy, counts without reading: a provider puts the usage
 * in the last frame of a stream, so nothing has to be held back.
 */
export async function chat(
  payload: unknown,
  ctx: AdapterContext,
) {
  const p = payload as {
    provider?: string;
    model?: string;
    messages?: Array<{ role: string; content: string }>;
    stream?: boolean;
  };

  if (!p?.provider) throw new Error("AI_PROVIDER_REQUIRED");
  const provider = getProvider(p.provider);
  if (!provider) throw new Error("AI_PROVIDER_NOT_CONFIGURED");
  if (!isPlausibleModel(p.model)) throw new Error("AI_MODEL_INVALID");

  const messages = Array.isArray(p.messages) ? p.messages : [];
  if (messages.length === 0) throw new Error("AI_MESSAGES_REQUIRED");
  if (messages.length > 100) throw new Error("AI_TOO_MANY_MESSAGES");

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider.needsKey) {
    const key = providerKey(provider);
    if (!key) throw new Error("AI_PROVIDER_KEY_MISSING");
    headers.authorization = `Bearer ${key}`;
    headers["http-referer"] = process.env.OPENROUTER_REFERER ?? "https://osirisai.live";
    headers["x-title"] = "OSIRIS";
  }

  const upstream = await fetch(`${provider.endpoint}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: p.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: Boolean(p.stream),
    }),
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  }).catch(() => null);

  if (!upstream) throw new Error("AI_UPSTREAM_UNREACHABLE");
  if (!upstream.ok) {
    throw new Error(upstream.status === 429 ? "AI_UPSTREAM_RATE_LIMITED" : "AI_UPSTREAM_ERROR");
  }

  const text = await upstream.text().catch(() => "");
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // A body that is not JSON has no usage in it, and the caller gets
    // what was actually sent rather than an error about its shape.
    parsed = { raw: text.slice(0, 20_000) };
  }

  void recordChatCost(ctx.tenantId, readUsage(parsed));
  return { reply: parsed };
}
