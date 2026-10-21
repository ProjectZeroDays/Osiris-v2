import { SECURITY_TOOL_CARDS, INTEGRATION_STATE_LABEL } from "@/config/security-tools";
import { TOOL_ICONS } from "./icons";
import { IntegrationStateBadge } from "./IntegrationStateBadge";
import Link from "next/link";

export function SecurityToolsGrid({ states }: { states?: Record<string, string> }) {
  return (
    <section aria-labelledby="security-tools-title" className="security-tools">
      <div className="security-tools__heading">
        <h2 id="security-tools-title">Authorized Security Tools</h2>
        <p>For verified assets, approved labs, and consented test accounts only.</p>
      </div>
      <ul className="security-tools__grid">
        {SECURITY_TOOL_CARDS.map((card) => {
          const Icon = TOOL_ICONS[card.id];
          const state = (states?.[card.id] ?? card.state) as typeof card.state;
          return (
            <li key={card.id}>
              <Link className="security-tool-card" href={card.href}>
                <Icon aria-hidden="true" focusable="false" />
                <span className="security-tool-card__name">{card.name}</span>
                <span className="security-tool-card__purpose">{card.purpose}</span>
                <IntegrationStateBadge state={state} label={INTEGRATION_STATE_LABEL[state]} />
                <span className="sr-only">Open {card.name} integration</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}