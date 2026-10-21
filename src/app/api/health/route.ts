import { NextResponse } from 'next/server';
import { nominatimStats } from '@/lib/nominatim';
import { getDb } from '@/db/client.server';
import { registrySurface } from '@/lib/integrations/registry-gate';

/**
 * OSIRIS - process liveness.
 *
 * This endpoint used to answer `status: 'operational'` unconditionally. It
 * checked nothing, so it reported the platform healthy while every upstream
 * feed was down - the one circumstance a health check exists to catch.
 *
 * It does not probe the feeds now either: a health check that fans out to a
 * dozen third-party APIs on every call is a self-inflicted outage under load.
 * What it does instead is stop claiming to know. The scope is stated in the
 * response, so a monitor reading this cannot mistake "the server answered" for
 * "the data is flowing".
 */
export async function GET() {
  /*
   * What a client will meet.
   *
   * A deployment may close its tool registry behind a session, and a client
   * that has not signed in gets a 401 from it. An operator who cannot see
   * that from outside has no way of telling a client that is misconfigured
   * from a client that is not signed in. So the surface is stated here, in
   * the same place an operator would look for it.
   */
  const surface = registrySurface(Boolean(getDb()));

  return NextResponse.json({
    /* True by construction: returning this response is the thing being
       reported. Nothing here is an assertion about the feeds. */
    status: 'serving',
    scope: 'process',
    checks_performed: 'none',
    detail:
      'The application process is up and answering requests. Upstream feed availability is not checked by this endpoint - query the individual routes for that.',
    platform: 'OSIRIS',
    version: '1.0.0',
    uptime_seconds: process.uptime ? Math.round(process.uptime()) : null,
    /*
     * What a client meets when it asks. `registry.open` is false when the
     * registry is closed behind a session, and `session_required` is true
     * when the platform has accounts to sign in as at all.
     */
    surface: {
      registry: {
        open: surface.open,
        path: '/api/integrations/tools',
      },
      session_required: surface.sessionRequired,
      database: surface.database,
      detail: surface.open
        ? 'The tool registry answers without a session on this deployment.'
        : 'The tool registry requires a session on this deployment. Sign in first.',
    },
    /*
     * What this process has asked of nominatim.openstreetmap.org since it
     * started: `sent` is requests that left the building, `served` is how many
     * times the app wanted an answer, and the gap between them is the cache
     * doing its job. Reported so the rate can be watched against the one
     * request a second the service allows, rather than discovered by its
     * sysadmin - see lib/nominatim.ts and issue #16.
     */
    nominatim: nominatimStats(),
    timestamp: new Date().toISOString(),
  });
}
