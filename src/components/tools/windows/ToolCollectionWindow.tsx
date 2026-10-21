"use client";

import { useEffect, useState } from "react";
import {
  ToolActions,
  ToolField,
  ToolInput,
  ToolNotice,
  ToolTable,
  ToolTabs,
  ToolTextarea,
} from "../ui";

/**
 * The tool collection window.
 *
 * The collection is wide — over a thousand tools — and it runs in a
 * worker behind the platform. This window browses the worker's catalogue
 * and asks the platform to run something from it; the platform applies
 * the allowlist, the asset and consent gates, and writes the audit entry.
 *
 * The tool is run with a purpose, and the purpose is what the audit
 * trail records.
 */
export function ToolCollectionWindow() {
  const [tab, setTab] = useState("catalogue");
  const [catalogue, setCatalogue] = useState<Record<string, unknown>[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string>("");
  const [params, setParams] = useState("{}");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const call = async (capability: string, body: unknown) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/tool-collection/${capability}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ purpose: "operator request", payload: body }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.errorCode ?? `HTTP_${res.status}`);
        return null;
      }
      return json.data ?? {};
    } catch {
      setError("The worker could not be reached.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const loadCatalogue = async () => {
    const data = await call("collection.listTools", {});
    if (!data) return;
    const flat: Record<string, unknown>[] = [];
    for (const [category, entries] of Object.entries(
      (data.tools ?? {}) as Record<string, Array<Record<string, unknown>>>,
    )) {
      for (const e of entries) flat.push({ ...e, category });
    }
    setCatalogue(flat);
    setCategories(Object.keys((data.tools ?? {}) as object));
    setTotal(Number(data.total ?? flat.length));
  };

  useEffect(() => {
    void loadCatalogue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSelected = async () => {
    if (!selected) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(params || "{}");
    } catch {
      setError("The parameters are not valid JSON.");
      return;
    }
    const [category, ...rest] = selected.split("/");
    const tool = rest.join("/");
    const data = await call("collection.execute", { category, tool, params: parsed });
    if (!data) return;
    setOutput(JSON.stringify(data, null, 2));
    setTab("output");
  };

  return (
    <div className="tool-window__inner">
      <ToolTabs tabs={["catalogue", "run", "output"]} active={tab} onChange={setTab} />

      {tab === "catalogue" && (
        <>
          <ToolNotice tone="info">
            The collection runs in a worker behind the platform. The platform
            decides which tool may run, on whose behalf, and records it; the
            worker answers only the platform.
          </ToolNotice>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[{ label: "Refresh", onClick: () => void loadCatalogue(), disabled: loading }]}
          />
          <p className="tool-note">
            {total} tools in {categories.length} categories.
          </p>
          <ToolTable
            rows={catalogue.slice(0, 300)}
            cols={[
              { key: "name", label: "Tool" },
              { key: "category", label: "Category" },
              { key: "description", label: "Description" },
            ]}
            empty="The worker has not reported a catalogue."
          />
        </>
      )}

      {tab === "run" && (
        <>
          <ToolField label="Tool (category/name)">
            <ToolInput
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              placeholder="recon/shodan"
            />
          </ToolField>
          <ToolField label="Parameters (JSON)">
            <ToolTextarea
              value={params}
              onChange={(e) => setParams(e.target.value)}
              placeholder='{"query": "example.com"}'
              spellCheck={false}
            />
          </ToolField>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[
              { label: "Run", onClick: () => void runSelected(), disabled: loading || !selected.trim() },
            ]}
          />
          <ToolNotice tone="warn">
            The collection requires an asset and a consent attestation. The
            platform checks both before the worker is asked to do anything.
          </ToolNotice>
        </>
      )}

      {tab === "output" && (
        <>
          <ToolActions actions={[{ label: "Back", onClick: () => setTab("run") }]} />
          {output ? (
            <pre className="tool-output">{output}</pre>
          ) : (
            <p className="tool-empty">Nothing has been run yet.</p>
          )}
        </>
      )}
    </div>
  );
}
