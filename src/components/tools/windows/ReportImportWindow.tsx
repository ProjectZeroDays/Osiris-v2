"use client";

import { useState } from "react";
import type { SecurityToolId } from "@/config/security-tools";
import {
  ToolActions,
  ToolField,
  ToolNotice,
  ToolTable,
  ToolTabs,
  ToolTextarea,
} from "../ui";

/**
 * The report-import window.
 *
 * Most of the tools in the registry do one thing: take a report that was
 * produced elsewhere, validate it, and show what it says. That shape is
 * shared rather than copied, so the validation, the error handling and the
 * findings table are the same everywhere.
 *
 * The import posts to the gated dispatcher. The dispatcher answers with the
 * findings it accepted, and the window shows them — it does not re-derive
 * them, so what is displayed is exactly what was recorded.
 */
export function ReportImportWindow({
  tool,
  capability,
  tabs,
  label = "Paste the report JSON",
  placeholder = '{\n  "findings": []\n}',
  findingsLabel = "Findings",
  extra,
}: {
  tool: SecurityToolId;
  capability: string;
  tabs: string[];
  label?: string;
  placeholder?: string;
  findingsLabel?: string;
  extra?: React.ReactNode;
}) {
  const [tab, setTab] = useState(tabs[0]);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<Array<Record<string, unknown>>>([]);
  const [auditId, setAuditId] = useState<string | null>(null);

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
      const found = (json.data?.findings ?? []) as Array<Record<string, unknown>>;
      setFindings(found);
      setAuditId(json.auditId ?? null);
      setTab(tabs[1]);
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
            <ToolTextarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={placeholder}
              spellCheck={false}
            />
          </ToolField>
          {error && <ToolNotice tone="error">{error}</ToolNotice>}
          <ToolActions
            actions={[
              { label: "Import", onClick: () => void importReport(), disabled: loading || !raw.trim() },
              { label: "Clear", onClick: () => { setRaw(""); setError(null); } },
            ]}
          />
          {extra}
        </>
      )}

      {tab === tabs[1] && (
        <>
          <ToolActions
            actions={[
              { label: "Back to import", onClick: () => setTab(tabs[0]) },
            ]}
          />
          {auditId && <ToolNotice tone="ok">Recorded. Audit {auditId.slice(0, 8)}.</ToolNotice>}
          <ToolTable
            rows={findings}
            cols={[
              { key: "id", label: "ID" },
              { key: "severity", label: "Severity" },
              { key: "status", label: "Status" },
              { key: "confidence", label: "Confidence" },
              { key: "sourceUrl", label: "Source" },
            ]}
            empty={`No ${findingsLabel.toLowerCase()} yet.`}
          />
        </>
      )}
    </div>
  );
}
