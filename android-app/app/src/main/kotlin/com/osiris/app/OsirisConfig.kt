package com.osiris.app

/**
 * Where the platform lives.
 *
 * The app does not keep its own copy of the tool registry: it reads it
 * from the platform, so the tool list, the capability allowlist and the
 * audit trail are the platform's rather than a second implementation of
 * them.
 *
 * On an emulator, 10.0.2.2 is the host machine. On a device it is the
 * platform's own address. Either way it is one constant to change.
 */
object OsirisConfig {
    /**
     * The platform's origin.
     *
     * Read from a system property when one is set, so a test can point the
     * app at a fixture server without a device or an emulator. It is read
     * per call rather than cached, because a fixture answers on a fresh
     * port each time and a cached origin would send the second test's
     * requests to the first test's server.
     */
    val platformUrl: String
        get() = System.getProperty("osiris.platform.url") ?: "http://10.0.2.2:3000"

    /** The integration dispatcher, relative to the platform. */
    val integrationsPath: String = "/api/integrations"

    /** The tool registry, relative to the platform. */
    val registryPath: String = "$integrationsPath/tools"

    /** Who the caller is, relative to the platform. */
    val sessionPath: String = "/api/auth/session"

    /** Sign in, relative to the platform. */
    val signInPath: String = "/api/auth/signin"

    /** Sign out, relative to the platform. */
    val signOutPath: String = "/api/auth/signout"
}
