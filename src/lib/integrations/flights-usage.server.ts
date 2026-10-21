import "server-only";

import { consumeQuota, PLATFORM_TENANT } from "@/lib/integrations/quota.server";

/**
 * What the flight feeds cost.
 *
 * OpenSky is metered in credits: an anonymous caller has a small daily
 * pool and an account has a larger one, and the platform's own comment
 * records a day when the anonymous budget was exhausted and the map went
 * empty. Every request against it is a credit spent, and the platform
 * knows exactly how many it made — so it records them.
 *
 * The adsb.fi feeds are not metered the same way: they are free
 * endpoints with no key, so a call against them costs the operator
 * nothing they are billed for, and recording one would be inventing a
 * unit. Only the OpenSky call is recorded.
 *
 * The unit is the credit, because that is what OpenSky names. The
 * platform does not know what a credit is worth to the operator; it
 * knows how many have been spent, and the operator reconciles that
 * against OpenSky's own dashboard.
 */

/** One OpenSky request, in OpenSky's own unit. */
const OPENSKY_CREDIT = "opensky-credit";

/**
 * The tool the flight feeds' spending is recorded against.
 *
 * The feeds are the platform's own background refresh rather than a
 * capability of a dispatcher tool, so they get their own row.
 */
const FLIGHTS_TOOL = "flights";

/**
 * How many OpenSky calls a day may be recorded.
 *
 * A ceiling rather than a quota: the call has already been made by the
 * time it is recorded, so refusing to record it would hide work that
 * was really done. The figure is far above what a healthy deployment
 * makes — the refresh is at most once every ninety seconds — and it
 * exists so a bug cannot grow the counter without bound.
 */
const RECORDED_CALLS_CEILING = 100_000;

/**
 * Record one OpenSky call.
 *
 * The call has already been made, so this never throws: a platform
 * that cannot write its cost ledger should still serve the map.
 *
 * It is recorded against the platform rather than a tenant. The aircraft
 * feed is refreshed whether or not anyone is watching and the operator
 * pays for it once for the whole deployment, so it is not one tenant's
 * spending — and recording it against a tenant would hide it from
 * everyone else, and hide it entirely on a deployment whose tenant is
 * not called "single-tenant".
 */
export async function recordFlightsUsage(): Promise<void> {
  try {
    await consumeQuota(PLATFORM_TENANT, FLIGHTS_TOOL, RECORDED_CALLS_CEILING, {
      units: 1,
      reported: true,
      unit: OPENSKY_CREDIT,
    });
  } catch {
    // Deliberately swallowed: see the function's own note.
  }
}
