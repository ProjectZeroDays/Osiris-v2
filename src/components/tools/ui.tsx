"use client";

/**
 * The shared window primitives.
 *
 * Every tool window is built from these, so they all look and behave the
 * same way: the same tabs, the same table, the same status pill, the same
 * action row. A window that rolls its own would drift from the others, and
 * the drift is what makes a platform feel unfinished.
 */

import type { ReactNode } from "react";

export function ToolTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
}) {
  return (
    <div role="tablist" className="tool-tabs">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={t === active}
          className={t === active ? "is-active" : ""}
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function ToolTable<T extends Record<string, unknown>>({
  rows,
  cols,
  empty = "Nothing to show",
}: {
  rows: T[];
  cols: Array<{ key: keyof T & string; label: string }>;
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="tool-empty">{empty}</p>;
  }
  return (
    <div className="tool-table-wrap">
      <table className="tool-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.key} title={String(r[c.key] ?? "")}>
                  {r[c.key] === null || r[c.key] === undefined || r[c.key] === ""
                    ? "—"
                    : String(r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ToolStatus({ state }: { state: string }) {
  return <span className={`tool-status tool-status--${state}`}>{state}</span>;
}

export function ToolActions({
  actions,
}: {
  actions: Array<{ label: string; onClick: () => void; disabled?: boolean }>;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="tool-actions">
      {actions.map((a) => (
        <button key={a.label} type="button" onClick={a.onClick} disabled={a.disabled}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

export function ToolField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="tool-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ToolInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`tool-input ${props.className ?? ""}`} />;
}

export function ToolTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`tool-input tool-textarea ${props.className ?? ""}`} />;
}

export function ToolSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`tool-input ${props.className ?? ""}`} />;
}

export function ToolNotice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "error" | "ok";
  children: ReactNode;
}) {
  return <p className={`tool-notice tool-notice--${tone}`}>{children}</p>;
}

/** A labelled panel inside a window's body. */
export function ToolSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="tool-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}
