"use client";

import { useState } from "react";
import { useToolQuery } from "../useToolQuery";
import {
  ToolActions,
  ToolField,
  ToolInput,
  ToolNotice,
  ToolTable,
  ToolTabs,
} from "../ui";

/**
 * The Shodan window.
 *
 * A lookup is only permitted for an asset the tenant owns, so the asset id
 * is the first thing asked for. The host is never the subject of the
 * request on its own.
 */
export function ShodanWindow() {
  const [tab, setTab] = useState("host lookup");
  const [assetId, setAssetId] = useState("");
  const [ip, setIp] = useState("");
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);

  const { data, loading, error, auditId, refetch } = useToolQuery<{
    raw?: Record<string, unknown>;
    findings?: Array<Record<string, unknown>>;
  }>("shodan", "host.lookupVerifiedAsset", {}, { enabled: false, body: {} });

  const lookup = async () => {
    if (!assetId.trim() || !ip.trim()) return;
    setTab("host lookup");
    const res = await fetch("/api/integrations/shodan/host.lookupVerifiedAsset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ purpose: "asset exposure check", assetId, payload: ip }),
    }).catch(() => null);
    if (!res) return;
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      setHistory((h) => [{ ip, at: new Date().toISOString(), ok: true }, ...h].slice(0, 25));
      await refetch();
    }
  };

  return (
    <div className="tool-window__inner">
      <ToolTabs tabs={["host lookup", "history", "credits"]} active={tab} onChange={setTab} />

      {tab === "host lookup" && (
        <>
          <ToolField label="Asset id (required — the host must belong to this tenant)">
            <ToolInput
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              placeholder="asset-1"
            />
          </ToolField>
          <ToolField label="IP address">
            <ToolInput
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="203.0.113.10"
            />
          </ToolField>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[
              { label: "Look up", onClick: () => void lookup(), disabled: loading || !assetId.trim() || !ip.trim() },
            ]}
          />
          {auditId && <ToolNotice tone="ok">Query recorded. Audit {auditId.slice(0, 8)}.</ToolNotice>}
        </>
      )}

      {tab === "history" && (
        <>
          <ToolActions actions={[{ label: "Refresh", onClick: () => void refetch(), disabled: loading }]} />
          <ToolTable
            rows={history}
            cols={[
              { key: "ip", label: "IP" },
              { key: "at", label: "When" },
              { key: "ok", label: "Result" },
            ]}
            empty="No lookups yet."
          />
        </>
      )}

      {tab === "credits" && (
        <>
          <p className="tool-note">
            Shodan answers from its own index. OSIRIS holds no Shodan credits
            of its own — the key belongs to the tenant, and a query that
            returns nothing is usually a key that has run out.
          </p>
          <ToolTable
            rows={[]}
            cols={[{ key: "x", label: "x" }]}
            empty="Credit information is read from the API response, not stored here."
          />
        </>
      )}
    </div>
  );
}
