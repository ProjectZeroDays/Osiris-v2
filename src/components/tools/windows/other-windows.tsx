"use client";

import { useState } from "react";
import { ReportImportWindow } from "./ReportImportWindow";
import {
  ToolActions,
  ToolField,
  ToolInput,
  ToolNotice,
  ToolTable,
  ToolTabs,
} from "../ui";

/**
 * The Zenmap window.
 *
 * Two things happen here and they are not the same thing: asking the
 * worker to start a job (which needs an approved asset), and importing a
 * report the operator already has.
 */
export function ZenmapWindow() {
  const [tab, setTab] = useState("request job");
  const [assetId, setAssetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Record<string, unknown> | null>(null);

  const requestJob = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/zenmap/discovery.requestApprovedJob", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ purpose: "approved internal discovery", assetId }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.errorCode ?? `HTTP_${res.status}`);
        return;
      }
      setJob(json.data ?? null);
    } catch {
      setError("The request could not be made.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-window__inner">
      <ToolTabs tabs={["request job", "import report", "results"]} active={tab} onChange={setTab} />

      {tab === "request job" && (
        <>
          <ToolField label="Asset id (must be approved for this tenant)">
            <ToolInput
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              placeholder="asset-1"
            />
          </ToolField>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[
              { label: "Request job", onClick: () => void requestJob(), disabled: loading || !assetId.trim() },
            ]}
          />
          <ToolNotice tone="info">
            The worker runs isolated and non-privileged with a fixed profile.
            OSIRIS never executes a scanner itself.
          </ToolNotice>
        </>
      )}

      {tab === "import report" && (
        <ReportImportWindow
          tool="zenmap"
          capability="report.import"
          tabs={["import report", "results"]}
          label="Paste the Zenmap XML or JSON report"
          placeholder='{\n  "hosts": []\n}'
          findingsLabel="Hosts"
        />
      )}

      {tab === "results" && (
        <>
          <ToolActions actions={[{ label: "Back", onClick: () => setTab("request job") }]} />
          {job ? (
            <ToolTable
              rows={[job]}
              cols={[
                { key: "jobId", label: "Job" },
                { key: "status", label: "Status" },
              ]}
            />
          ) : (
            <p className="tool-empty">No job has been requested.</p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The Maltego window.
 *
 * A graph goes in and a graph comes out. Both are reviewed: the import
 * is of a graph someone has already looked at, and the export contains
 * only assets this tenant owns.
 */
export function MaltegoWindow() {
  const [tab, setTab] = useState("import graph");
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entities, setEntities] = useState<Array<Record<string, unknown>>>([]);

  const importGraph = async () => {
    setError(null);
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      setError("That is not valid JSON.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/maltego/infrastructureGraph.importReviewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ purpose: "reviewed graph exchange", assetId: "graph", payload }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.errorCode ?? `HTTP_${res.status}`);
        return;
      }
      setEntities((json.data?.findings ?? []) as Array<Record<string, unknown>>);
    } catch {
      setError("The request could not be made.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-window__inner">
      <ToolTabs tabs={["import graph", "export graph"]} active={tab} onChange={setTab} />

      {tab === "import graph" && (
        <>
          <ToolField label="Paste the reviewed graph JSON">
            <textarea
              className="tool-input tool-textarea"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder='{\n  "entities": []\n}'
              spellCheck={false}
            />
          </ToolField>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[
              { label: "Import", onClick: () => void importGraph(), disabled: loading || !raw.trim() },
            ]}
          />
          <ToolTable
            rows={entities}
            cols={[
              { key: "id", label: "ID" },
              { key: "type", label: "Type" },
              { key: "value", label: "Value" },
            ]}
            empty="No entities imported."
          />
        </>
      )}

      {tab === "export graph" && (
        <>
          <ToolNotice tone="info">
            An export contains only assets this tenant owns, and it is
            written to a reviewed file rather than pushed anywhere.
          </ToolNotice>
          <ToolActions actions={[{ label: "Export verified graph", onClick: () => undefined }]} />
        </>
      )}
    </div>
  );
}

/**
 * The DedSec CCTV window.
 *
 * Only the operator's own cameras are ever in here. There is no public
 * catalogue behind this window, and no proxy that could be pointed at
 * somebody else's feed.
 */
export function DedSecCctvWindow() {
  const [tab, setTab] = useState("cameras");
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<Record<string, unknown>>>([]);

  const importConfig = async () => {
    setError(null);
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      setError("That is not valid JSON.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/dedsec-cctv/ownedCamera.configImport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ purpose: "owned camera configuration", assetId: "cameras", payload }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.errorCode ?? `HTTP_${res.status}`);
        return;
      }
      setCameras((json.data?.findings ?? []) as Array<Record<string, unknown>>);
    } catch {
      setError("The request could not be made.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-window__inner">
      <ToolTabs tabs={["cameras", "import config"]} active={tab} onChange={setTab} />

      {tab === "cameras" && (
        <>
          <ToolTable
            rows={cameras}
            cols={[
              { key: "id", label: "ID" },
              { key: "label", label: "Label" },
              { key: "lat", label: "Lat" },
              { key: "lon", label: "Lon" },
            ]}
            empty="No cameras configured yet."
          />
        </>
      )}

      {tab === "import config" && (
        <>
          <ToolField label="Paste your camera configuration JSON">
            <textarea
              className="tool-input tool-textarea"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder='{\n  "cameras": []\n}'
              spellCheck={false}
            />
          </ToolField>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[{ label: "Import", onClick: () => void importConfig(), disabled: loading || !raw.trim() }]}
          />
          <ToolNotice tone="warn">
            Only cameras you own may be configured here. There is no public
            catalogue behind this window.
          </ToolNotice>
        </>
      )}
    </div>
  );
}

/**
 * The Ruflo window.
 *
 * Read-only analysis, and a draft that needs an approval before it is
 * anything at all.
 */
export function RufloWindow() {
  const [tab, setTab] = useState("read-only summary");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string>("");

  const ask = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/ruflo/intelSummary.readOnly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ purpose: "read-only analysis", payload: query }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.errorCode ?? `HTTP_${res.status}`);
        return;
      }
      setSummary(json.data?.summary ?? "");
    } catch {
      setError("The request could not be made.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-window__inner">
      <ToolTabs tabs={["read-only summary", "draft report"]} active={tab} onChange={setTab} />

      {tab === "read-only summary" && (
        <>
          <ToolField label="Question">
            <ToolInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What changed in this sector this week?"
            />
          </ToolField>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[{ label: "Summarise", onClick: () => void ask(), disabled: loading || !query.trim() }]}
          />
          {summary && <p className="tool-output">{summary}</p>}
        </>
      )}

      {tab === "draft report" && (
        <>
          <ToolNotice tone="info">
            A draft is created with approval attached. It is not a report
            until that approval is given, and it is recorded as a draft
            either way.
          </ToolNotice>
          <ToolActions actions={[{ label: "Create draft", onClick: () => undefined, disabled: true }]} />
        </>
      )}
    </div>
  );
}

/*
 * The Quantum-CLI window moved to sensor-windows.tsx when the tool
 * changed from quarantined to report-import in v10.
 */
