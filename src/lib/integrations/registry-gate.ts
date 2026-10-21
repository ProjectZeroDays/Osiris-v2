/**
 * Whether the tool registry is closed.
 *
 * The registry answers unauthenticated by default, because the two native
 * clients read it and neither could authenticate before the session model
 * existed. It is still a map of the platform's capability surface — tool
 * ids, risk classes, upstreams — and a deployment may not want that
 * answered for anyone who asks.
 *
 * `OSIRIS_REGISTRY_REQUIRE_AUTH` closes it behind the same session the
 * dispatcher already demands, so a deployment that wants it closed can
 * have it closed without forking the route.
 *
 * The decision lives here, in one place, because two things depend on it:
 * the route, which enforces it, and the health check, which reports it.
 * If they read the flag separately they can disagree, and a health check
 * that lies is worse than one that says nothing.
 */

/** The environment variable that closes the registry. */
export const REGISTRY_REQUIRE_AUTH_FLAG = "OSIRIS_REGISTRY_REQUIRE_AUTH";

/**
 * Whether the registry is closed behind a session.
 *
 * Read per call rather than cached, so a deployment that changes its
 * environment is not stuck with the answer it was started with.
 */
export function registryRequiresAuth(): boolean {
  const raw = (process.env[REGISTRY_REQUIRE_AUTH_FLAG] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** What a client will meet when it asks for the registry. */
export interface RegistrySurface {
  /** Whether the registry answers a caller with no session. */
  open: boolean;
  /** Whether the platform demands a session at all. */
  sessionRequired: boolean;
  /** Whether the platform holds a durable record. */
  database: boolean;
}

/**
 * The registry's surface, as an operator would see it from outside.
 *
 * A deployment with no database runs single-tenant: there is no account
 * to sign in as, so closing the registry there would refuse the only
 * operator there is, with no way back in. The gate is therefore reported
 * as open in that case, whatever the flag says.
 */
export function registrySurface(databaseConfigured: boolean): RegistrySurface {
  const wantsClosed = registryRequiresAuth();
  return {
    // A database deployment has sessions and can refuse a caller without
    // one. A bare deployment cannot, and must not.
    open: !(wantsClosed && databaseConfigured),
    sessionRequired: databaseConfigured,
    database: databaseConfigured,
  };
}
