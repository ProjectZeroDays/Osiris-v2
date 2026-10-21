package com.osiris.app

import android.content.Context
import android.content.SharedPreferences
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The storage fallback — the path a device without a usable keystore takes.
 *
 * The encrypted path is proved on a device, by the instrumented test. The
 * fallback is the other half: the `catch (Throwable)` around
 * `MasterKeys.getOrCreate` and `EncryptedSharedPreferences.create`, which
 * falls back to ordinary preferences.
 *
 * It had been verified by reading four lines. That is not nothing, but it
 * is not a test either, and it is the path most likely to be wrong: the
 * catch has to swallow an `Error` rather than an `Exception`, and the
 * fallback has to keep the session working.
 *
 * The good news is that this path does not need a device to reach. The
 * JVM has no Android keystore, so `MasterKeys.getOrCreate` fails there
 * exactly as it does on a device without one — with an
 * `ExceptionInInitializerError`, which is an `Error`. The JVM *is* a
 * device without a usable keystore, and this test says so rather than
 * simulating it.
 */
class PlatformSessionFallbackTest {

    private val context: Context = mockk(relaxed = true)

    /** The preferences the fallback asks for, and what was written to them. */
    private val store = InMemoryPreferences()

    /** How many times the app asked for plain preferences. */
    private var plainRequests = 0

    @Before
    fun setUp() {
        plainRequests = 0
        every { context.getSharedPreferences(any(), any()) } answers {
            plainRequests++
            store
        }
        token(null)
        user(null)
    }

    /** Put a token in the app's own field, as a sign-in would have. */
    private fun token(value: String?) {
        val field = PlatformSession::class.java.getDeclaredField("token")
        field.isAccessible = true
        field.set(PlatformSession, value)
    }

    /** The account the token belongs to. */
    private fun user(value: String?) {
        val field = PlatformSession::class.java.getDeclaredField("user")
        field.isAccessible = true
        field.set(
            PlatformSession,
            if (value == null) null else org.json.JSONObject().put("email", value),
        )
    }

    @Test
    fun theKeystoreIsNotAvailableOnTheJvm() {
        // The premise of this whole test. If the keystore were somehow
        // available, the fallback would not be exercised and the cases
        // below would be measuring the encrypted path under a name that
        // says otherwise.
        val failed = try {
            androidx.security.crypto.MasterKeys.getOrCreate(
                androidx.security.crypto.MasterKeys.AES256_GCM_SPEC,
            )
            false
        } catch (e: Throwable) {
            true
        }
        assertTrue(
            "the keystore must be unavailable here, or this is not the fallback",
            failed,
        )
    }

    @Test
    fun theFallbackIsTaken() {
        token("a-token-for-the-fallback")
        PlatformSession.remember(context)

        assertEquals(
            "the app must have fallen back to ordinary preferences",
            1,
            plainRequests,
        )
    }

    @Test
    fun theSessionStillRoundTripsThroughTheFallback() {
        token("a-token-that-survives-the-fallback")
        PlatformSession.remember(context)

        // What the app does when it is next opened: the token is read
        // back from storage rather than held in memory from last time.
        token(null)
        user(null)
        PlatformSession.load(context)

        assertTrue(
            "a session that does not survive a reload is not a session",
            PlatformSession.isSignedIn,
        )
    }

    @Test
    fun theFallbackStoreHoldsTheTokenInTheClear() {
        // The compromise, stated rather than glossed: ordinary
        // preferences are ordinary, so the token in them is readable by
        // anything that can read the app's files. That is worse than the
        // encrypted path, and it is why the fallback is a fallback and
        // not the plan.
        token("a-token-in-the-clear")
        PlatformSession.remember(context)

        val stored = store.getString("token", null)
        assertNotNull("the token should be in the fallback store", stored)
        assertEquals("a-token-in-the-clear", stored)
    }

    @Test
    fun forgettingRemovesTheSessionFromTheFallbackStore() {
        token("a-token-to-be-forgotten")
        PlatformSession.remember(context)
        assertNotNull(store.getString("token", null))

        PlatformSession.forget(context)

        assertTrue("the session must be gone", !PlatformSession.isSignedIn)
        assertEquals(null, store.getString("token", null))
    }

    /**
     * The preferences the app keeps its token in, without a device.
     *
     * Only the methods the app uses, and only the behaviour it relies
     * on: a value written is a value read back. A fake rather than a
     * real store because there is no device to hold one, and what is
     * under test is what the app does with the token, not how
     * preferences work.
     */
    private class InMemoryPreferences : SharedPreferences {
        private val values = mutableMapOf<String, String?>()

        override fun getAll(): MutableMap<String, *> = HashMap(values)

        override fun getString(key: String, defValue: String?): String? = values[key] ?: defValue

        override fun getStringSet(key: String, defValues: MutableSet<String>?): MutableSet<String>? = defValues

        override fun getInt(key: String, defValue: Int): Int = defValue

        override fun getLong(key: String, defValue: Long): Long = defValue

        override fun getFloat(key: String, defValue: Float): Float = defValue

        override fun getBoolean(key: String, defValue: Boolean): Boolean = defValue

        override fun contains(key: String): Boolean = values.containsKey(key)

        override fun edit(): SharedPreferences.Editor =
            object : SharedPreferences.Editor {
                private val pending = mutableMapOf<String, String?>()

                override fun putString(key: String, value: String?): SharedPreferences.Editor =
                    apply { pending[key] = value }

                override fun putStringSet(
                    key: String,
                    values: MutableSet<String>?,
                ): SharedPreferences.Editor = this

                override fun putInt(key: String, value: Int): SharedPreferences.Editor = this

                override fun putLong(key: String, value: Long): SharedPreferences.Editor = this

                override fun putFloat(key: String, value: Float): SharedPreferences.Editor = this

                override fun putBoolean(key: String, value: Boolean): SharedPreferences.Editor = this

                override fun remove(key: String): SharedPreferences.Editor = apply { pending[key] = null }

                override fun clear(): SharedPreferences.Editor = apply { values.clear() }

                override fun commit(): Boolean {
                    apply()
                    return true
                }

                override fun apply() {
                    this@InMemoryPreferences.values.putAll(pending)
                }
            }

        override fun registerOnSharedPreferenceChangeListener(
            listener: SharedPreferences.OnSharedPreferenceChangeListener?,
        ) = Unit

        override fun unregisterOnSharedPreferenceChangeListener(
            listener: SharedPreferences.OnSharedPreferenceChangeListener?,
        ) = Unit
    }
}
