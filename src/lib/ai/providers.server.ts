import "server-only";

/**
 * The platform's own model providers.
 *
 * These are different from OI's providers, and the difference matters.
 * OI takes the visitor's own key, held in their browser and sent per
 * request; nothing is stored and the platform never holds it. The
 * providers here are the deployment's: a local model server the operator
 * runs, or a remote key the operator put in the environment. The platform
 * holds the key, so it is the platform's business to keep it.
 *
 * The origins are fixed. There is deliberately no "custom base URL":
 * a caller-chosen endpoint would turn the chat proxy into a relay into
 * anything the server can reach.
 */

export type ProviderId = "local-gguf" | "local-mlx" | "ollama" | "openrouter";

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  kind: "local" | "remote";
  endpoint: string;
  needsKey: boolean;
  models: string[];
  notes: string;
}

/** The origins a local provider may be pointed at. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "0.0.0.0", "host.docker.internal"]);

function localEndpoint(raw: string | undefined, fallback: string): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // A local provider that is not on the loopback is a remote provider
  // wearing a local name, and it would carry a local provider's trust.
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!LOCAL_HOSTS.has(url.hostname)) return null;
  return url.origin;
}

function csv(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
}

/**
 * The providers this deployment has.
 *
 * The order matters: a local provider comes first, because a local model
 * is cheaper and its data never leaves the machine.
 */
export function resolveProviders(): ProviderConfig[] {
  const out: ProviderConfig[] = [];

  const gguf = localEndpoint(process.env.LLAMA_CPP_URL, "");
  if (gguf) {
    out.push({
      id: "local-gguf", label: "Local GGUF (llama.cpp)", kind: "local",
      endpoint: gguf, needsKey: false,
      models: csv(process.env.LLAMA_CPP_MODELS),
      notes: "Runs on loopback. Bind llama.cpp to 127.0.0.1.",
    });
  }

  const mlx = localEndpoint(process.env.MLX_URL, "");
  if (mlx) {
    out.push({
      id: "local-mlx", label: "Local MLX", kind: "local",
      endpoint: mlx, needsKey: false,
      models: csv(process.env.MLX_MODELS),
      notes: "Apple Silicon only. Runs on loopback.",
    });
  }

  const ollama = localEndpoint(process.env.OLLAMA_URL ?? process.env.OLLAMA_HOST, "http://127.0.0.1:11434");
  if (ollama) {
    out.push({
      id: "ollama", label: "Ollama", kind: "local",
      endpoint: ollama, needsKey: false,
      models: csv(process.env.OLLAMA_MODELS),
      notes: "Default bind is 127.0.0.1:11434.",
    });
  }

  if (process.env.OPENROUTER_API_KEY) {
    out.push({
      id: "openrouter", label: "OpenRouter", kind: "remote",
      endpoint: "https://openrouter.ai/api/v1", needsKey: true,
      models: csv(process.env.OPENROUTER_MODELS),
      notes: "Key stays server-side. Never NEXT_PUBLIC_*.",
    });
  }

  return out;
}

/** One provider by id, or null when this deployment does not have it. */
export function getProvider(id: string): ProviderConfig | null {
  return resolveProviders().find((p) => p.id === id) ?? null;
}

/** The key a provider needs, or null. Never logged, never returned. */
export function providerKey(provider: ProviderConfig): string | null {
  if (!provider.needsKey) return null;
  if (provider.id === "openrouter") return process.env.OPENROUTER_API_KEY ?? null;
  return null;
}

/**
 * A model id we are willing to put in a request.
 *
 * A model id ends up in a URL for some providers, so it is restricted to
 * the characters a model id is made of, and a path traversal in it is
 * refused outright.
 */
export function isPlausibleModel(model: unknown): model is string {
  return (
    typeof model === "string" &&
    model.length >= 1 &&
    model.length <= 120 &&
    /^[A-Za-z0-9._:/@+-]+$/.test(model) &&
    !model.includes("..")
  );
}
