package com.osiris.app

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLConnection
import java.net.URLStreamHandler
import java.net.URLStreamHandlerFactory

/**
 * The platform, as the app finds it on the wire.
 *
 * `URL.openConnection()` goes through a factory the JDK lets a program
 * install once, so the "server" in these tests is the connection itself:
 * every request the app makes is answered here, and every request it made
 * is kept. That is what lets the session be checked where it actually
 * matters — in the header on the outgoing request — without a device, an
 * emulator, or a socket. The desktop client's test does the same thing
 * against a running platform; this is the Android counterpart, and the
 * two assert the same contract from opposite ends.
 *
 * Nothing here is a mock of the app's own logic. `PlatformSession` and
 * `PlatformRegistry` run unmodified: only the transport under them is
 * replaced, which is the one thing a unit test cannot otherwise reach.
 */
object FakePlatform {

    /** One request the app made, as the connection saw it. */
    data class Seen(
        val path: String,
        val method: String,
        val headers: Map<String, List<String>>,
        val body: String,
    )

    /** The session the fixture issues and accepts. */
    const val TOKEN = "fixture-session-token"

    private var installed = false
    private val requests = mutableListOf<Seen>()

    /** Requests made since the last [reset]. */
    fun requests(): List<Seen> = synchronized(requests) { requests.toList() }

    fun reset() = synchronized(requests) { requests.clear() }

    /**
     * The `Cookie` header sent on one path, if there was one.
     *
     * The last request to that path, so a test that asks after a call has
     * already been made is asking about that call.
     */
    fun cookieSentTo(path: String): String? = requests()
        .lastOrNull { it.path == path }
        ?.headers?.get("Cookie")
        ?.joinToString("; ")

    /**
     * Install the fixture. The JDK allows this once per JVM, and Gradle
     * runs a module's tests in one JVM, so a second call would throw —
     * hence the guard rather than an unconditional install.
     */
    fun install() {
        if (installed) return
        installed = true
        try {
            URL.setURLStreamHandlerFactory(
                URLStreamHandlerFactory { protocol ->
                    if (protocol == "http") object : URLStreamHandler() {
                        override fun openConnection(url: URL): URLConnection = Fixture(url)
                    } else null
                },
            )
        } catch (e: IllegalStateException) {
            // Something else in the JVM already installed a factory. The
            // fixture cannot then intercept anything, and the tests that
            // need it will say so rather than quietly passing.
            installed = false
        }
    }

    /**
     * One request, answered by whichever test set [onRequests].
     *
     * A connection rather than a server: `responseCode`, the streams and
     * the response headers are the fields the app reads, so they are the
     * fields this provides.
     *
     * Not `inner`: the JDK's factory creates these without an instance to
     * create them from, so a fixture has to be able to exist on its own.
     */
    class Fixture(private val url: URL) : HttpURLConnection(url) {
        private val out = ByteArrayOutputStream()
        private val requestHeaders = linkedMapOf<String, MutableList<String>>()
        private val responseHeaders = linkedMapOf<String, MutableList<String>>()
        private var body: ByteArray = ByteArray(0)
        private var status = 200
        private var recorded = false

        /** The path the app asked for. */
        val path: String get() = url.path

        override fun setRequestProperty(key: String, value: String) {
            requestHeaders[key] = mutableListOf(value)
        }

        override fun addRequestProperty(key: String, value: String) {
            requestHeaders.getOrPut(key) { mutableListOf() }.add(value)
        }

        override fun getRequestProperties(): Map<String, List<String>> =
            LinkedHashMap(requestHeaders)

        /**
         * A header the app put on the request.
         *
         * The header names are matched the way a server matches them, so
         * a test does not have to know whether the app wrote `Cookie` or
         * `cookie`.
         */
        fun requestHeader(name: String): String? = requestHeaders.entries
            .firstOrNull { it.key.equals(name, ignoreCase = true) }
            ?.value?.joinToString("; ")

        /**
         * The status, and the moment the request is recorded.
         *
         * Asking for the status is the first moment the app waits for an
         * answer, so it is the right place to capture what it sent: the
         * request is complete by then, whether the app asked for the
         * status or for a stream first.
         */
        override fun getResponseCode(): Int {
            if (!recorded) {
                recorded = true
                record(this)
            }
            return status
        }

        override fun getOutputStream() = out

        override fun getInputStream(): ByteArrayInputStream = ByteArrayInputStream(body)

        override fun getErrorStream(): ByteArrayInputStream? =
            if (status >= 400) ByteArrayInputStream(body) else null

        override fun getHeaderFields(): Map<String, List<String>> =
            LinkedHashMap(responseHeaders)

        override fun connect() = Unit

        override fun disconnect() = Unit

        override fun usingProxy(): Boolean = false

        /** What the app wrote, as text. */
        fun written(): String = out.toString(Charsets.UTF_8)

        /**
         * Answer the request.
         *
         * The headers are given as a list per name, because a response
         * can set the same header more than once — a `Set-Cookie` for
         * each of two cookies, for instance.
         */
        fun reply(
            code: Int,
            payload: String,
            headers: Map<String, List<String>> = emptyMap(),
        ) {
            status = code
            body = payload.toByteArray(Charsets.UTF_8)
            headers.forEach { (k, v) -> responseHeaders[k] = v.toMutableList() }
        }
    }

    /** What the app asked, in the order it asked it. */
    private var responder: (Fixture.() -> Unit)? = null

    /** Each test says how the platform answers. */
    fun onRequests(action: Fixture.() -> Unit) {
        responder = action
    }

    /** Record the request and let the test answer it. */
    private fun record(connection: Fixture) {
        synchronized(requests) {
            requests.add(
                Seen(
                    path = connection.path,
                    method = connection.requestMethod,
                    headers = LinkedHashMap(connection.requestProperties),
                    body = connection.written(),
                ),
            )
        }
        responder?.invoke(connection)
    }

    init {
        install()
    }
}
