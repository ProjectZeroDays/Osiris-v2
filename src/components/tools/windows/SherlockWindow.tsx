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
 * The Sherlock window.
 *
 * A username search is a search for a person, so it needs a consent
 * attestation and it is recorded as one. The attestation is not a
 * formality: it is what the audit trail points at afterwards.
 */
export function SherlockWindow() {
  const [tab, setTab] = useState("check handle");
  const [handle, setHandle] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Array<{ site: string; url: string }>>([]);

  const check = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/sherlock/controlledHandle.checkSingle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          purpose: "consent-controlled handle check",
          consentAttestation: consent,
          payload: handle,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.errorCode ?? `HTTP_${res.status}`);
        return;
      }
      const found = (json.data?.findings?.[0]?.properties?.matches ?? []) as Array<{
        site: string;
        url: string;
      }>;
      setMatches(found);
      setTab("results");
    } catch {
      setError("The request could not be made.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tool-window__inner">
      <ToolTabs tabs={["check handle", "results"]} active={tab} onChange={setTab} />

      {tab === "check handle" && (
        <>
          <ToolField label="Handle">
            <ToolInput
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="a-handle"
            />
          </ToolField>
          <label className="tool-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I am authorised to check this handle, and the result is for the
              stated purpose.
            </span>
          </label>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[
              { label: "Check", onClick: () => void check(), disabled: loading || !handle.trim() || !consent },
            ]}
          />
        </>
      )}

      {tab === "results" && (
        <>
          <ToolActions actions={[{ label: "Back", onClick: () => setTab("check handle") }]} />
          <ToolTable
            rows={matches as unknown as Array<Record<string, unknown>>}
            cols={[
              { key: "site", label: "Site" },
              { key: "url", label: "URL" },
            ]}
            empty="No accounts were found."
          />
        </>
      )}
    </div>
  );
}
