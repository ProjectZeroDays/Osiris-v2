import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveProviders,
  getProvider,
  providerKey,
  isPlausibleModel,
} from "@/lib/ai/providers.server";
import { isSafeFilename } from "@/lib/ai/model-download.server";
import * as ai from "@/lib/integrations/adapters/ai-settings.server";

const ctx = { tenantId: "t", actorId: "a", signal: AbortSignal.timeout(5000) };

const KEYS = [
  "LLAMA_CPP_URL", "MLX_URL", "OLLAMA_URL", "OLLAMA_HOST",
  "OPENROUTER_API_KEY", "LLAMA_CPP_MODELS", "MLX_MODELS", "OLLAMA_MODELS",
];

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("model providers", () => {
  it("has none when nothing is configured", () => {
    expect(resolveProviders()).toEqual([]);
  });

  it("finds a local llama.cpp server", () => {
    process.env.LLAMA_CPP_URL = "http://127.0.0.1:8080";
    process.env.LLAMA_CPP_MODELS = "qwen3-8b, llama-3.2-3b";
    const p = resolveProviders();
    expect(p).toHaveLength(1);
    expect(p[0].id).toBe("local-gguf");
    expect(p[0].kind).toBe("local");
    expect(p[0].models).toEqual(["qwen3-8b", "llama-3.2-3b"]);
  });

  it("refuses a local provider that is not on the loopback", () => {
    // A "local" provider pointed at a remote host is a remote provider
    // wearing a local name, and it would carry a local provider's trust.
    process.env.LLAMA_CPP_URL = "https://models.example.com";
    expect(resolveProviders()).toEqual([]);
  });

  it("refuses a local provider with a nonsense scheme", () => {
    process.env.OLLAMA_URL = "file:///etc/passwd";
    expect(resolveProviders()).toEqual([]);
  });

  it("finds Ollama on its default port", () => {
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    const p = resolveProviders();
    expect(p[0].id).toBe("ollama");
  });

  it("finds OpenRouter only when a key is set", () => {
    expect(resolveProviders()).toEqual([]);
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const p = resolveProviders();
    expect(p).toHaveLength(1);
    expect(p[0].needsKey).toBe(true);
    expect(p[0].kind).toBe("remote");
  });

  it("keeps the key out of the provider list", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-secret-value";
    const listed = resolveProviders().map((p) => JSON.stringify(p));
    for (const l of listed) expect(l).not.toContain("sk-or-secret-value");
  });

  it("gives the key only to the provider that needs it", () => {
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    process.env.OPENROUTER_API_KEY = "sk-or-secret-value";
    const ollama = getProvider("ollama")!;
    const openrouter = getProvider("openrouter")!;
    expect(providerKey(ollama)).toBeNull();
    expect(providerKey(openrouter)).toBe("sk-or-secret-value");
  });

  it("returns null for a provider this deployment does not have", () => {
    expect(getProvider("openrouter")).toBeNull();
    expect(getProvider("nonsense")).toBeNull();
  });

  it("refuses a model id that is not one", () => {
    expect(isPlausibleModel("gpt-4o-mini")).toBe(true);
    expect(isPlausibleModel("google/gemini-2.5-flash")).toBe(true);
    expect(isPlausibleModel("../../etc/passwd")).toBe(false);
    expect(isPlausibleModel("model with spaces")).toBe(false);
    expect(isPlausibleModel("")).toBe(false);
    expect(isPlausibleModel(42)).toBe(false);
  });
});

describe("model downloads", () => {
  it("refuses a filename that could escape the models directory", () => {
    expect(isSafeFilename("model.gguf")).toBe(true);
    expect(isSafeFilename("../../etc/passwd")).toBe(false);
    expect(isSafeFilename("model.gguf/../../x")).toBe(false);
    expect(isSafeFilename("")).toBe(false);
  });

  it("refuses a download from a host that is not allowlisted", async () => {
    await expect(
      ai.startDownloadAction({ url: "https://evil.example.com/model.gguf", filename: "model.gguf" }, ctx),
    ).rejects.toThrow("DOWNLOAD_HOST_NOT_ALLOWED");
  });

  it("refuses a download with no filename", async () => {
    await expect(
      ai.startDownloadAction({ url: "https://huggingface.co/x/model.gguf" }, ctx),
    ).rejects.toThrow("AI_DOWNLOAD_INVALID");
  });

  it("refuses a filename that could escape the models directory", async () => {
    await expect(
      ai.startDownloadAction({ url: "https://huggingface.co/x/model.gguf", filename: "../evil" }, ctx),
    ).rejects.toThrow("DOWNLOAD_FILENAME_INVALID");
  });
});

describe("the chat capability", () => {
  it("refuses a provider this deployment does not have", async () => {
    await expect(
      ai.chat({ provider: "openrouter", model: "x", messages: [] }, ctx),
    ).rejects.toThrow("AI_PROVIDER_NOT_CONFIGURED");
  });

  it("refuses a model id that is not one", async () => {
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    await expect(
      ai.chat({ provider: "ollama", model: "../../etc/passwd", messages: [{ role: "user", content: "hi" }] }, ctx),
    ).rejects.toThrow("AI_MODEL_INVALID");
  });

  it("refuses a request with no messages", async () => {
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    await expect(
      ai.chat({ provider: "ollama", model: "llama3", messages: [] }, ctx),
    ).rejects.toThrow("AI_MESSAGES_REQUIRED");
  });

  it("refuses a request with too many messages", async () => {
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    await expect(
      ai.chat({
        provider: "ollama", model: "llama3",
        messages: Array.from({ length: 101 }, () => ({ role: "user", content: "hi" })),
      }, ctx),
    ).rejects.toThrow("AI_TOO_MANY_MESSAGES");
  });
});
