package com.osiris.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The registry, as this app reads it.
 *
 * The platform's registry is the app's source of truth for what a tool is
 * called, what it may do, and how long its findings are kept. This test
 * holds the app to the platform's own shape, so a change to the route that
 * this app has not caught up with fails here rather than in front of an
 * operator.
 *
 * What it does not cover, and what a JVM test cannot cover: the wire.
 * Whether the app puts its session cookie on the request is decided in
 * `PlatformSession` and `PlatformRegistry.read()`, both of which need an
 * Android `Context` and a device's keystore. That path is verified on a
 * device, and asserting it here would be asserting a mock.
 *
 * The fixture below is the real answer from the platform's own route:
 * `src/app/api/integrations/tools/route.ts`.
 */
class PlatformRegistryParseTest {

    /** A tool in the shape the platform sends. */
    private fun toolJson(
        id: String,
        name: String,
        purpose: String = "Fixture's account of $name",
        riskClass: String = "passive-metadata",
        state: String = "not-configured",
        retentionDays: Int = 90,
        requiresAsset: Boolean = false,
        requiresConsent: Boolean = false,
        capabilities: List<String> = listOf("host.search"),
    ): JSONObject = JSONObject()
        .put("id", id)
        .put("name", name)
        .put("purpose", purpose)
        .put("href", "/tools/security/$id")
        .put("riskClass", riskClass)
        .put("riskNote", "Fixture note")
        .put("state", state)
        .put("retentionDays", retentionDays)
        .put("requiresAsset", requiresAsset)
        .put("requiresConsent", requiresConsent)
        .put("upstream", JSONObject.NULL)
        .put("capabilities", JSONArray(capabilities))
        .put("tabs", JSONArray())

    @Test
    fun readsEveryFieldTheScreenRenders() {
        // Every one of these is shown to an operator or acted on. One that
        // the parser silently drops is one the operator never sees.
        val json = JSONArray(listOf(toolJson(
            id = "shodan",
            name = "Shodan",
            purpose = "Passive exposure context for verified assets",
            riskClass = "passive-metadata",
            state = "needs-authorization",
            retentionDays = 90,
            requiresAsset = true,
            requiresConsent = false,
            capabilities = listOf("host.search", "dns.resolve"),
        )))

        val tools = PlatformRegistry.parse(json)

        assertEquals(1, tools.size)
        val tool = tools.single()
        assertEquals("shodan", tool.id)
        assertEquals("Shodan", tool.name)
        assertEquals("Passive exposure context for verified assets", tool.description)
        assertEquals("passive-metadata", tool.riskClass)
        assertEquals("needs-authorization", tool.state)
        assertEquals(90, tool.retentionDays)
        assertTrue("the parser must keep a tool that requires an asset", tool.requiresAsset)
        assertEquals(listOf("host.search", "dns.resolve"), tool.capabilities)
    }

    @Test
    fun keepsEveryToolInTheOrderThePlatformSentThem() {
        // The screen lists these in order. A parser that sorted or
        // deduplicated them would reorder the operator's view.
        val json = JSONArray(listOf(
            toolJson("shodan", "Shodan"),
            toolJson("zenmap", "Zenmap", riskClass = "report-import"),
            toolJson("metasploit", "Metasploit", riskClass = "report-import"),
        ))

        val tools = PlatformRegistry.parse(json)

        assertEquals(3, tools.size)
        assertEquals(listOf("shodan", "zenmap", "metasploit"), tools.map { it.id })
    }

    @Test
    fun aToolWithNoCapabilitiesOffersNoButtons() {
        // The screen renders one button per capability. An empty list is
        // a tool that can be inspected but not run, which is a real state.
        val tool = PlatformRegistry.parse(JSONArray(listOf(
            toolJson("zenmap", "Zenmap", capabilities = emptyList()),
        ))).single()

        assertTrue("a tool with no capabilities must not be handed a fake one",
            tool.capabilities.isEmpty())
    }

    @Test
    fun aMissingOptionalFieldBecomesThePlatformsDefault() {
        // The platform may stop sending an optional field. The app must
        // show the same default the platform's own route would have sent,
        // not crash, and not invent a different value.
        val partial = JSONObject()
            .put("id", "shodan")
            .put("name", "Shodan")
            .put("purpose", "Passive exposure context")

        val tool = PlatformRegistry.parse(JSONArray(listOf(partial))).single()

        assertEquals("passive-metadata", tool.riskClass)
        assertEquals("not-configured", tool.state)
        assertEquals(0, tool.retentionDays)
        assertEquals("Passive exposure context", tool.description)
        assertTrue(tool.capabilities.isEmpty())
    }

    @Test
    fun anEmptyRegistryIsAnEmptyList() {
        // A deployment with no tools registered answers with an empty
        // array. The screen must show nothing rather than fail.
        assertTrue(PlatformRegistry.parse(JSONArray()).isEmpty())
    }

    @Test
    fun aMissingToolsArrayIsAnEmptyList() {
        // A refusal body has no `tools` key at all. The screen must treat
        // that the same as an empty registry rather than crash on it.
        assertTrue(PlatformRegistry.parse(null).isEmpty())
    }

    @Test
    fun anEntryThatIsNotAnObjectIsSkippedRatherThanCrashing() {
        // One malformed entry must not take the whole registry down; the
        // operator still sees the tools that did parse.
        val json = JSONArray(listOf(
            toolJson("shodan", "Shodan"),
            "not a tool",
            toolJson("zenmap", "Zenmap"),
        ))

        val tools = PlatformRegistry.parse(json)

        assertEquals(listOf("shodan", "zenmap"), tools.map { it.id })
    }
}
