import type { Metadata } from "next";
import Link from "next/link";
import { SECURITY_TOOL_CARDS, INTEGRATION_STATE_LABEL } from "@/config/security-tools";
import { TOOL_ICONS } from "@/components/security-tools/icons";
import { IntegrationStateBadge } from "@/components/security-tools/IntegrationStateBadge";
import { deriveIntegrationState } from "@/lib/integrations/state.server";

export const metadata: Metadata = {
  title: "Authorized Security Tools",
  description:
    "Registry-driven security tool integrations for verified assets, approved labs, and consented test accounts only.",
};

export const dynamic = "force-dynamic";

export default function SecurityToolsIndexPage() {
  const states = Object.fromEntries(
    SECURITY_TOOL_CARDS.map((c) => [c.id, deriveIntegrationState(c.id)]),
  ) as Record<string, (typeof SECURITY_TOOL_CARDS)[number]["state"]>;

  return (
    <main className="security-tools-page">
      <header className="security-tools-page__header">
        <h1>Authorized Security Tools</h1>
        <p>
          For verified assets, approved labs, and consented test accounts only.
          Every capability is allowlisted, every decision is audited, and nothing
          runs in-process.
        </p>
        <Link href="/" className="security-tools-page__back">&larr; Back to the globe</Link>
      </header>

      <ul className="security-tools__grid">
        {SECURITY_TOOL_CARDS.map((card) => {
          const Icon = TOOL_ICONS[card.id];
          const state = states[card.id];
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

      <section className="security-tools-page__policy">
        <h2>Operating policy</h2>
        <ul>
          <li>Deny by default &mdash; a capability must be in the tool&apos;s allowlist to run.</li>
          <li>No generic command runner and no arbitrary upstream URL.</li>
          <li>Findings carry a status: observed, inferred, or unverified.</li>
          <li>Every allow and deny decision is written to the audit trail.</li>
          <li>Each tool has its own retention deadline; findings are pruned after it.</li>
        </ul>
      </section>
    </main>
  );
}