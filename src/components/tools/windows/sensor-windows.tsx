"use client";

import { useState } from "react";
import type { SecurityToolId } from "@/config/security-tools";
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
 * A window whose body is a JSON import.
 *
 * The import posts to the gated dispatcher and shows what the dispatcher
 * answered. The window does not re-derive the result, so what is on
 * screen is exactly what was recorded.
 */
export function JsonImportWindow({
  tool,
  capability,
  tabs,
  label,
  placeholder,
  resultTab,
  columns,
  emptyText,
  notice,
}: {
  tool: SecurityToolId;
  capability: string;
  tabs: string[];
  label: string;
  placeholder: string;
  resultTab: string;
  columns: Array<{ key: string; label: string }>;
  emptyText?: string;
  notice?: { tone: "info" | "warn" | "error" | "ok"; text: string };
}) {
  const [tab, setTab] = useState(tabs[0]);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  const run = async () => {
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
      const res = await fetch(`/api/integrations/${tool}/${capability}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ purpose: "operator import", payload }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.errorCode ?? `HTTP_${res.status}`);
        return;
      }
      const data = json.data ?? {};
      const list = (data.findings ?? data.cameras ?? data.drones ?? data.devices ?? data.events ?? data.reports ?? []) as Array<Record<string, unknown>>;
      setRows(list);
      setTab(resultTab);
    } catch {
      setError("The request could not be made.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-window__inner">
      <ToolTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === tabs[0] && (
        <>
          <ToolField label={label}>
            <ToolTextarea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={placeholder} spellCheck={false} />
          </ToolField>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          {notice && <ToolNotice tone={notice.tone}>{notice.text}</ToolNotice>}
          <ToolActions
            actions={[
              { label: "Import", onClick: () => void run(), disabled: loading || !raw.trim() },
              { label: "Clear", onClick: () => { setRaw(""); setError(null); } },
            ]}
          />
        </>
      )}

      {tab === resultTab && (
        <>
          <ToolActions actions={[{ label: "Back to import", onClick: () => setTab(tabs[0]) }]} />
          <ToolTable
            rows={rows}
            cols={columns as never}
            empty={emptyText ?? "Nothing imported yet."}
          />
        </>
      )}
    </div>
  );
}

/**
 * The Wifite3 window.
 *
 * The scan tab says plainly that a scan transmits. The interface tab
 * says where the binary is, because the operator's host — not the
 * platform — is where the radio lives.
 */
export function Wifite3Window() {
  const [tab, setTab] = useState("interfaces");
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  const [aps, setAps] = useState<Array<Record<string, unknown>>>([]);

  const call = async (capability: string, body: unknown) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/wifite3/${capability}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ purpose: "wireless assessment", payload: body }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.errorCode ?? `HTTP_${res.status}`);
        return null;
      }
      return json.data ?? {};
    } catch {
      setError("The request could not be made.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-window__inner">
      <ToolTabs tabs={["interfaces", "scan", "captures", "cracked"]} active={tab} onChange={setTab} />

      {tab === "interfaces" && (
        <>
          <ToolNotice tone="warn">
            Wifite3 transmits. A scan may deauthenticate nearby devices and
            attempt WPS PINs, which can knock a neighbour&apos;s phone off
            the network. Only run it on a network you are authorised to
            assess.
          </ToolNotice>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[{ label: "List interfaces", onClick: async () => setInfo(await call("wifi.listInterfaces", {})), disabled: loading }]}
          />
          {info && (
            <ToolTable
              rows={[info]}
              cols={[
                { key: "binary", label: "Binary" },
                { key: "variant", label: "Variant" },
                { key: "reason", label: "Note" },
              ]}
            />
          )}
        </>
      )}

      {tab === "scan" && (
        <>
          <ToolField label="Target (BSSID)">
            <ToolInput value={target} onChange={(e) => setTarget(e.target.value)} placeholder="aa:bb:cc:dd:ee:ff" />
          </ToolField>
          <ToolNotice tone="warn">
            The scan runs on the operator&apos;s host, where the monitor-mode
            interface lives. OSIRIS records the request and hands back the
            command to run.
          </ToolNotice>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[{ label: "Request scan", onClick: async () => setInfo(await call("wifi.requestScan", { target })), disabled: loading || !target.trim() }]}
          />
          {info && (
            <ToolTable
              rows={[info]}
              cols={[
                { key: "target", label: "Target" },
                { key: "command", label: "Command" },
                { key: "warning", label: "Warning" },
              ]}
            />
          )}
        </>
      )}

      {tab === "captures" && (
        <>
          <ToolNotice tone="info">
            Handshakes and PMKIDs are imported as records that point at the
            operator&apos;s own files. The passphrase itself is not stored.
          </ToolNotice>
          <ToolActions
            actions={[{ label: "Import capture", onClick: async () => setInfo(await call("wifi.importCapture", { bssid: target, kind: "wpa-handshake" })), disabled: loading }]}
          />
          {info && <ToolTable rows={[info]} cols={[{ key: "id", label: "ID" }]} />}
        </>
      )}

      {tab === "cracked" && (
        <>
          <ToolActions
            actions={[{ label: "Import networks", onClick: async () => { const d = await call("wifi.importCracked", { aps: [] }); setAps((d?.findings ?? []) as Array<Record<string, unknown>>); }, disabled: loading }]}
          />
          <ToolTable
            rows={aps}
            cols={[
              { key: "ssid", label: "SSID" },
              { key: "bssid", label: "BSSID" },
              { key: "security", label: "Security" },
              { key: "band", label: "Band" },
              { key: "wps", label: "WPS" },
            ]}
            empty="No networks imported."
          />
        </>
      )}
    </div>
  );
}

/**
 * The Quantum-CLI window.
 *
 * Depth A: the tool stays outside, and its run reports come in as files.
 * The window says so rather than offering a connection that does not
 * exist.
 */
export function QuantumWindow() {
  const [tab, setTab] = useState("import report");
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<Record<string, unknown> | null>(null);

  const importReport = async () => {
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
      const res = await fetch("/api/integrations/quantum-cli/quantum.importRunReport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ purpose: "orchestration report import", payload }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.errorCode ?? `HTTP_${res.status}`);
        return;
      }
      setRun(json.data?.run ?? null);
      setTab("phase timeline");
    } catch {
      setError("The request could not be made.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-window__inner">
      <ToolTabs tabs={["import report", "phase timeline", "runs"]} active={tab} onChange={setTab} />

      {tab === "import report" && (
        <>
          <ToolNotice tone="info">
            Quantum-CLI drives other tools. It runs outside OSIRIS, on the
            operator&apos;s own host, and only its run reports are imported.
            There is no live connection from here to it.
          </ToolNotice>
          <ToolField label="Paste the run report JSON">
            <ToolTextarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder='{\n  "runId": "run-1",\n  "findings": []\n}'
              spellCheck={false}
            />
          </ToolField>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[{ label: "Import", onClick: () => void importReport(), disabled: loading || !raw.trim() }]}
          />
        </>
      )}

      {tab === "phase timeline" && (
        <>
          <ToolActions actions={[{ label: "Back", onClick: () => setTab("import report") }]} />
          {run ? (
            <ToolTable
              rows={[run]}
              cols={[
                { key: "runId", label: "Run" },
                { key: "startedAt", label: "Started" },
                { key: "finishedAt", label: "Finished" },
                { key: "status", label: "Status" },
                { key: "findingCount", label: "Findings" },
              ]}
            />
          ) : (
            <p className="tool-empty">No run imported.</p>
          )}
        </>
      )}

      {tab === "runs" && (
        <>
          <ToolNotice tone="info">
            Runs are the reports that have been imported. The live run
            list would need a connection to the tool itself, which is not
            made.
          </ToolNotice>
        </>
      )}
    </div>
  );
}
