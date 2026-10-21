import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context.server";
import {
  getProvider,
  providerKey,
  isPlausibleModel,
} from "@/lib/ai/providers.server";
import {
  NO_USAGE,
  countingTransform,
  readUsage,
  recordChatCost,
  type ChatUsage,
} from "@/lib/ai/usage.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The platform chat proxy.
 *
 * One endpoint for every provider the deployment has. The provider is
 * chosen from the registry, so a request can only reach an origin the
 * operator configured; the model id is checked before it goes into a
 * request. A key that a provider needs is taken from the environment and
 * never leaves the server.
 *
 * What the call costs is recorded as well as made. A provider reports the
 * usage of a streamed request in the final message of the stream, after
 * the frame that carries `finish_reason`, so the reply is counted on its
 * way through rather than held up to be read: bytes go out as they
 * arrive, and the usage frame is noticed on the way past. Nothing here
 * buffers.
 */

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** The longest a single message may be. */
const MAX_MESSAGE_CHARS = 100_000;
/** The most messages in one request. */
const MAX_MESSAGES = 100;

function fail(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

/** The reply itself, sent the same way whether it was counted or not. */
function reply(
  body: ReadableStream<Uint8Array> | string,
  upstream: Response,
) {
  return new NextResponse(body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Send a JSON body.");
  }

  const p = body as {
    provider?: string;
    model?: string;
    messages?: ChatMessage[];
    stream?: boolean;
  };

  if (!p?.provider) return fail(400, "Choose a provider.");
  const provider = getProvider(p.provider);
  if (!provider) return fail(503, "PROVIDER_NOT_CONFIGURED");

  if (!isPlausibleModel(p.model)) return fail(400, "Choose a model.");

  const messages = Array.isArray(p.messages) ? p.messages : [];
  if (messages.length === 0) return fail(400, "Send at least one message.");
  if (messages.length > MAX_MESSAGES) return fail(400, "Too many messages.");
  for (const m of messages) {
    if (!m || (m.role !== "system" && m.role !== "user" && m.role !== "assistant")) {
      return fail(400, "A message has an unknown role.");
    }
    if (typeof m.content !== "string") return fail(400, "A message has no content.");
    if (m.content.length > MAX_MESSAGE_CHARS) return fail(400, "A message is too long.");
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider.needsKey) {
    const key = providerKey(provider);
    if (!key) return fail(503, "PROVIDER_KEY_MISSING");
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

  if (!upstream) return fail(502, "UPSTREAM_UNREACHABLE");
  if (!upstream.ok || !upstream.body) {
    return fail(upstream.status === 429 ? 429 : 502, "UPSTREAM_ERROR", {
      status: upstream.status,
    });
  }

  // The tenant comes from the session when there is one, and from the
  // single-tenant fallback when there is not — the same rule the costs
  // route reads under, so what is recorded and what is reported name the
  // same tenant.
  const { tenantId } = await getAuthContext();
  if (!tenantId) {
    // Nothing to record against. The reply is not refused for it: a
    // caller's chat is not hostage to the platform's ledger.
    return reply(upstream.body, upstream);
  }

  // A streamed reply carries its usage in the last frame of the stream,
  // so it is counted on the way through: bytes go out as they arrive, and
  // the terminal frame is noticed on the way past. Nothing is buffered.
  if (Boolean(p.stream)) {
    const stream = upstream.body.pipeThrough(
      countingTransform((usage) => void recordChatCost(tenantId, usage)),
    );
    return reply(stream, upstream);
  }

  // A non-streaming reply is read in full anyway — that is what
  // non-streaming means — so its usage is simply part of the body.
  const text = await upstream.text().catch(() => "");
  let usage: ChatUsage | undefined;
  try {
    usage = readUsage(JSON.parse(text));
  } catch {
    // A body that is not JSON has no usage in it. The reply still goes
    // back to the caller exactly as it arrived.
  }
  void recordChatCost(tenantId, usage ?? NO_USAGE);
  return reply(text, upstream);
}
