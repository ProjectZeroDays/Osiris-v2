"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  SECURITY_TOOL_CARDS,
  INTEGRATION_STATE_LABEL,
  type IntegrationState,
} from "@/config/security-tools";
import { TOOL_ICONS } from "./icons";
import { IntegrationStateBadge } from "./IntegrationStateBadge";
import { ToolWindowOverlay, useToolWindows, isOpen as isOpenStack } from "@/components/tools/ToolWindow";
import { TOOLS_WITH_WINDOWS } from "@/components/tools/registry";

/**
 * The dashboard is a client component, so the tool states are fetched from
 * the server rather than computed here. The client renders the answer; it
 * never decides whether a tool may act.
 */
export function SecurityToolsGridClient() {
  const [states, setStates] = useState<Record<string, IntegrationState>>({});
  const [failed, setFailed] = useState(false);
  const windows = useToolWindows();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/state", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.states) setStates(d.states as Record<string, IntegrationState>);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-labelledby="security-tools-title" className="security-tools">
      <div className="security-tools__heading">
        <h2 id="security-tools-title">Authorized Security Tools</h2>
        <p>
          For verified assets, approved labs, and consented test accounts only.
          {failed ? " (state unavailable)" : ""}
        </p>
      </div>
      <ul className="security-tools__grid">
        {SECURITY_TOOL_CARDS.map((card) => {
          const Icon = TOOL_ICONS[card.id];
          const state = states[card.id] ?? card.state;
          const hasWindow = TOOLS_WITH_WINDOWS.includes(card.id);
          const disabled = card.id === "quantum-cli";
          const isOpen = isOpenStack(windows.stack, card.id);
          return (
            <li key={card.id}>
              <div className="security-tool-card">
                <Icon aria-hidden="true" focusable="false" />
                <Link className="security-tool-card__name" href={card.href}>
                  {card.name}
                </Link>
                <span className="security-tool-card__purpose">{card.purpose}</span>
                <IntegrationStateBadge state={state} label={INTEGRATION_STATE_LABEL[state]} />
                <div className="security-tool-card__actions">
                  <button
                    type="button"
                    className="security-tool-card__open"
                    onClick={() => windows.open(card.id)}
                    disabled={disabled || !hasWindow}
                    title={
                      disabled
                        ? "Disabled by policy — the window explains why, but no capability is offered."
                        : hasWindow
                          ? isOpen
                            ? "Bring the open window to the front"
                            : "Open the tool window"
                          : "No window for this tool"
                    }
                  >
                    {disabled
                      ? "Disabled"
                      : !hasWindow
                        ? "No window"
                        : isOpen
                          ? "Show"
                          : "Open"}
                  </button>
                  <Link className="security-tool-card__detail" href={card.href}>
                    Details
                  </Link>
                </div>
                <span className="sr-only">Open {card.name} integration</span>
              </div>
            </li>
          );
        })}
      </ul>

      <ToolWindowOverlay
        stack={windows.stack}
        onOpen={windows.open}
        onClose={windows.close}
        onCloseAll={windows.closeAll}
        onCycle={windows.cycle}
      />
    </section>
  );
}
