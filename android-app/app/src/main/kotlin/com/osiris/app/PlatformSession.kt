package com.osiris.app

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit
import org.json.JSONObject

/**
 * The platform's session.
 *
 * The platform demands a session before it will run anything, so the app
 * has to be able to have one. The token is held here, in the app's own
 * storage, and is presented on every call to the dispatcher.
 *
 * The token is kept in encrypted preferences, whose key lives in the
 * Android keystore rather than in the app's files. Where the keystore is
 * unavailable — some devices, some older installs — the token is kept in
 * ordinary preferences and the fact is recorded, rather than pretending
 * the storage is protected when it is not.
 *
 * The two halves are separate on purpose. Talking to the platform needs
 * no `Context`; keeping the token for next time does. So [signIn] and
 * [checkPlatform] are plain functions that a JVM test can drive, and
 * [remember] and [forget] are the ones that touch the storage.
 */
object PlatformSession {

    private const val TAG = "OsirisSession"
    private const val PREFS = "osiris_platform_session"
    private const val KEY_TOKEN = "token"
    private const val KEY_USER = "user"

    /** The session cookie the platform sets. */
    const val COOKIE_NAME = "osiris_session"

    @Volatile
    private var token: String? = null

    @Volatile
    private var user: JSONObject? = null

    /**
     * The preferences the session is kept in.
     *
     * Encrypted where the keystore allows it. The keystore is not
     * available on every device, and an app that cannot start because it
     * cannot encrypt is worse than one that says plainly that its storage
     * is not protected. So: encrypted when it can be, ordinary when it
     * cannot, and the difference is written down.
     *
     * The catch is on `Throwable`, not on `Exception`. The keystore's
     * failure is not an exception: `MasterKeys` initialises the provider
     * in a static initialiser, so a device without a usable keystore
     * throws an `ExceptionInInitializerError` — an `Error` — and a
     * `catch (Exception)` would let it past. The fallback exists
     * precisely for that case, so it has to be the one that catches it.
     */
    private fun prefs(context: Context): SharedPreferences {
        return try {
            val keyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
            EncryptedSharedPreferences.create(
                PREFS,
                keyAlias,
                context,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (e: Throwable) {
            Log.w(TAG, "Encrypted storage is unavailable; the session is kept in plain preferences", e)
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        }
    }

    /** Read the stored session. Safe to call more than once. */
    fun load(context: Context) {
        val stored = prefs(context)
        token = stored.getString(KEY_TOKEN, null)
        val who = stored.getString(KEY_USER, null)
        user = if (who != null) runCatching { JSONObject(who) }.getOrNull() else null
    }

    /** Whether the app holds a session. */
    val isSignedIn: Boolean get() = !token.isNullOrEmpty()

    /** The signed-in account, if there is one. */
    fun currentUser(): JSONObject? = user

    /**
     * Sign in.
     *
     * The password goes to the platform and is not kept. The platform
     * answers with a session cookie, and the cookie is the only thing kept.
     *
     * The token lands in memory. [remember] is what keeps it for the next
     * time the app is opened, and it is a separate step because keeping a
     * token is a different thing from asking for one.
     */
    fun signIn(email: String, password: String): Result {
        if (email.isBlank() || password.isBlank()) {
            return Result(false, "Enter an email and a password.")
        }

        val connection = try {
            (URL("${OsirisConfig.platformUrl}${OsirisConfig.signInPath}").openConnection() as HttpURLConnection)
        } catch (e: Exception) {
            return Result(false, "The platform could not be reached: ${e.message}")
        }

        return try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 10_000
            connection.readTimeout = 15_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")

            val body = JSONObject()
                .put("email", email.trim())
                .put("password", password)
                .toString()
            connection.outputStream.use { it.write(body.toByteArray()) }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()

            if (status !in 200..299) {
                val message = runCatching { JSONObject(text).optString("error") }.getOrNull()
                return if (message == "INVALID_CREDENTIALS") {
                    Result(false, "That email and password do not match an account.")
                } else {
                    Result(false, "The platform refused the sign-in ($status).")
                }
            }

            val cookie = sessionCookie(connection)
            if (cookie.isNullOrEmpty()) {
                return Result(false, "The platform did not return a session.")
            }

            val who = runCatching { JSONObject(text).optJSONObject("user") }.getOrNull()
            token = cookie
            user = who
            Result(true, "Signed in.")
        } catch (e: Exception) {
            Log.w(TAG, "Sign-in failed", e)
            Result(false, "The platform could not be reached: ${e.message}")
        } finally {
            connection.disconnect()
        }
    }

    /**
     * Keep the session in memory for the next time the app is opened.
     *
     * The storage half of a sign-in, and the only part that needs a
     * `Context`. A failure to write it is not a failure to sign in: the
     * session works until the app is closed.
     */
    fun remember(context: Context) {
        val current = token ?: return
        persist(context, current, user)
    }

    /**
     * Forget the session: the memory and the storage.
     *
     * The platform is told first, so the session row is deleted there too
     * and the token stops working anywhere. A failure to reach the platform
     * still clears the local copy: the token is worthless to us either way.
     */
    fun signOut(context: Context) {
        val current = token
        if (!current.isNullOrEmpty()) {
            try {
                val connection = (URL("${OsirisConfig.platformUrl}${OsirisConfig.signOutPath}")
                    .openConnection() as HttpURLConnection)
                connection.requestMethod = "POST"
                connection.connectTimeout = 8_000
                connection.readTimeout = 8_000
                connection.setRequestProperty("Cookie", "$COOKIE_NAME=$current")
                connection.responseCode
                connection.disconnect()
            } catch (e: Exception) {
                Log.w(TAG, "Sign-out could not reach the platform", e)
            }
        }
        forget(context)
    }

    /**
     * Forget the session in memory.
     *
     * The token goes; the storage is left alone. This is the half that
     * needs no `Context`, and the half a test can reach.
     */
    fun clear() {
        token = null
        user = null
    }

    /**
     * Forget the session without telling the platform.
     *
     * The token is dropped from memory and from the storage. A token the
     * platform has not been told about is still live on the platform's
     * side, so this is for a local reset rather than for signing out.
     */
    fun forget(context: Context) {
        clear()
        prefs(context).edit().clear().apply()
    }

    /** The headers a platform call carries. */
    fun headers(): Map<String, String> {
        val h = mutableMapOf<String, String>()
        token?.let { h["Cookie"] = "$COOKIE_NAME=$it" }
        return h
    }

    /**
     * Whether the platform wants a session.
     *
     * A platform with no database runs single-tenant and needs none. One
     * with accounts does, and until the app signs in the dispatcher will
     * refuse every call. The platform says which case this is.
     */
    fun checkPlatform(): PlatformState {
        return try {
            val connection = (URL("${OsirisConfig.platformUrl}${OsirisConfig.sessionPath}")
                .openConnection() as HttpURLConnection)
            connection.requestMethod = "GET"
            connection.connectTimeout = 8_000
            connection.readTimeout = 8_000
            headers().forEach { (k, v) -> connection.setRequestProperty(k, v) }

            val status = connection.responseCode
            val text = if (status in 200..299) {
                connection.inputStream.bufferedReader().use(BufferedReader::readText)
            } else {
                ""
            }
            connection.disconnect()

            if (status != 200) {
                return PlatformState(reachable = false, needsSession = false, authenticated = false)
            }
            val json = JSONObject(text)
            PlatformState(
                reachable = true,
                needsSession = !json.optBoolean("authenticated") && !json.optBoolean("ephemeral"),
                authenticated = json.optBoolean("authenticated"),
                email = json.optJSONObject("user")?.optString("email"),
            )
        } catch (e: Exception) {
            Log.w(TAG, "The platform could not be reached", e)
            PlatformState(reachable = false, needsSession = false, authenticated = false)
        }
    }

    /** The result of a sign-in. */
    data class Result(val ok: Boolean, val message: String)

    /** What the platform says about the session. */
    data class PlatformState(
        val reachable: Boolean,
        val needsSession: Boolean,
        val authenticated: Boolean,
        val email: String? = null,
    )

    /** The session cookie out of a response, if the platform set one. */
    private fun sessionCookie(connection: HttpURLConnection): String? {
        val headers = connection.headerFields ?: return null
        for ((key, values) in headers) {
            if (key == null || !key.equals("Set-Cookie", ignoreCase = true)) continue
            for (value in values) {
                val match = Regex("(?:^|;\\s*)$COOKIE_NAME=([^;]*)").find(value)
                if (match != null) return match.groupValues[1]
            }
        }
        return null
    }

    /** Keep the session for the next time the app is opened. */
    private fun persist(context: Context, cookie: String, who: JSONObject?) {
        prefs(context).edit()
            .putString(KEY_TOKEN, cookie)
            .putString(KEY_USER, who?.toString())
            .apply()
    }

    /** The timeout the calls use, in the units the platform wants. */
    val TIMEOUT_SECONDS: Long = TimeUnit.SECONDS.toMillis(15)
}
