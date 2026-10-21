import "server-only";
import type { AdapterContext } from "../types";

/**
 * The tool collection.
 *
 * The Cyber-Security tool collection is wide — over a thousand tools — and
 * it runs some of them as subprocesses. That is exactly the execution
 * the platform's own adapters refuse, so the collection lives in a
 * separate worker process, and the platform reaches it through these
 * capabilities rather than running it in-process.
 *
 * The worker answers only the platform: it checks a shared secret on
 * every request but its health check. The allowlist here is the
 * platform's, and it is what the client's request passes through before
 * the worker is asked anything.
 */

const WORKER_KEY_HEADER = "X-OSIRIS-Worker-Key";
const WORKER_TIMEOUT_MS = 60_000;

export interface ToolCollectionEntry {
  name: string;
  path: string;
  category: string;
  description?: string;
}

/**
 * Where the worker is.
 *
 * The worker runs on the same machine as the platform, or on the same
 * private network as it — the compose service name, in the Docker
 * deployment. It is not something to put on the public internet: it
 * imports tool modules and runs some of them as subprocesses, and the
 * platform is the boundary that decides whether that may happen. So only
 * a local address is accepted, and a remote one is refused.
 */
const LOCAL_WORKER_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "0.0.0.0",
  // The compose service name: the same private network, not the internet.
  "osiris-intel",
  "host.docker.internal",
]);

function workerBase(): string | null {
  const raw = process.env.OSIRIS_WORKER_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!LOCAL_WORKER_HOSTS.has(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function workerKey(): string | null {
  return process.env.OSIRIS_WORKER_KEY?.trim() || null;
}

export async function listTools(_payload: unknown, _ctx: AdapterContext) {
  const base = workerBase();
  if (!base) throw new Error("COLLECTION_WORKER_NOT_CONFIGURED");
  const key = workerKey();
  if (!key) throw new Error("COLLECTION_WORKER_KEY_MISSING");

  const res = await fetch(`${base}/api/tools`, {
    headers: { [WORKER_KEY_HEADER]: key, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  }).catch(() => null);

  if (!res) throw new Error("COLLECTION_WORKER_UNREACHABLE");
  if (!res.ok) throw new Error(`COLLECTION_WORKER_HTTP_${res.status}`);

  const data = (await res.json()) as {
    tools?: Record<string, ToolCollectionEntry[]>;
    total?: number;
  };

  return {
    total: data.total ?? 0,
    categories: Object.keys(data.tools ?? {}),
    tools: data.tools ?? {},
  };
}

export async function listCategory(payload: unknown, _ctx: AdapterContext) {
  const p = payload as { category?: string };
  if (!p?.category) throw new Error("COLLECTION_CATEGORY_REQUIRED");

  const base = workerBase();
  if (!base) throw new Error("COLLECTION_WORKER_NOT_CONFIGURED");
  const key = workerKey();
  if (!key) throw new Error("COLLECTION_WORKER_KEY_MISSING");

  const res = await fetch(
    `${base}/api/tools/${encodeURIComponent(p.category)}`,
    {
      headers: { [WORKER_KEY_HEADER]: key, accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    },
  ).catch(() => null);

  if (!res) throw new Error("COLLECTION_WORKER_UNREACHABLE");
  if (res.status === 404) throw new Error("COLLECTION_CATEGORY_NOT_FOUND");
  if (!res.ok) throw new Error(`COLLECTION_WORKER_HTTP_${res.status}`);

  return (await res.json()) as { category: string; tools: ToolCollectionEntry[]; total: number };
}

/**
 * Run one tool from the collection.
 *
 * The worker is asked to run a tool that is in its own catalogue — the
 * category and the name are checked against what the worker reports, so
 * a request cannot name a path the worker does not know about. The
 * parameters are the caller's, and the worker sanitises them.
 *
 * What comes back is a *claim*, and it is recorded as one. A finding
 * produced by a tool is inferred, not observed: the platform did not
 * verify it, and the provenance says which code produced it and what
 * that code hashed to. A reader can therefore tell a tool's assertion
 * from a fact the platform checked itself.
 */
export async function execute(payload: unknown, ctx: AdapterContext) {
  const p = payload as { category?: string; tool?: string; params?: unknown };
  if (!p?.category || !p?.tool) {
    throw new Error("COLLECTION_TOOL_REQUIRED");
  }

  const base = workerBase();
  if (!base) throw new Error("COLLECTION_WORKER_NOT_CONFIGURED");
  const key = workerKey();
  if (!key) throw new Error("COLLECTION_WORKER_KEY_MISSING");

  // The catalogue is checked first, so the worker is only ever asked
  // about a tool it has actually discovered.
  const catalogue = await listTools({}, ctx);
  const inCategory = catalogue.tools[p.category] ?? [];
  const entry = inCategory.find((t) => t.name === p.tool);
  if (!entry) throw new Error("COLLECTION_TOOL_NOT_FOUND");

  const res = await fetch(
    `${base}/api/tools/${encodeURIComponent(p.category)}/${encodeURIComponent(p.tool)}`,
    {
      method: "POST",
      headers: {
        [WORKER_KEY_HEADER]: key,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(p.params ?? {}),
      signal: AbortSignal.timeout(WORKER_TIMEOUT_MS),
      cache: "no-store",
    },
  ).catch(() => null);

  if (!res) throw new Error("COLLECTION_WORKER_UNREACHABLE");
  if (!res.ok) {
    // The worker refuses a tool call when it is already running as many
    // as it will, and says so with its own code. That is a different
    // thing from a failure, and a caller can retry it, so it is passed
    // on rather than flattened into a bare HTTP status.
    if (res.status === 429) throw new Error("COLLECTION_WORKER_BUSY");
    throw new Error(`COLLECTION_WORKER_HTTP_${res.status}`);
  }

  const body = (await res.json()) as {
    success?: boolean;
    result?: unknown;
    error?: string;
  };

  if (!body?.success) {
    throw new Error(body?.error ?? "COLLECTION_TOOL_FAILED");
  }

  const envelope = body.result as
    | {
        returncode?: number;
        result?: unknown;
        error?: string;
        provenance?: Record<string, unknown>;
      }
    | undefined;

  const provenance = envelope?.provenance ?? {};

  return {
    ...envelope,
    findings: findingsFromTool(envelope?.result, provenance, ctx),
    provenance: {
      tool: provenance.tool ?? p.tool,
      toolPath: provenance.tool_path ?? null,
      toolSha256: provenance.tool_sha256 ?? null,
      entry: provenance.entry ?? null,
      startedAt: provenance.started_at ?? null,
      durationMs: provenance.duration_ms ?? null,
      // A result the platform did not verify is a claim, and it is
      // labelled that way wherever it is shown.
      verified: false,
      attribution: "tool-asserted",
    },
  };
}

/**
 * The findings a tool's result contains, as findings the platform can
 * record.
 *
 * A tool's result is not a finding until it is shaped like one, and the
 * shape says where it came from: the tool that produced it, the hash of
 * that tool's source, and the fact that the platform did not verify it.
 */
function findingsFromTool(
  result: unknown,
  provenance: Record<string, unknown>,
  ctx: AdapterContext,
) {
  const list = Array.isArray(result)
    ? result
    : result && typeof result === "object"
      ? Object.entries(result as Record<string, unknown>).map(([key, value]) => ({
          key,
          ...(typeof value === "object" && value !== null
            ? (value as Record<string, unknown>)
            : { value }),
        }))
      : [];

  const toolHash =
    typeof provenance.tool_sha256 === "string" ? provenance.tool_sha256 : null;
  const toolName =
    typeof provenance.tool === "string" ? provenance.tool : "collection";

  return list.map((item, i) => {
    const props = (item ?? {}) as Record<string, unknown>;
    const id = typeof props.id === "string" ? props.id : `${toolName}:${i}`;
    return {
      id,
      toolId: "tool-collection" as const,
      assetId: ctx.assetId ?? null,
      tenantId: ctx.tenantId,
      sourceUrl: null,
      observedAt:
        typeof provenance.started_at === "string" ? provenance.started_at : null,
      importedAt: new Date().toISOString(),
      severity:
        (props.severity as "info" | "low" | "medium" | "high" | "critical" | null) ??
        null,
      confidence: typeof props.confidence === "number" ? props.confidence : null,
      // A tool's word. Not observed, not verified: inferred, and the
      // provenance says which code produced it.
      status: "inferred" as const,
      // The hash of the tool's source, so the result can be traced to
      // the code that produced it and a later run of a changed tool is
      // visibly a different thing.
      evidenceHash: toolHash,
      retentionUntil: null,
      properties: {
        ...props,
        kind: "security-finding",
        tool: toolName,
        toolSha256: toolHash,
        attribution: "tool-asserted",
        verified: false,
        durationMs: provenance.duration_ms ?? null,
      },
    };
  });
}
