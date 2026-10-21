package com.osiris.app

import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

/**
 * The tool registry, as this app reads it.
 *
 * This is the fetch and the parse that used to sit inside the screen's
 * Composable, where nothing could reach them: the screen both performed
 * the request and interpreted the answer in one closure. Pulling them
 * out means the screen renders a list it is given, and the part that
 * decides what that list is can be tested against a fixture platform.
 *
 * The app does not keep its own copy of the registry. One manifest means
 * one place for a tool's name, its capabilities and how long its findings
 * are kept, and the platform's deny-by-default allowlist is the
 * platform's to enforce.
 */
object PlatformRegistry {

    /** One registered tool, as the platform describes it. */
    data class Tool(
        val id: String,
        val name: String,
        val description: String,
        val riskClass: String,
        val state: String,
        val retentionDays: Int,
        val requiresAsset: Boolean,
        val requiresConsent: Boolean,
        val capabilities: List<String>,
    )

    /**
     * What the platform answered.
     *
     * `status` is the platform's own; `tools` is empty unless it was 200.
     * A refusal is returned rather than thrown, because a deployment that
     * has closed its registry is not an error — it is a decision the
     * operator made, and the screen says so.
     */
    data class Outcome(val status: Int, val tools: List<Tool>, val total: Int, val error: String?)

    /** Read the registry, presenting the session if the app holds one. */
    fun read(): Outcome {
        val connection = try {
            URL("${OsirisConfig.platformUrl}${OsirisConfig.registryPath}")
                .openConnection() as HttpURLConnection
        } catch (e: Exception) {
            return Outcome(-1, emptyList(), 0, e.message)
        }

        return try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 8_000
            connection.readTimeout = 8_000
            connection.setRequestProperty("Cache-Control", "no-store")
            /* The session the platform issued, if there is one. A
               deployment may require it on this route; without it the
               platform refuses, and that refusal is the answer. */
            PlatformSession.headers().forEach { (k, v) -> connection.setRequestProperty(k, v) }

            val status = connection.responseCode
            val text = streamFor(connection, status)
                ?.bufferedReader()?.use(BufferedReader::readText).orEmpty()

            if (status != 200) {
                val error = runCatching { JSONObject(text).optString("error") }.getOrNull()
                Outcome(status, emptyList(), 0, error?.ifBlank { null })
            } else {
                val json = JSONObject(text)
                Outcome(200, parse(json.optJSONArray("tools")), json.optInt("total", 0), null)
            }
        } catch (e: Exception) {
            Outcome(-1, emptyList(), 0, e.message)
        } finally {
            connection.disconnect()
        }
    }

    /**
     * The tools out of a registry answer.
     *
     * Every field the screen shows is read here, with the platform's own
     * default where it gives one. A field the platform stops sending does
     * not become a crash; it becomes the default, and the operator sees
     * the same value the platform used to send.
     */
    fun parse(tools: JSONArray?): List<Tool> {
        if (tools == null) return emptyList()
        val list = mutableListOf<Tool>()
        for (i in 0 until tools.length()) {
            val t = tools.optJSONObject(i) ?: continue
            list.add(
                Tool(
                    id = t.optString("id"),
                    name = t.optString("name"),
                    description = t.optString("purpose", "No description"),
                    riskClass = t.optString("riskClass", "passive-metadata"),
                    state = t.optString("state", "not-configured"),
                    retentionDays = t.optInt("retentionDays", 0),
                    requiresAsset = t.optBoolean("requiresAsset", false),
                    requiresConsent = t.optBoolean("requiresConsent", false),
                    capabilities = t.optJSONArray("capabilities").toStringList(),
                )
            )
        }
        return list
    }

    private fun streamFor(connection: HttpURLConnection, status: Int) =
        if (status in 200..299) connection.inputStream else connection.errorStream

    private fun JSONArray?.toStringList(): List<String> {
        if (this == null) return emptyList()
        return (0 until length()).mapNotNull { optString(it).ifBlank { null } }
    }
}
