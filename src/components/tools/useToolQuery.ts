"use client";

import { useCallback, useEffect, useState } from "react";
import type { SecurityToolId } from "@/config/security-tools";

/**
 * The query hook every tool window uses.
 *
 * It talks to the gated dispatcher and nothing else: the window never
 * calls an upstream directly, never holds a key, and cannot reach a
 * capability the allowlist does not grant. A failure comes back as the
 * error code the platform set, not as a stack trace.
 */
export interface ToolQueryOptions {
  /** A JSON body, merged with the query string. */
  body?: Record<string, unknown>;
  /** Skip the request entirely — used while a required field is empty. */
  enabled?: boolean;
}

export function useToolQuery<T = unknown>(
  tool: SecurityToolId,
  action: string,
  params: Record<string, unknown> = {},
  options: ToolQueryOptions = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);

  const paramKey = JSON.stringify(params);
  const bodyKey = JSON.stringify(options.body ?? {});
  const enabled = options.enabled ?? true;

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ).toString();
      const res = await fetch(
        `/api/integrations/${tool}/${action}${qs ? `?${qs}` : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(options.body ?? {}),
        },
      );
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        throw new Error(json?.errorCode ?? `HTTP_${res.status}`);
      }
      setData((json.data ?? null) as T | null);
      setAuditId(json.auditId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
    } finally {
      setLoading(false);
    }
  }, [tool, action, paramKey, bodyKey, enabled]);

  useEffect(() => {
    void refetch();
    // The keys above stand in for the objects themselves; the objects are
    // rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch]);

  return { data, loading, error, auditId, refetch, setData };
}
