package com.osiris.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The session's storage, on a device with a real keystore.
 *
 * The JVM tests cover the session on the wire and the registry's shape.
 * They cannot cover the storage, because `MasterKeys` needs the Android
 * keystore and a JVM has not got one — which means the path a device
 * *without* a usable keystore takes is the path the tests never exercise.
 *
 * That path is the interesting one. The fallback catches a `Throwable`,
 * because the keystore's failure arrives as an `ExceptionInInitializerError`
 * — an `Error`, not an `Exception` — and a `catch (Exception)` would let
 * it past, and the app would die on launch rather than fall back.
 *
 * This runs on a device, so the keystore is real: the encrypted path is
 * the one taken, and the fallback is the one a device without a keystore
 * would take.
 *
 * The token is put into the app's own field rather than obtained from a
 * sign-in, because this is a test of the storage and not of the network.
 * The JVM tests cover the sign-in; this one covers what happens to the
 * token afterwards.
 */
@RunWith(AndroidJUnit4::class)
class PlatformSessionStorageTest {

    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    /** A token, as the platform would have issued it. */
    private fun setToken(value: String?) {
        val field = PlatformSession::class.java.getDeclaredField("token")
        field.isAccessible = true
        field.set(PlatformSession, value)
    }

    /** The account the token belongs to, as a sign-in would have left it. */
    private fun setUser(email: String?) {
        val field = PlatformSession::class.java.getDeclaredField("user")
        field.isAccessible = true
        field.set(
            PlatformSession,
            if (email == null) null else org.json.JSONObject().put("email", email),
        )
    }

    /** The token the app is holding, from the app's own field. */
    private fun heldToken(): String? {
        val field = PlatformSession::class.java.getDeclaredField("token")
        field.isAccessible = true
        return field.get(PlatformSession) as String?
    }

    @Before
    fun clear() {
        setToken(null)
        setUser(null)
    }

    @Test
    fun theKeystoreIsAvailableOnThisDevice() {
        // If the keystore were not available, this test would be
        // measuring the fallback rather than the encrypted path, and the
        // two need saying apart.
        val alias = androidx.security.crypto.MasterKeys.getOrCreate(
            androidx.security.crypto.MasterKeys.AES256_GCM_SPEC,
        )
        assertTrue("the encrypted path is the one under test here", alias.isNotEmpty())
    }

    @Test
    fun aSessionIsKeptAndReadBack() {
        val token = "a-token-that-survives-a-reload"
        setToken(token)
        // The storage half: this is what a device without a keystore
        // falls back to, and what a device with one uses.
        PlatformSession.remember(context)

        // What the app does when it is next opened: the token is read
        // back from storage rather than held in memory from last time.
        setToken(null)
        PlatformSession.load(context)

        assertTrue(
            "a session that does not survive a reload is not a session",
            PlatformSession.isSignedIn,
        )
        assertTrue(heldToken()!!.isNotEmpty())
    }

    @Test
    fun theStoredTokenIsNotInTheClear() {
        val token = "a-token-that-must-not-be-readable-on-disk"
        setToken(token)
        PlatformSession.remember(context)

        // The file the app's preferences live in, read as bytes. If the
        // plaintext token were in there, the storage would be no better
        // than a file on disk, and the keystore would be decoration.
        val file = File(context.applicationInfo.dataDir, "shared_prefs/osiris_platform_session.xml")
        val onDisk = if (file.exists()) file.readBytes().toString(Charsets.ISO_8859_1) else ""

        assertFalse(
            "the token must not be readable in the preferences file",
            onDisk.contains(token),
        )
    }

    @Test
    fun forgettingRemovesTheSession() {
        setToken("a-token-that-will-be-forgotten")
        PlatformSession.remember(context)
        assertTrue(PlatformSession.isSignedIn)

        PlatformSession.forget(context)

        assertFalse("the session must be gone", PlatformSession.isSignedIn)
    }

    @Test
    fun theUserIsReadBackWithTheToken() {
        // The account and the token are stored together, and they come
        // back together. A token with no account is a credential with
        // nothing to say about who it belongs to.
        setToken("a-token-with-a-user")
        setUser("operator@osiris.local")
        PlatformSession.remember(context)
        setToken(null)
        setUser(null)
        PlatformSession.load(context)

        val user = PlatformSession.currentUser()
        assertNotNull("the account should come back with the token", user)
        assertTrue(user!!.optString("email") == "operator@osiris.local")
    }
}
