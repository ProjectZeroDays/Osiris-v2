import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/ai/chat/route";

/**
 * What a chat call costs, from the caller's side.
 *
 * The route is a proxy: it stands between a caller and a provider the
 * operator configured, and the question these tests answer is whether it
 * can record what the call cost without becoming a different thing. A
 * proxy that held the reply to read it would stop being a proxy, and an
 * operator who asked for a stream would get a buffer.
 *
 * So the first test is the reply itself, byte for byte. The counting is
 * only worth anything if the bytes are the provider's.
 */

const { jar, quota } = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  // What `consumeQuota` was called with, in order. A bare deployment has
  // no database and still counts, which is the case under test.
  quota: [] as Array<{ tenantId: string; tool: string; cost?: { units: number; unit: string } }>,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  }),
}));

vi.mock("@/db/client.server", () => ({
  isDatabaseConfigured: false,
  getDb: () => null,
}));

vi.mock("@/lib/integrations/quota.server", () => ({
  consumeQuota: async (
    tenantId: string,
    tool: string,
    _limit?: number,
    cost?: { units: number; unit: string },
  ) => {
    quota.push({ tenantId, tool, cost });
    return { allowed: true, used: 1, limit: 100, remaining: 99 };
  },
}));

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The terminal frames of a streamed reply, as a provider sends them. */
function streamedReply(): string {
  return (
    'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
    'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":14,"completion_tokens":3,"total_tokens":17}}\n\n' +
    "data: [DONE]\n\n"
  );
}

/** A stub upstream that streams `text` and records what was asked of it. */
function stubFetch(text: string, contentType = "text/event-stream") {
  const seen: { body: string; stream: unknown } = { body: "", stream: null };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body?: string }) => {
      seen.body = init.body ?? "";
      seen.stream = JSON.parse(init.body ?? "{}").stream;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of text.match(/[\s\S]{1,7}/g) ?? []) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": contentType } },
      );
    }),
  );
  return seen;
}

/**
 * The provider registry, which is where a model id is checked.
 *
 * `isPlausibleModel` is deliberately not stubbed: it is a pure function
 * with no I/O, and a fake of it would drift from the real one. The stub
 * above it already proved that — it accepted a path traversal the real
 * check rejects, and the test that depended on it passed against
 * nothing. Only the lookup is stood in, because that is the part that
 * reads the environment.
 */
vi.mock("@/lib/ai/providers.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/providers.server")>()),
  getProvider: (id: string) =>
    id === "openrouter"
      ? { id, needsKey: true, endpoint: "https://openrouter.ai/api/v1", models: ["openai/gpt-4o"] }
      : id === "ollama"
        ? { id, needsKey: false, endpoint: "http://127.0.0.1:11434/v1", models: ["qwen3:8b"] }
        : undefined,
  providerKey: () => "test-key",
}));

function request(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Read a streamed response to the end, and say what came back. */
async function drain(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

/** POST and read the reply to the end, the way a caller would. */
async function ask(body: Record<string, unknown>): Promise<Response> {
  const res = await POST(request(body));
  await drain(res).catch(() => "");
  return res;
}

beforeEach(() => {
  jar.clear();
  quota.length = 0;
});

describe("the chat proxy", () => {
  it("forwards a streamed reply byte for byte", async () => {
    const text = streamedReply();
    stubFetch(text);

    const res = await POST(
      request({ provider: "openrouter", model: "openai/gpt-4o", stream: true, messages: [{ role: "user", content: "hi" }] }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    // The caller gets the provider's frames, unchanged and in order. The
    // counting transform must not have touched a byte.
    expect(await drain(res)).toBe(text);
  });

  it("asks the provider to stream when the caller asks for a stream", async () => {
    const seen = stubFetch(streamedReply());
    await POST(
      request({ provider: "openrouter", model: "openai/gpt-4o", stream: true, messages: [{ role: "user", content: "hi" }] }),
    );
    expect(seen.stream).toBe(true);
  });

  it("records the tokens the provider reported", async () => {
    stubFetch(streamedReply());

    await ask({ provider: "openrouter", model: "openai/gpt-4o", stream: true, messages: [{ role: "user", content: "hi" }] });

    // The reply has to be read before the terminal frame can be counted —
    // that is the whole design, and a test that did not drain the stream
    // would prove nothing about the counting.
    expect(quota).toHaveLength(1);
    expect(quota[0].tool).toBe("ai-settings");
    expect(quota[0].cost).toEqual({ units: 17, unit: "ai-token" });
  });

  it("counts a reply that is not streamed", async () => {
    stubFetch(
      '{"choices":[{"message":{"content":"hello"}}],"usage":{"prompt_tokens":20,"completion_tokens":4,"total_tokens":24}}',
      "application/json",
    );

    const res = await POST(
      request({ provider: "ollama", model: "qwen3:8b", messages: [{ role: "user", content: "hi" }] }),
    );
    const body = (await res.json()) as { choices: unknown[] };

    expect(body.choices).toHaveLength(1);
    expect(quota[0].cost).toEqual({ units: 24, unit: "ai-token" });
  });

  it("records a local model's call as zero tokens, not as a request", async () => {
    // A local model reports no usage, and that is not a gap in its
    // reporting worth papering over with an estimate: the inference ran
    // on the operator's own machine and they were billed nothing for it.
    // Zero tokens is the truth, and `calls` is what says the call
    // happened — a tool that was used and cost nothing is a different
    // thing from a tool that was not used, and both show up.
    //
    // The unit stays `ai-token` whatever the call cost. It cannot vary:
    // a day's row carries one unit and `consumeQuota` overwrites it on
    // every write, so a day that mixed a local model with a metered one
    // would end up reporting a total in the unit of whichever came last.
    stubFetch('{"choices":[{"message":{"content":"hello"}}]}', "application/json");

    await POST(request({ provider: "ollama", model: "qwen3:8b", messages: [{ role: "user", content: "hi" }] }));

    expect(quota).toHaveLength(1);
    expect(quota[0].cost).toEqual({ units: 0, unit: "ai-token" });
  });

  it("refuses a model id that is not well-formed", async () => {
    // The model id is checked before it goes into a request, but the
    // check is on its shape, not on the provider's catalogue: the
    // platform cannot know which models a provider has come to offer
    // since the operator configured it. So a well-formed id goes through
    // and the provider has the say.
    stubFetch(streamedReply());
    const res = await POST(
      request({ provider: "openrouter", model: "../../etc/passwd", messages: [{ role: "user", content: "hi" }] }),
    );
    expect(res.status).toBe(400);
    expect(quota).toHaveLength(0);
  });

  it("refuses a provider the deployment does not have", async () => {
    stubFetch(streamedReply());
    const res = await POST(
      request({ provider: "someone-elses", model: "x", messages: [{ role: "user", content: "hi" }] }),
    );
    expect(res.status).toBe(503);
    expect(quota).toHaveLength(0);
  });
});
