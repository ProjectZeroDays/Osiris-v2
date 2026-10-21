import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { SECURITY_TOOL_CARDS, INTEGRATION_STATE_LABEL, STATE_TONE, RISK_CLASS_NOTES, type IntegrationCard } from "@/config/security-tools";
import { deriveIntegrationState } from "@/lib/integrations/state.server";
import { SAFE_CAPABILITIES } from "@/lib/integrations/capabilities.server";
import { TOOL_ICONS } from "@/components/security-tools/icons";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return SECURITY_TOOL_CARDS.map((c) => ({ tool: c.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>;
}): Promise<Metadata> {
  const { tool } = await params;
  const card = SECURITY_TOOL_CARDS.find((c) => c.id === tool);
  if (!card) return { title: "Tool not found" };
  return {
    title: `${card.name} — Authorized Security Tool`,
    description: card.purpose,
  };
}

export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool } = await params;
  const card = SECURITY_TOOL_CARDS.find((c) => c.id === tool) as IntegrationCard | undefined;
  if (!card) notFound();

  const Icon = TOOL_ICONS[card.id];
  const state = deriveIntegrationState(card.id);
  const capabilities = SAFE_CAPABILITIES[card.id];
  const tone = STATE_TONE[state];
  const riskNote = RISK_CLASS_NOTES[card.riskClass];

  return (
    <main className="tool-detail">
      <Link href="/tools/security" className="tool-detail__back">&larr; All security tools</Link>

      <header className="tool-detail__header">
        <Icon aria-hidden="true" focusable="false" />
        <h1>{card.name}</h1>
        <p>{card.purpose}</p>
        <span className={`state-badge state-badge--${tone}`}>
          {INTEGRATION_STATE_LABEL[state]}
        </span>
      </header>

      <section aria-labelledby="scope">
        <h2 id="scope">Scope &amp; consent</h2>
        <ul>
          {card.requiresAsset && <li>Requires a verified asset record.</li>}
          {card.requiresConsent && <li>Requires a consent/ownership attestation.</li>}
          <li>Retention: {card.retentionDays} days.</li>
          {card.upstream && <li>Upstream: {card.upstream}</li>}
          <li>Risk class: {card.riskClass}.</li>
          <li>{riskNote}</li>
        </ul>
      </section>

      <section aria-labelledby="caps">
        <h2 id="caps">Allowed capabilities</h2>
        <ul>
          {capabilities.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
      </section>

      {card.id === "quantum-cli" && (
        <p className="notice">
          Disabled by policy. No API route, no process, no network connection.
        </p>
      )}
    </main>
  );
}