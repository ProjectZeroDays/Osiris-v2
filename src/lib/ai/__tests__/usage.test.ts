import { describe, it, expect } from "vitest";
import {
  NO_USAGE,
  countingTransform,
  readUsage,
  type ChatUsage,
} from "@/lib/ai/usage.server";

/**
 * Reading a streamed reply for its cost.
 *
 * The claim under test is the one that decided the whole design: a provider
 * reports the usage of a streamed request in the *last* frame of the stream,
 * after the last frame of content. If that is true, the platform can record
 * what a chat cost without ever holding the reply up, and the reason written
 * into the cost table — "counting them would mean buffering a stream" — is
 * simply wrong.
 *
 * So the frames here are the frames OpenRouter sends, down to the split in
 * the middle of one, because a stream is not a list of frames: it is a
 * sequence of bytes that may be cut anywhere.
 */

/** One `data:` frame, as it appears on the wire. */
const frame = (payload: unknown): string =>
  `data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`;

/**
 * The terminal frames of a real streamed reply, in the order they arrive.
 *
 * OpenRouter sends the terminal `finish_reason` twice — once on the last
 * content-bearing chunk and again on the usage chunk — and its docs ask
 * that the second be treated as an accounting frame rather than a second
 * terminal event. The `usage` object is what matters here; the duplicated
 * `finish_reason` is the provider's, and it goes through untouched.
 */
const TAIL = [
  frame({ choices: [{ delta: { content: "world" } }] }),
  frame({
    choices: [{ index: 0, delta: { content: "", role: "assistant" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 14, completion_tokens: 3, total_tokens: 17 },
  }),
  frame("[DONE]"),
].join("");

const encoder = new TextEncoder();

/** Push bytes through the transform and read back what came out. */
async function pump(
  chunks: Uint8Array[],
  onUsage: (u: ChatUsage) => void,
): Promise<string> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  const out = source.pipeThrough(countingTransform(onUsage));
  const reader = out.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe("readUsage", () => {
  it("has no usage when the provider reported none", () => {
    // "The provider did not say" is not the same claim as "the provider
    // counted nothing", and it is carried as null rather than zero. A
    // local model and a dropped metered reply both land here; the unit
    // table decides what they cost, not this reader.
    expect(readUsage({ choices: [{ delta: { content: "hi" } }] })).toEqual(NO_USAGE);
    expect(readUsage(null)).toEqual(NO_USAGE);
    expect(readUsage({})).toEqual(NO_USAGE);
    expect(readUsage({ usage: null })).toEqual(NO_USAGE);
  });

  it("reads the totals a provider reported", () => {
    const u = readUsage({ usage: { prompt_tokens: 14, completion_tokens: 3, total_tokens: 17 } });
    expect(u.reported).toBe(true);
    expect(u.tokens).toBe(17);
  });

  it("sums the parts when the provider gave no total", () => {
    expect(readUsage({ usage: { prompt_tokens: 10, completion_tokens: 5 } }).tokens).toBe(15);
  });

  it("reads the cost OpenRouter reports in its own credits", () => {
    const u = readUsage({ usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.00042 } });
    expect(u.credits).toBeCloseTo(0.00042);
  });

  // A zero is a claim that the provider counted nothing. "The provider did
  // not say" is a different claim, and it must not be recorded as a zero.
  it("reports an absence as null rather than zero", () => {
    const u = readUsage({ usage: { cost: 0.001 } });
    expect(u.tokens).toBeNull();
    expect(u.credits).toBeCloseTo(0.001);
  });

  it("ignores a count that is not a number", () => {
    expect(readUsage({ usage: { total_tokens: "17" } }).tokens).toBeNull();
    expect(readUsage({ usage: { total_tokens: -1 } }).tokens).toBeNull();
    expect(readUsage({ usage: { total_tokens: Number.NaN } }).tokens).toBeNull();
  });
});

describe("countingTransform", () => {
  it("forwards every byte of the reply unchanged", async () => {
    const seen: ChatUsage[] = [];
    const input = frame({ choices: [{ delta: { content: "hello" } }] }) + TAIL;
    const out = await pump([encoder.encode(input)], (u) => seen.push(u));
    expect(out).toBe(input);
  });

  it("reads the usage from the terminal frame", async () => {
    const seen: ChatUsage[] = [];
    await pump([encoder.encode(TAIL)], (u) => seen.push(u));
    expect(seen).toHaveLength(1);
    expect(seen[0].tokens).toBe(17);
    expect(seen[0].reported).toBe(true);
  });

  // The reason this is a transform and not a buffer: bytes go through as
  // they arrive, and the usage is only noticed at the end.
  it("emits each chunk as it arrives, without waiting for the end", async () => {
    const first = frame({ choices: [{ delta: { content: "hel" } }] });
    const seen: string[] = [];

    const source = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode(first));
        c.enqueue(encoder.encode(TAIL));
        c.close();
      },
    });
    const reader = source
      .pipeThrough(countingTransform(() => undefined))
      .getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      seen.push(new TextDecoder().decode(value));
    }
    // The first chunk came through on its own, before the usage frame ever
    // arrived. A transform that held the stream to the end would have
    // delivered one blob instead.
    expect(seen[0]).toBe(first);
  });

  it("survives a frame split across two chunks", async () => {
    const seen: ChatUsage[] = [];
    const usageFrame = frame({
      choices: [{ delta: {} }],
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
    });
    const bytes = encoder.encode(frame({ choices: [{ delta: { content: "a" } }] }) + usageFrame + frame("[DONE]"));
    // Cut through the middle of the usage JSON, which is where a stream
    // really does break a frame.
    const cut = Math.floor(bytes.length / 2);
    const out = await pump([bytes.subarray(0, cut), bytes.subarray(cut)], (u) => seen.push(u));
    expect(out).toBe(new TextDecoder().decode(bytes));
    expect(seen).toHaveLength(1);
    expect(seen[0].tokens).toBe(5);
  });

  it("survives a frame split one byte at a time", async () => {
    const seen: ChatUsage[] = [];
    const bytes = encoder.encode(TAIL);
    const chunks = Array.from({ length: bytes.length }, (_, i) => bytes.subarray(i, i + 1));
    const out = await pump(chunks, (u) => seen.push(u));
    expect(out).toBe(new TextDecoder().decode(bytes));
    expect(seen).toHaveLength(1);
    expect(seen[0].tokens).toBe(17);
  });

  it("reports nothing when the stream ends without a usage frame", async () => {
    // A caller who disconnects, or a provider that drops the connection.
    // The platform cannot tell this from a local model reporting no
    // usage, so it holds the difference rather than guessing: `reported`
    // is false here, and `recordChatCost` is what decides that false
    // becomes zero tokens in the `ai-token` unit.
    const seen: ChatUsage[] = [];
    await pump([encoder.encode(frame({ choices: [{ delta: { content: "trunc" } }] }) + frame("[DONE]"))], (u) => seen.push(u));
    expect(seen).toHaveLength(0);
  });

  it("reports the last usage frame when a provider sends several", async () => {
    const seen: ChatUsage[] = [];
    await pump(
      [
        encoder.encode(
          frame({ usage: { total_tokens: 1 } }) +
            frame({ choices: [{ delta: { content: "x" } }] }) +
            frame({ usage: { prompt_tokens: 9, completion_tokens: 1, total_tokens: 10 } }) +
            frame("[DONE]"),
        ),
      ],
      (u) => seen.push(u),
    );
    expect(seen).toHaveLength(1);
    // One callback per stream, not one per frame — the last usage frame is
    // the one that describes the whole request.
    expect(seen[0].tokens).toBe(10);
  });

  it("ignores a frame that is not JSON, and forwards it anyway", async () => {
    const seen: ChatUsage[] = [];
    const junk = "data: {not json\n\n";
    const out = await pump([encoder.encode(junk + TAIL)], (u) => seen.push(u));
    expect(out).toContain("{not json");
    expect(seen[0].tokens).toBe(17);
  });

  // OpenRouter keeps a quiet connection alive with SSE comment lines, and
  // its own docs warn that a parser which calls JSON.parse on them will
  // crash mid-stream. A comment is a line that does not start with
  // `data:`, which is the same thing as a non-JSON payload.
  it("passes an SSE comment through without trying to read it", async () => {
    const seen: ChatUsage[] = [];
    const comment = ": OPENROUTER PROCESSING\n\n";
    const input = comment + frame({ choices: [{ delta: { content: "hi" } }] }) + comment + TAIL;
    const out = await pump([encoder.encode(input)], (u) => seen.push(u));
    expect(out).toBe(input);
    expect(seen[0].tokens).toBe(17);
  });
});
