import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context.server";
import { getClientIp, isRateLimited } from "@/lib/ssrf-guard";
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
 * The key is the operator's, and a provider that needs one spends it, so
 * a deployment with accounts requires a session for such a call: the same
 * rule every other metered route follows. A local provider needs no key and
 * runs on the operator's own machine, so it is allowed without one - the
 * call costs them nothing they are billed for. The check is before the
 * call, not after: a refusal that arrives once the provider has been paid
 * for has already cost money. A deployment with no database has no accounts
 * and no sign-in, so the call proceeds against the single-tenant identity.
 *
 * A caller is also limited to twenty chats a minute by address, so one
 * runaway client cannot spend the operator's key for everyone.
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

/**
 * How many chats a caller may start in a minute.
 *
 * The session check bounds a deployment that has accounts, but a bare
 * deployment has no sign-in to demand, and the key is the operator's
 * either way. A per-caller limit is the second lock on the door: it does
 * not replace the session, it bounds what one caller can spend before
 * the session is even considered.
 *
 * The number is generous for a person and tight for a script, and it is
 * counted per client address rather than per session, so one runaway
 * client cannot spend the operator's key for everyone.
 */
const CHATS_PER_MINUTE = 20;

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

  // The tenant comes from the session when there is one, and from the
  // single-tenant fallback when there is not - the same rule the costs
  // route reads under, so what is recorded and what is reported name the
  // same tenant.
  //
  // A provider that needs a key spends the operator's money, and the key
  // is theirs: on a deployment with accounts, a caller with no session is
  // refused, exactly as every other metered route refuses one. A local
  // provider needs no key and runs on the operator's own machine, so it
  // costs nothing they are billed for, and the call is allowed - which
  // is what a bare deployment running a local model looks like.
  //
  // The check is before the call, not after: a refusal that arrives
  // once the provider has been paid for has already cost money.
  const { tenantId } = await getAuthContext();
  if (!tenantId && provider.needsKey) {
    return fail(401, "CHAT_UNAUTHENTICATED");
  }

  // The second lock, for the bare deployment and for a client that has
  // a session. Counted before the call, so a refused chat costs nothing.
  if (isRateLimited(getClientIp(req), CHATS_PER_MINUTE)) {
    return fail(429, "CHAT_RATE_LIMITED");
  }

  // Where the cost is recorded. A local provider on a deployment with
  // accounts has no tenant, because the caller had no session - the call
  // was allowed precisely because it cost the operator nothing. It is
  // recorded against the single-tenant identity, so the spending is
  // visible rather than lost, and the row it lands in is the one the
  // operator reads.
  const costTenant = tenantId ?? "single-tenant";

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

  // A streamed reply carries its usage in the last frame of the stream,
  // so it is counted on the way through: bytes go out as they arrive, and
  // the terminal frame is noticed on the way past. Nothing is buffered.
  if (Boolean(p.stream)) {
    const stream = upstream.body.pipeThrough(
      countingTransform((usage) => void recordChatCost(costTenant, usage)),
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
  void recordChatCost(costTenant, usage ?? NO_USAGE);
  return reply(text, upstream);
}
