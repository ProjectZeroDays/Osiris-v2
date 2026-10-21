/**
 * What a refused integration call is answered with.
 *
 * The dispatcher refuses a call for a dozen reasons, and the reason
 * decides the status a caller sees. A caller that is not signed in gets
 * 401, a caller that has no consent gets 403, a tool that is not
 * configured gets 503 - and a worker that is merely busy gets 429,
 * because the worker is not broken and the call can be made again.
 *
 * The mapping lives here rather than in the route so it can be tested
 * without standing up a request. A mapping that is only reachable
 * through a route is a mapping nothing holds.
 */

/** The status a refusal is answered with. */
export function statusForRefusal(message: string): number {
  if (message.includes("UNAUTHENTICATED") || message.includes("TENANT")) return 401;
  if (
    message.includes("DENIED") ||
    message.includes("DISABLED") ||
    message.includes("ASSET_REQUIRED") ||
    message.includes("CONSENT_REQUIRED") ||
    message.includes("NOT_OWNED") ||
    message.includes("QUOTA") ||
    message.includes("COOLDOWN")
  ) {
    return 403;
  }
  // The worker is busy rather than broken: it is already running as many
  // tools as it will, and the caller can come back. That is a 429, not a
  // 502 - a gateway failure would say the platform is unwell, and it is
  // not.
  if (message.includes("BUSY")) return 429;
  if (message.includes("NOT_CONFIGURED") || message.includes("UNAVAILABLE")) return 503;
  if (message.includes("INVALID_")) return 400;
  return 502;
}

/** The code a refusal is reported under. */
export function codeForRefusal(message: string): string {
  return message.split(":")[0];
}
