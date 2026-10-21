"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ToolActions,
  ToolField,
  ToolInput,
  ToolNotice,
  ToolTable,
  ToolTabs,
} from "../ui";

/**
 * The AI providers window.
 *
 * Two things are shown: the providers the deployment has, and the models
 * it has on disk. A download is started here, but the platform decides
 * whether it is allowed — the host list is not the operator's to widen
 * from a browser.
 */
export function AiProvidersWindow() {
  const [tab, setTab] = useState("providers");
  const [providers, setProviders] = useState<Array<Record<string, unknown>>>([]);
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]);
  const [installed, setInstalled] = useState<Array<Record<string, unknown>>>([]);
  const [url, setUrl] = useState("");
  const [filename, setFilename] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([
        fetch("/api/ai/providers", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/ai/downloads", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setProviders(p?.providers ?? []);
      setJobs(d?.jobs ?? []);
      setInstalled(d?.installed ?? []);
    } catch {
      setError("The provider list could not be read.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => void refresh(), 3000);
    return () => clearInterval(iv);
  }, [refresh]);

  const startDownload = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, filename }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "The download could not be started.");
        return;
      }
      setUrl("");
      setFilename("");
      await refresh();
    } catch {
      setError("The download could not be started.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-window__inner">
      <ToolTabs
        tabs={["providers", "downloads", "installed"]}
        active={tab}
        onChange={setTab}
      />

      {tab === "providers" && (
        <>
          <ToolNotice tone="info">
            These are the deployment&apos;s providers, configured on the
            server. They are separate from OI&apos;s, which take the
            visitor&apos;s own key and never touch the server.
          </ToolNotice>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolTable
            rows={providers}
            cols={[
              { key: "label", label: "Provider" },
              { key: "kind", label: "Kind" },
              { key: "endpoint", label: "Endpoint" },
              { key: "notes", label: "Notes" },
            ]}
            empty="No providers are configured. Set LLAMA_CPP_URL, MLX_URL, OLLAMA_URL or OPENROUTER_API_KEY."
          />
        </>
      )}

      {tab === "downloads" && (
        <>
          <ToolField label="Model URL">
            <ToolInput
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://huggingface.co/…/model.gguf"
            />
          </ToolField>
          <ToolField label="Filename">
            <ToolInput
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="model.gguf"
            />
          </ToolField>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[
              {
                label: "Start download",
                onClick: () => void startDownload(),
                disabled: loading || !url.trim() || !filename.trim(),
              },
            ]}
          />
          <ToolNotice tone="warn">
            A model is a program that will later be loaded into a process.
            Only the allowlisted model hosts are fetched from, and the file
            is written to a temporary name and moved into place only when
            it has finished.
          </ToolNotice>
          <ToolTable
            rows={jobs}
            cols={[
              { key: "filename", label: "File" },
              { key: "status", label: "Status" },
              { key: "bytes", label: "Bytes" },
              { key: "error", label: "Error" },
            ]}
            empty="No downloads yet."
          />
        </>
      )}

      {tab === "installed" && (
        <>
          <ToolActions actions={[{ label: "Refresh", onClick: () => void refresh() }]} />
          <ToolTable
            rows={installed}
            cols={[
              { key: "filename", label: "File" },
              { key: "sizeBytes", label: "Bytes" },
              { key: "modifiedAt", label: "Modified" },
            ]}
            empty="No models on disk."
          />
        </>
      )}
    </div>
  );
}
