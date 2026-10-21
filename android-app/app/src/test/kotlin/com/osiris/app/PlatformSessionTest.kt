package com.osiris.app

import io.mockk.every
import io.mockk.mockk
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The app on the wire.
 *
 * A deployment may close `/api/integrations/tools` behind the platform's
 * session, so the app has to present its session on that call or show an
 * empty tool list with no explanation. These tests hold the app to the
 * two halves of that: the registry is read, and the cookie the session
 * holds is on the request that reads it. The second half is the point —
 * a test that only checked the parsed answer could pass while the app
 * dropped its session on every call.
 *
 * The session itself cannot be built here. `signIn` keeps its token in
 * preferences, which reach the Android keystore, and a JVM has no
 * keystore: the failure arrives while `MasterKeys` is initialising, as an
 * `ExceptionInInitializerError`, which the storage fallback's
 * `catch (Exception)` does not catch. That is a property of the JVM test
 * classpath, not of a device, so the token is set into the field the
 * session reads rather than manufactured around it — and everything that
 * presents it is the app's own code, unchanged.
 */
class PlatformSessionTest {

    /** The platform, on a port of its own, so tests cannot collide. */
    private lateinit var url: String

    private val context: android.content.Context = run {
        val real = mockk<android.content.Context>(relaxed = true)
        every { real.getSharedPreferences(any(), any()) } returns InMemoryPreferences()
        real
    }

    @Before
    fun start() {
        FakePlatform.install()
        FakePlatform.reset()
        url = "http://127.0.0.1:45211"
        System.setProperty("osiris.platform.url", url)
        // The session is an object and outlives a single test. A token
        // left behind would hand the next test a session it never had.
        token(null)
        FakePlatform.reset()
    }

    @After
    fun stop() {
        token(null)
        FakePlatform.reset()
        System.clearProperty("osiris.platform.url")
    }

    // ------------------------------------------------------------- sign in

    @Test
    fun aBlankSignInIsRefusedWithoutASignInRequest() {
        val result = PlatformSession.signIn("  ", "anything")

        assertFalse("a blank form is the app's own check", result.ok)
        assertTrue("the message should say what is missing",
            result.message.contains("email and a password"))
        assertEquals("nothing should have been sent", emptyList<String>(),
            FakePlatform.requests().map { it.path })
    }

    @Test
    fun aWrongPasswordIsRefusedAndLeavesNoSession() {
        FakePlatform.onRequests {
            reply(401, JSONObject().put("error", "INVALID_CREDENTIALS").toString())
        }

        val result = PlatformSession.signIn("operator@osiris.local", "not-the-password")

        assertFalse(result.ok)
        assertTrue("the platform said why, so the message should say why",
            result.message.contains("do not match"))
        assertFalse("a refused sign-in must leave no session",
            PlatformSession.isSignedIn)
    }

    @Test
    fun aSigninTheAppHasNoWordsForSaysTheStatus() {
        FakePlatform.onRequests {
            reply(403, JSONObject().put("error", "ACCOUNT_LOCKED").toString())
        }

        val result = PlatformSession.signIn("operator@osiris.local", "any")

        assertFalse(result.ok)
        assertTrue("the operator should see the status rather than a guess",
            result.message.contains("403"))
    }

    @Test
    fun aSigninWithNoSessionCookieIsNotASession() {
        // The platform says it worked, but sets no cookie. Signing in is
        // having a session; a success message with nothing to present on
        // the next call is not it.
        FakePlatform.onRequests {
            reply(200, JSONObject()
                .put("authenticated", true)
                .put("user", JSONObject().put("id", "user-1").put("email", "operator@osiris.local"))
                .toString())
        }

        val result = PlatformSession.signIn("operator@osiris.local", "any")

        assertFalse(result.ok)
        assertTrue("the app should say the session is what is missing",
            result.message.contains("did not return a session"))
        assertFalse(PlatformSession.isSignedIn)
    }

    @Test
    fun aSignInThePlatformIssuesASessionForHoldsIt() {
        // The cookie is the session. It is taken from the response and
        // presented on the next call, and no password is kept — which is
        // what the test below is for.
        FakePlatform.onRequests {
            reply(
                200,
                JSONObject().put("authenticated", true)
                    .put("user", JSONObject().put("id", "user-1").put("email", "operator@osiris.local"))
                    .toString(),
                mapOf("Set-Cookie" to listOf("osiris_session=issued-by-the-platform; Path=/")),
            )
        }

        val result = PlatformSession.signIn("operator@osiris.local", "the-password")

        assertTrue("sign-in failed: ${result.message}", result.ok)
        assertTrue(PlatformSession.isSignedIn)
        assertEquals("the session the platform issued must be the one held",
            "osiris_session=issued-by-the-platform", PlatformSession.headers()["Cookie"])
    }

    @Test
    fun thePasswordIsSentOnceAndNotKept() {
        // The password is the one secret in the exchange, and the app's
        // own claim is that it is not kept. It goes to the platform and
        // is not presented on the call after it.
        FakePlatform.onRequests {
            reply(
                200,
                JSONObject().put("authenticated", true).toString(),
                mapOf("Set-Cookie" to listOf("osiris_session=issued-by-the-platform; Path=/")),
            )
        }
        PlatformSession.signIn("operator@osiris.local", "the-password")
        FakePlatform.reset()

        PlatformRegistry.read()

        assertTrue("nothing about the sign-in may be presented again",
            FakePlatform.requests().none { it.body.contains("the-password") })
        assertEquals("only the session is presented on the next call",
            "osiris_session=issued-by-the-platform",
            FakePlatform.cookieSentTo(OsirisConfig.registryPath))
    }

    // ------------------------------------------------------------- sign out

    @Test
    fun signingOutTellsThePlatformWithTheSessionItIsRevoking() {
        token("a-token-from-last-time")
        FakePlatform.onRequests {
            assertEquals("the platform must be told first", "/api/auth/signout", path)
            assertEquals("and the call must carry the session being revoked",
                "osiris_session=a-token-from-last-time", requestHeader("Cookie"))
            reply(200, JSONObject().put("ok", true).toString())
        }

        PlatformSession.signOut(context)

        assertFalse("the local copy must go too", PlatformSession.isSignedIn)
    }

    // ---------------------------------------------------------- the registry

    @Test
    fun theRegistryIsReadableWithoutASession() {
        // The default shape of a deployment: the registry is open, and
        // the app can read it before anyone has signed in. Without this
        // case, a client that always sent a cookie would pass every
        // other test here.
        FakePlatform.onRequests { reply(200, registryBody()) }

        val outcome = PlatformRegistry.read()

        assertEquals(200, outcome.status)
        assertEquals(listOf("shodan", "zenmap", "metasploit"), outcome.tools.map { it.id })
    }

    @Test
    fun aClosedRegistryIsRefusedAndSaysWhy() {
        FakePlatform.onRequests {
            assertEquals("the registry is what was asked for",
                OsirisConfig.registryPath, path)
            reply(401, JSONObject()
                .put("error", "REGISTRY_UNAUTHENTICATED")
                .put("detail", "The tool registry requires a session on this deployment.")
                .toString())
        }

        val outcome = PlatformRegistry.read()

        assertEquals(401, outcome.status)
        assertTrue("the refusal carries no tools", outcome.tools.isEmpty())
        assertEquals("the reason should be kept for the screen",
            "REGISTRY_UNAUTHENTICATED", outcome.error)
    }

    @Test
    fun noSessionMeansNoCookieOnTheRegistryCall() {
        FakePlatform.onRequests { reply(401, JSONObject().put("error", "REGISTRY_UNAUTHENTICATED").toString()) }

        PlatformRegistry.read()

        assertNull("with no session there is nothing to present",
            FakePlatform.cookieSentTo(OsirisConfig.registryPath))
    }

    @Test
    fun aHeldSessionIsPresentedOnTheRegistryCall() {
        token("a-token-from-last-time")
        FakePlatform.onRequests { reply(200, registryBody()) }

        val outcome = PlatformRegistry.read()

        assertEquals("the session must be on the request, or every call is anonymous",
            "osiris_session=a-token-from-last-time",
            FakePlatform.cookieSentTo(OsirisConfig.registryPath))
        assertEquals("and the platform should have answered with the registry",
            200, outcome.status)
        assertEquals(listOf("shodan", "zenmap", "metasploit"), outcome.tools.map { it.id })
    }

    @Test
    fun aHeldSessionIsPresentedOnTheSessionCallToo() {
        token("a-token-from-last-time")
        FakePlatform.onRequests {
            reply(200, JSONObject()
                .put("authenticated", true)
                .put("ephemeral", false)
                .put("user", JSONObject().put("id", "user-1").put("email", "operator@osiris.local"))
                .toString())
        }

        val state = PlatformSession.checkPlatform()

        assertEquals("asking who you are must carry who you are",
            "osiris_session=a-token-from-last-time",
            FakePlatform.cookieSentTo(OsirisConfig.sessionPath))
        assertTrue(state.reachable)
        assertTrue("the platform should have recognised the session", state.authenticated)
        assertEquals("operator@osiris.local", state.email)
    }

    // ---------------------------------------------------------- the platform

    @Test
    fun aPlatformThatNeedsASessionSaysSo() {
        FakePlatform.onRequests {
            reply(200, JSONObject()
                .put("authenticated", false)
                .put("ephemeral", false)
                .put("user", JSONObject.NULL)
                .toString())
        }

        val state = PlatformSession.checkPlatform()

        assertTrue("it answered, so it is reachable", state.reachable)
        assertTrue("and it wants a session before anything runs", state.needsSession)
        assertFalse(state.authenticated)
    }

    @Test
    fun aSessionKeptByRememberIsHeldAfterTheAppIsReopened() {
        // The app keeps a session across restarts: `remember` is what
        // writes it, and reading it back is what makes the next launch
        // signed in. Both halves are here, with the store between them,
        // because a write nothing reads back is not a kept session.
        FakePlatform.onRequests {
            reply(
                200,
                JSONObject().put("authenticated", true)
                    .put("user", JSONObject().put("id", "user-1").put("email", "operator@osiris.local"))
                    .toString(),
                mapOf("Set-Cookie" to listOf("osiris_session=issued-by-the-platform; Path=/")),
            )
        }
        assertTrue(PlatformSession.signIn("operator@osiris.local", "any").ok)
        PlatformSession.remember(context)

        // What the app does when it is next opened: the token is read
        // back from storage rather than held in memory from last time.
        token(null)
        PlatformSession.load(context)

        assertTrue("a session that does not survive a reload is not a session",
            PlatformSession.isSignedIn)
        assertEquals("osiris_session=issued-by-the-platform",
            PlatformSession.headers()["Cookie"])
    }

    @Test
    fun aBarePlatformDoesNotDemandASession() {
        // Single-tenant: there is no account to sign in as, so asking for
        // one would refuse the only person who can use the platform.
        FakePlatform.onRequests {
            reply(200, JSONObject()
                .put("authenticated", false)
                .put("ephemeral", true)
                .put("user", JSONObject.NULL)
                .toString())
        }

        val state = PlatformSession.checkPlatform()

        assertTrue(state.reachable)
        assertFalse("nothing to sign in as", state.needsSession)
        assertFalse(state.authenticated)
    }

    // ------------------------------------------------------------------ us

    /**
     * Put a session in the object, or take it out.
     *
     * The field is the one `signIn` writes and `load` reads back, so
     * what these tests hold the app to is its own state — not a stand-in
     * for it. It is set directly because building a session needs the
     * Android keystore, and a JVM has none.
     */
    private fun token(value: String?) {
        val field = PlatformSession::class.java.getDeclaredField("token")
        field.isAccessible = true
        field.set(PlatformSession, value)
    }

    /** The registry body, in the shape the platform's route returns. */
    private fun registryBody(): String = JSONObject()
        .put("total", 3)
        .put("categories", JSONArray(listOf("passive-metadata", "report-import")))
        .put("tools", JSONArray(listOf(
            tool("shodan", "Shodan", "passive-metadata"),
            tool("zenmap", "Zenmap", "report-import"),
            tool("metasploit", "Metasploit", "report-import"),
        )))
        .toString()

    private fun tool(id: String, name: String, riskClass: String): JSONObject = JSONObject()
        .put("id", id)
        .put("name", name)
        .put("purpose", "The platform's account of $name")
        .put("href", "/tools/security/$id")
        .put("state", "not-configured")
        .put("riskClass", riskClass)
        .put("riskNote", "Fixture note")
        .put("retentionDays", 90)
        .put("requiresAsset", false)
        .put("requiresConsent", false)
        .put("upstream", JSONObject.NULL)
        .put("capabilities", JSONArray(listOf("host.search")))
        .put("tabs", JSONArray())

    /**
     * The preferences the app keeps its token in, without a device.
     *
     * Only the methods [PlatformSession] actually uses, and only the
     * behaviour it relies on: a value written is a value read back. A
     * fake rather than a real store because there is no device to hold
     * one, and what is under test is what the app does with the token,
     * not how preferences work.
     */
    private class InMemoryPreferences : android.content.SharedPreferences {
        private val values = mutableMapOf<String, String?>()

        override fun getAll(): MutableMap<String, *> = HashMap(values)

        override fun getString(key: String, defValue: String?) = values[key] ?: defValue

        override fun getStringSet(key: String, defValues: MutableSet<String>?) = defValues

        override fun getInt(key: String, defValue: Int) = defValue

        override fun getLong(key: String, defValue: Long) = defValue

        override fun getFloat(key: String, defValue: Float) = defValue

        override fun getBoolean(key: String, defValue: Boolean) = defValue

        override fun contains(key: String) = values.containsKey(key)

        override fun edit(): android.content.SharedPreferences.Editor =
            object : android.content.SharedPreferences.Editor {
                private val pending = mutableMapOf<String, String?>()
                private var clearing = false

                override fun putString(key: String, value: String?) =
                    apply { pending[key] = value }

                override fun putStringSet(key: String, values: MutableSet<String>?) = this

                override fun putInt(key: String, value: Int) = this

                override fun putLong(key: String, value: Long) = this

                override fun putFloat(key: String, value: Float) = this

                override fun putBoolean(key: String, value: Boolean) = this

                override fun remove(key: String) = apply { pending[key] = null }

                override fun clear() = apply {
                    // Like the other edits: the clear is applied when the
                    // editor is, not the moment it is asked for.
                    pending.clear()
                    clearing = true
                }

                override fun commit(): Boolean {
                    apply()
                    return true
                }

                override fun apply() {
                    if (clearing) this@InMemoryPreferences.values.clear()
                    this@InMemoryPreferences.values.putAll(pending)
                }
            }

        override fun registerOnSharedPreferenceChangeListener(
            listener: android.content.SharedPreferences.OnSharedPreferenceChangeListener?,
        ) = Unit

        override fun unregisterOnSharedPreferenceChangeListener(
            listener: android.content.SharedPreferences.OnSharedPreferenceChangeListener?,
        ) = Unit
    }
}
