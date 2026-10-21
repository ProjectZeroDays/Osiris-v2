import { STATE_TONE, type IntegrationState } from "@/config/security-tools";

export function IntegrationStateBadge({ state, label }: { state: IntegrationState; label: string }) {
  return <span className={`state-badge state-badge--${STATE_TONE[state]}`}>{label}</span>;
}