"use client";

import { useState } from "react";
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
 * The scanner window.
 *
 * The radio directories and the CAP feed are both live lookups, so this
 * window asks the upstream and shows what came back. The stream is not
 * proxied through a URL the caller chose — the feed is chosen from the
 * allowlisted directories, so a stream route can only ever serve a feed
 * the platform already knows about.
 */
export function ScannerFeedsWindow() {
  const [tab, setTab] = useState("radio feeds");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feeds, setFeeds] = useState<Array<Record<string, unknown>>>([]);
  const [alerts, setAlerts] = useState<Array<Record<string, unknown>>>([]);

  const call = async (capability: string, body: unknown) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/scanner-feeds/${capability}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ purpose: "public-safety feed lookup", payload: body }),
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
      <ToolTabs tabs={["radio feeds", "emergency alerts"]} active={tab} onChange={setTab} />

      {tab === "radio feeds" && (
        <>
          <ToolField label="State (optional)">
            <ToolInput value={state} onChange={(e) => setState(e.target.value)} placeholder="NY" />
          </ToolField>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[
              {
                label: "Broadcastify",
                onClick: async () => {
                  const d = await call("scanner.listBroadcastifyFeeds", { state: state || undefined });
                  setFeeds((d?.feeds ?? []) as Array<Record<string, unknown>>);
                },
                disabled: loading,
              },
              {
                label: "OpenMHz",
                onClick: async () => {
                  const d = await call("scanner.listOpenMhzSystems", {});
                  setFeeds((d?.feeds ?? []) as Array<Record<string, unknown>>);
                },
                disabled: loading,
              },
            ]}
          />
          <ToolNotice tone="info">
            Public-safety radio is a public record. The directories are
            allowlisted, so a stream URL that was not one of these is
            never fetched.
          </ToolNotice>
          <ToolTable
            rows={feeds}
            cols={[
              { key: "label", label: "Feed" },
              { key: "agency", label: "Agency" },
              { key: "service", label: "Service" },
              { key: "state", label: "State" },
              { key: "status", label: "Status" },
            ]}
            empty="No feeds loaded."
          />
        </>
      )}

      {tab === "emergency alerts" && (
        <>
          <ToolNotice tone="warn">
            CAP carries emergency broadcasts, Amber Alerts, Silver Alerts
            and Blue Alerts alike. They are the same document with a
            different event name, and the family is decided by that name.
          </ToolNotice>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[
              {
                label: "NWS",
                onClick: async () => {
                  const d = await call("scanner.fetchCapAlerts", { source: "nws" });
                  setAlerts((d?.alerts ?? []) as Array<Record<string, unknown>>);
                },
                disabled: loading,
              },
              {
                label: "IPAWS",
                onClick: async () => {
                  const d = await call("scanner.fetchCapAlerts", { source: "ipaws" });
                  setAlerts((d?.alerts ?? []) as Array<Record<string, unknown>>);
                },
                disabled: loading,
              },
            ]}
          />
          <ToolTable
            rows={alerts}
            cols={[
              { key: "event", label: "Event" },
              { key: "severity", label: "Severity" },
              { key: "urgency", label: "Urgency" },
              { key: "areaDesc", label: "Area" },
              { key: "expires", label: "Expires" },
            ]}
            empty="No alerts loaded."
          />
        </>
      )}
    </div>
  );
}

/**
 * The cell window.
 *
 * The tower database is public. The anomalies are heuristics against it,
 * and the window is careful to say so.
 */
export function CellAnomaliesWindow() {
  const [tab, setTab] = useState("observations");
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anomalies, setAnomalies] = useState<Array<Record<string, unknown>>>([]);

  const analyse = async () => {
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
      const res = await fetch("/api/integrations/imsi-catcher/cell.ingestScan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ purpose: "cell observation analysis", payload }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.errorCode ?? `HTTP_${res.status}`);
        return;
      }
      setAnomalies((json.data?.anomalies ?? []) as Array<Record<string, unknown>>);
    } catch {
      setError("The request could not be made.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-window__inner">
      <ToolTabs tabs={["observations", "towers"]} active={tab} onChange={setTab} />

      {tab === "observations" && (
        <>
          <ToolField label="Paste the observed cell scans">
            <ToolTextarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder='{\n  "observations": []\n}'
              spellCheck={false}
            />
          </ToolField>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[{ label: "Analyse", onClick: () => void analyse(), disabled: loading || !raw.trim() }]}
          />
          <ToolNotice tone="warn">
            An anomaly is a pattern worth a second look, not a detection of
            a catcher. A device that looks like one usually is not one.
          </ToolNotice>
          <ToolTable
            rows={anomalies}
            cols={[
              { key: "kind", label: "Anomaly" },
              { key: "cellId", label: "Cell" },
              { key: "confidence", label: "Confidence" },
              { key: "notes", label: "Notes" },
            ]}
            empty="No anomalies."
          />
        </>
      )}

      {tab === "towers" && (
        <>
          <ToolNotice tone="info">
            The tower database is public knowledge. A bounding box is
            required, so the whole world cannot be asked for.
          </ToolNotice>
          <ToolActions actions={[{ label: "Load towers", onClick: () => undefined, disabled: true }]} />
        </>
      )}
    </div>
  );
}

/**
 * The police reports window.
 *
 * Every jurisdiction is a different portal, so the window asks for the
 * portal and the dataset rather than pretending there is one feed.
 */
export function PoliceReportsWindow() {
  const [tab, setTab] = useState("socrata");
  const [host, setHost] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<Array<Record<string, unknown>>>([]);

  const fetchSocrata = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/police-reports/police.fetchSocrata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          purpose: "public incident lookup",
          payload: { host, datasetId, limit: 500 },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.errorCode ?? `HTTP_${res.status}`);
        return;
      }
      setIncidents((json.data?.incidents ?? []) as Array<Record<string, unknown>>);
    } catch {
      setError("The request could not be made.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-window__inner">
      <ToolTabs tabs={["socrata", "arcgis", "import"]} active={tab} onChange={setTab} />

      {tab === "socrata" && (
        <>
          <ToolField label="Portal host (must be allowlisted)">
            <ToolInput
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="data.cityofchicago.org"
            />
          </ToolField>
          <ToolField label="Dataset id">
            <ToolInput
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              placeholder="ijnu-3m8h"
            />
          </ToolField>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[
              { label: "Fetch", onClick: () => void fetchSocrata(), disabled: loading || !host.trim() || !datasetId.trim() },
            ]}
          />
          <ToolTable
            rows={incidents}
            cols={[
              { key: "kind", label: "Type" },
              { key: "severity", label: "Severity" },
              { key: "jurisdiction", label: "City" },
              { key: "address", label: "Block" },
              { key: "occurredAt", label: "Occurred" },
            ]}
            empty="No incidents loaded."
          />
        </>
      )}

      {tab === "arcgis" && (
        <>
          <ToolNotice tone="info">
            Many portals run ArcGIS. The host and the layer path are
            both checked against an allowlist.
          </ToolNotice>
        </>
      )}

      {tab === "import" && (
        <>
          <ToolNotice tone="info">
            A CAD or RMS export from the jurisdiction is imported as a
            file, with the same rules as any other report.
          </ToolNotice>
        </>
      )}
    </div>
  );
}
