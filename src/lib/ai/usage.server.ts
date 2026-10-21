import "server-only";

import { consumeQuota } from "@/lib/integrations/quota.server";

/**
 * What a chat call actually cost, as the provider reported it.
 *
 * The cost table prices `ai.chat` at one `ai-request`, and that entry is
 * now the fallback rather than the whole story: it is what a capability
 * declares before it is called, since a declared cost cannot know what a
 * particular reply will use. What is *recorded* is what the provider
 * reported, in tokens. The reason the request-count was thought necessary
 * does not survive contact with the provider's own documentation.
 * OpenRouter includes the usage for the whole request in the last message
 * of a streamed reply, after the frame that carries `finish_reason`, and
 * it does so automatically: the `stream_options.include_usage` parameter
 * that would ask for it is deprecated and has no effect. Reading the
 * usage costs one parse of one frame. Nothing is buffered, and the stream
 * is not held up.
 *
 * So what is recorded here is what the provider said, not an estimate
 * computed from text the platform guesses a tokenizer for. `tokens` is the
 * total token count when the provider reported one, and `credits` is what
 * OpenRouter reports as its own cost.
 *
 * A stream that ends without a usage frame is recorded as zero tokens in
 * the token unit, and that zero has to be read carefully, because it
 * means two different things. A local model reports no usage because it
 * is free: the inference ran on the operator's own machine and they were
 * billed nothing. A metered provider that dropped the connection is a
 * different case — the tokens were spent, the reply was not finished, and
 * nothing arrived to say how many. The platform does not know which it is
 * looking at, so it does not pretend to. The unit stays `ai-token`
 * either way, because it has to: a day's row carries one `costUnit` and
 * `consumeQuota` overwrites it on every write, so a unit that varied
 * between calls would leave the row reporting a total in whichever unit
 * happened to come last.
 */

/**
 * How many chat calls a day a tenant may have recorded, as a ceiling
 * rather than a quota.
 *
 * `consumeQuota` returns without writing anything once a day's count
 * reaches its limit, so the limit is only ever a limit on *recording*.
 * That is fine for the dispatcher, where a refused call was never made,
 * and wrong for chat, where the call has already been made and the reply
 * is on its way out. Past this figure the chat still answers and the cost
 * still lands, so nothing is under-recorded; the figure exists so a
 * runaway loop cannot grow one tenant's counter without bound, and it is
 * deliberately far above anything a person reaches by hand.
 */
const RECORDED_CALLS_CEILING = 100_000;

/** One chat call, as the platform will remember it. */
export interface ChatUsage {
  /** Total tokens, when the provider reported a token count. */
  readonly tokens: number | null;
  /** Cost in the provider's own credits, when it reported one. */
  readonly credits: number | null;
  /** Whether a usage frame arrived at all. */
  readonly reported: boolean;
}

/**
 * A provider that reported no usage.
 *
 * Either a local model, which is free, or a metered provider whose reply
 * was cut short before the usage frame arrived. `readUsage` cannot tell
 * them apart and does not try to; the caller records this as zero tokens.
 */
export const NO_USAGE: ChatUsage = { tokens: null, credits: null, reported: false };

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

/**
 * The usage out of one provider reply, whether it was streamed or not.
 *
 * Both wire shapes are the same shape — a Chat Completions chunk — so one
 * reader serves the buffered path and the counting transform. Every field
 * is optional because providers drift, and a missing one is `null` rather
 * than zero: a zero is a claim that the provider counted no tokens, and
 * "the provider did not say" is a different claim.
 *
 * OpenRouter reports its own cost in credits alongside the token counts,
 * which is the figure an operator reconciles against a bill. Other
 * OpenAI-compatible providers report the counts and no cost.
 */
export function readUsage(chunk: unknown): ChatUsage {
  const usage = (chunk as { usage?: unknown } | null)?.usage;
  if (!usage || typeof usage !== "object") return NO_USAGE;

  const u = usage as Record<string, unknown>;
  const prompt = num(u.prompt_tokens);
  const completion = num(u.completion_tokens);
  const total = num(u.total_tokens);

  // The total is taken from the provider when it gave one, and only then
  // summed from the parts: a provider that counts prompt and completion
  // differently than it sums them has the say.
  const tokens = total ?? (prompt !== null || completion !== null ? (prompt ?? 0) + (completion ?? 0) : null);

  return { tokens, credits: num(u.cost), reported: true };
}

/**
 * A transformer that reads a streamed reply for its usage and forwards it.
 *
 * The two jobs pull against each other, and the transform is what lets
 * both happen: the caller wants the reply as it is produced, and the
 * platform wants the usage that arrives at the end of it. Bytes go
 * through as they come. The frame that carries usage is read on its way
 * past and handed to `onUsage`.
 *
 * The usage frame is forwarded as well as read. It is the provider's own
 * protocol, and a client reading it is reading what it would have read
 * had the platform not been standing there.
 *
 * What is held back is only the tail of the last chunk that did not end
 * on a newline, because an SSE frame can be split anywhere. That tail is
 * one frame at most — a usage frame is a single JSON object — and it is
 * released by the next chunk or by the flush, so a provider that never
 * sends a newline stalls nothing: nothing waits on a newline that has not
 * already been sent.
 *
 * The callback is called at most once, with the last usage frame seen.
 * OpenRouter sends one; a provider that sent several would have the last
 * say, which is the one that describes the whole request.
 */
export function countingTransform(onUsage: (usage: ChatUsage) => void): TransformStream<Uint8Array, Uint8Array> {
  let held: Uint8Array | null = null;

  /** Read whatever complete frames are in `bytes`; keep the tail back. */
  const scan = (bytes: Uint8Array): ChatUsage | null => {
    if (held) {
      const joined = new Uint8Array(held.length + bytes.length);
      joined.set(held, 0);
      joined.set(bytes, held.length);
      bytes = joined;
      held = null;
    }

    const text = new TextDecoder().decode(bytes);
    const lastNewline = text.lastIndexOf("\n");
    if (lastNewline === -1) {
      held = bytes;
      return null;
    }
    const tail = bytes.subarray(lastNewline + 1);
    if (tail.length > 0) held = new Uint8Array(tail);

    let found: ChatUsage | null = null;
    for (const line of text.slice(0, lastNewline + 1).split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const usage = readUsage(JSON.parse(payload));
        if (usage.reported) found = usage;
      } catch {
        // A frame that is not JSON is not the platform's business, and
        // the reply goes through untouched either way.
      }
    }
    return found;
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const usage = scan(chunk);
      if (usage) onUsage(usage);
      controller.enqueue(chunk);
    },
    flush() {
      if (!held) return;
      const usage = scan(new Uint8Array(0));
      if (usage) onUsage(usage);
    },
  });
}

/**
 * Record a chat call against the tenant, in tokens.
 *
 * One call, one write, one unit. The obvious alternative - recording the
 * request and the usage as two costs - would count two calls where one
 * happened, since every cost is a call against the quota. And the unit
 * cannot vary between calls: a day's counter carries one `costUnit`, and
 * `consumeQuota` overwrites it on every write, so the unit is whichever
 * call came last. A day that mixed a local model with a metered one would
 * then report a total in a unit that did not describe all of it.
 *
 * So the unit is the token, always. It is the unit a metered provider
 * bills in, it is measured rather than declared, and it survives the case
 * that motivated the request-count in the first place: a reply that
 * streams, which is never buffered to be counted. A local provider
 * reports no usage, and its call is recorded as zero tokens - which is
 * not a guess but the truth, since the inference ran on the operator's
 * own machine and cost them nothing they were billed for. The call still
 * happened, and `calls` says so; a free tool and an unused tool differ,
 * and the zero is what shows the difference.
 *
 * The credits OpenRouter reports are read but not stored, and that is
 * stated rather than hidden: one row, one unit. An operator who wants the
 * money has the tokens and the provider's own rate.
 *
 * Recording is the caller's business, and its failure is not the chat's:
 * a platform that cannot write its cost ledger should still answer the
 * operator. So this never throws.
 *
 * The limit is a ceiling the platform does not enforce, and that is the
 * point of passing it explicitly rather than inheriting the default.
 * `consumeQuota` refuses a call over the limit *without recording its
 * cost*, because in the dispatcher a refusal means the call was never
 * made. Here the call was already made and the reply is on its way to the
 * caller, so a refusal would not undo it — it would only drop the cost of
 * work that has already been paid for. The day's chat can therefore
 * exceed this figure, and a figure that can be exceeded is not a quota,
 * so it is named for what it is: a large ceiling that keeps the counter
 * from growing without bound, not a limit on the operator's own chat.
 */
export async function recordChatCost(
  tenantId: string,
  usage: ChatUsage,
): Promise<void> {
  try {
    await consumeQuota(tenantId, "ai-settings", RECORDED_CALLS_CEILING, {
      units: usage.tokens ?? 0,
      reported: usage.reported,
      unit: "ai-token",
    });
  } catch {
    // Deliberately swallowed: see the function's own note.
  }
}
