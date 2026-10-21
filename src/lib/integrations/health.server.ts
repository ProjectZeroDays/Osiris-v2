import "server-only";

/**
 * Per-source health.
 *
 * An upstream that has started failing should say so, and the platform
 * should say so too, rather than every caller discovering it separately and
 * reporting it as a different error. A source that keeps failing is marked
 * degraded, and one that keeps failing is marked down; either way the
 * cooldown stops the platform from hammering it.
 */

export type SourceHealth = "healthy" | "degraded" | "down";

interface SourceState {
  health: SourceHealth;
  consecutiveFailures: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  cooldownUntil: number | null;
}

/** Failures in a row before a source is called degraded. */
const DEGRADE_AFTER = 2;
/** Failures in a row before a source is called down. */
const DOWN_AFTER = 4;
/** How long a failing source is left alone before it is tried again. */
const COOLDOWN_MS = 60_000;

const sources = new Map<string, SourceState>();

function state(source: string): SourceState {
  let s = sources.get(source);
  if (!s) {
    s = {
      health: "healthy",
      consecutiveFailures: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      cooldownUntil: null,
    };
    sources.set(source, s);
  }
  return s;
}

export function recordSuccess(source: string, at = Date.now()): void {
  const s = state(source);
  s.health = "healthy";
  s.consecutiveFailures = 0;
  s.lastSuccessAt = at;
  s.lastError = null;
  s.cooldownUntil = null;
}

export function recordFailure(source: string, error: string, at = Date.now()): void {
  const s = state(source);
  s.consecutiveFailures += 1;
  s.lastFailureAt = at;
  s.lastError = error;
  s.health =
    s.consecutiveFailures >= DOWN_AFTER
      ? "down"
      : s.consecutiveFailures >= DEGRADE_AFTER
        ? "degraded"
        : "healthy";
  if (s.health === "down") s.cooldownUntil = at + COOLDOWN_MS;
}

export function getHealth(source: string): SourceState {
  return { ...state(source) };
}

export function allHealth(): Record<string, SourceState> {
  const out: Record<string, SourceState> = {};
  for (const [name, s] of sources) out[name] = { ...s };
  return out;
}

/** True when the source is in cooldown and should not be called. */
export function isCoolingDown(source: string, at = Date.now()): boolean {
  const s = state(source);
  return s.cooldownUntil !== null && s.cooldownUntil > at;
}

/** The number of seconds until the source may be tried again, or 0. */
export function cooldownRemaining(source: string, at = Date.now()): number {
  const s = state(source);
  if (!s.cooldownUntil || s.cooldownUntil <= at) return 0;
  return Math.ceil((s.cooldownUntil - at) / 1000);
}
