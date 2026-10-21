package com.osiris.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * The Cyber-Security tools screen.
 *
 * The registry comes from the platform rather than from a copy in this
 * app, so the tool list, the capability allowlist and the audit trail are
 * the platform's. The 10.0.2.2 address is the host machine as seen from
 * the emulator; on a device it is the platform's own address.
 */
@Composable
fun CyberToolsScreen(onBack: () -> Unit) {
    var apiStatus by remember { mutableStateOf<String>("Checking...") }
    var tools by remember { mutableStateOf<List<PlatformRegistry.Tool>>(emptyList()) }
    var selectedRisk by remember { mutableStateOf<String?>(null) }
    var toolOutput by remember { mutableStateOf<String>("") }
    var isLoading by remember { mutableStateOf(false) }
    var expandedTool by remember { mutableStateOf<String?>(null) }

    /* The platform's session. The platform demands one before it will run
       a tool, so the app has to be able to have one. The token is held by
       the app and presented on every call. */
    val context = androidx.compose.ui.platform.LocalContext.current
    var needsSession by remember { mutableStateOf(false) }
    var signedInAs by remember { mutableStateOf<String?>(null) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var signInMessage by remember { mutableStateOf<String?>(null) }
    var signInError by remember { mutableStateOf(false) }

    /** The platform's integration dispatcher. */
    val base = remember { "${OsirisConfig.platformUrl}/api/integrations" }

    fun loadRegistry() {
        CoroutineScope(Dispatchers.IO).launch {
            val outcome = PlatformRegistry.read()
            tools = outcome.tools
            apiStatus = when {
                outcome.status == 200 ->
                    "Platform online (${outcome.total} tools)"
                outcome.status == 401 ->
                    "The platform closed its registry to callers without a session. Sign in below."
                outcome.status == -1 ->
                    "Platform offline: ${outcome.error}"
                else ->
                    "Platform error: ${outcome.status}"
            }

            /* Whether the platform wants a session. A platform with no
               database runs single-tenant and wants none; one with
               accounts does, and until the app signs in the dispatcher
               refuses every call. */
            val state = PlatformSession.checkPlatform()
            needsSession = state.reachable && state.needsSession
            signedInAs = if (state.authenticated) state.email else null
        }
    }

    /** Sign in to the platform. */
    fun signIn() {
        CoroutineScope(Dispatchers.IO).launch {
            val result = PlatformSession.signIn(email, password)
            signInMessage = result.message
            signInError = !result.ok
            if (result.ok) {
                password = ""
                // Keep it for the next time the app is opened. A failure
                // to write it does not undo the sign-in: the session
                // works until the app is closed.
                PlatformSession.remember(context)
                loadRegistry()
            }
        }
    }

    /** Sign out of the platform. */
    fun signOut() {
        CoroutineScope(Dispatchers.IO).launch {
            PlatformSession.signOut(context)
            signInMessage = null
            signInError = false
            loadRegistry()
        }
    }

    /**
     * Run one capability of one tool.
     *
     * The platform checks the capability against its allowlist again, so
     * offering a capability here is not a grant — it is a request.
     */
    fun executeTool(tool: PlatformRegistry.Tool, capability: String, params: JSONObject) {
        isLoading = true
        toolOutput = "Running ${tool.id} / $capability ..."
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val body = JSONObject()
                    .put("purpose", "operator request from the Android app")
                    .put("payload", params)
                if (tool.requiresAsset) body.put("assetId", "asset-1")
                if (tool.requiresConsent) body.put("consentAttestation", true)

                val connection = (java.net.URL("$base/${tool.id}/$capability").openConnection()
                        as java.net.HttpURLConnection)
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.connectTimeout = 10000
                connection.readTimeout = 60000
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Cache-Control", "no-store")
                /* The session the platform issued. Without it the
                   dispatcher refuses the call, which is the platform
                   doing its job rather than the app failing. */
                PlatformSession.headers().forEach { (k, v) ->
                    connection.setRequestProperty(k, v)
                }

                val outputStream = connection.outputStream
                outputStream.write(body.toString().toByteArray())
                outputStream.flush()
                outputStream.close()

                val stream = if (connection.responseCode >= 400) connection.errorStream
                             else connection.inputStream
                val response = stream?.bufferedReader()?.readText() ?: "{}"
                if (connection.responseCode == 401) {
                    toolOutput = "HTTP 401\n$response\n\nThe platform refused this call: there is no session. Sign in above and try again."
                } else {
                    toolOutput = "HTTP ${connection.responseCode}\n$response"
                }
            } catch (e: Exception) {
                toolOutput = "Error: ${e.message}"
            } finally {
                isLoading = false
            }
        }
    }

    // Load the registry when the screen first appears.
    androidx.compose.runtime.LaunchedEffect(Unit) {
        loadRegistry()
    }

    val riskGroups = listOf(
        "all" to "All",
        "passive-metadata" to "Passive",
        "report-import" to "Import",
        "active-transmit" to "Transmits",
        "user-owned-media" to "Your media",
        "read-only-mcp" to "Read-only",
    )

    val visible = tools.filter { selectedRisk == null || selectedRisk == "all" || it.riskClass == selectedRisk }

    Column(modifier = Modifier.fillMaxSize()) {
        // Header
        Card(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            colors = CardDefaults.cardColors(containerColor = androidx.compose.material3.MaterialTheme.colorScheme.surface)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Cyber-Security Tools", style = androidx.compose.material3.MaterialTheme.typography.titleLarge)
                    Text(apiStatus, style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                         color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Button(onClick = { loadRegistry() }) { Text("Refresh") }
            }
        }

        // The session. It appears only when the platform says it needs
        // one: a platform with no database runs single-tenant, and a
        // form that cannot work is worse than no form.
        if (needsSession || signedInAs != null) {
            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                colors = CardDefaults.cardColors(containerColor = androidx.compose.material3.MaterialTheme.colorScheme.surface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    if (signedInAs != null) {
                        Text("Signed in as $signedInAs",
                             style = androidx.compose.material3.MaterialTheme.typography.bodyMedium)
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedButton(onClick = { signOut() }) { Text("Sign out") }
                    } else {
                        Text("This platform needs a session",
                             style = androidx.compose.material3.MaterialTheme.typography.titleSmall)
                        Text("Sign in to run a tool. The dispatcher always needs a session, and this deployment may require one for the registry too.",
                             style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                             color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = email,
                            onValueChange = { email = it },
                            label = { Text("Email") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = password,
                            onValueChange = { password = it },
                            label = { Text("Password") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        if (signInMessage != null) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                signInMessage!!,
                                style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                                color = if (signInError)
                                    androidx.compose.material3.MaterialTheme.colorScheme.error
                                else
                                    androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(
                            onClick = { signIn() },
                            enabled = email.isNotBlank() && password.isNotBlank()
                        ) { Text("Sign in") }
                    }
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
        }

        // Risk groups
        LazyRow(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(riskGroups) { (id, label) ->
                val count = if (id == "all") tools.size
                            else tools.count { it.riskClass == id }
                if (count == 0) return@items
                val selected = selectedRisk == id
                Text(
                    text = "$label ($count)",
                    modifier = Modifier
                        .background(
                            color = if (selected) androidx.compose.material3.MaterialTheme.colorScheme.primaryContainer
                                    else androidx.compose.material3.MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(8.dp)
                        )
                        .clickable { selectedRisk = id }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    style = androidx.compose.material3.MaterialTheme.typography.labelMedium,
                    color = if (selected) androidx.compose.material3.MaterialTheme.colorScheme.onPrimaryContainer
                            else androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Tools
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp)
        ) {
            items(visible) { tool ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = androidx.compose.material3.MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(tool.name, style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                                Text(tool.description, style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                                     color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            if (tool.riskClass == "active-transmit") {
                                Text("TRANSMITS", style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                                     color = Color(0xFFFF9500))
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "${tool.state} · ${tool.riskClass} · ${tool.retentionDays}d retention",
                            style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                            color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(12.dp))

                        // The capabilities this tool may run, and a way to run one.
                        tool.capabilities.forEach { capability ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(capability, style = androidx.compose.material3.MaterialTheme.typography.bodySmall.copy(
                                    fontFamily = FontFamily.Monospace),
                                     color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant)
                                Button(
                                    onClick = { executeTool(tool, capability, JSONObject()) },
                                    enabled = !isLoading
                                ) { Text("Run") }
                            }
                        }

                        if (expandedTool == tool.id) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Asset: ${if (tool.requiresAsset) "required" else "not required"} · " +
                                       "Consent: ${if (tool.requiresConsent) "required" else "not required"}",
                                style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                                color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }

        // Output
        if (toolOutput.isNotBlank()) {
            Card(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                colors = CardDefaults.cardColors(containerColor = androidx.compose.material3.MaterialTheme.colorScheme.surface)
            ) {
                Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Output", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                        if (isLoading) {
                            Icon(Icons.Default.Refresh, contentDescription = "Loading",
                                 modifier = Modifier.size(24.dp),
                                 tint = androidx.compose.material3.MaterialTheme.colorScheme.primary)
                        }
                    }
                    Text(text = toolOutput,
                         style = androidx.compose.material3.MaterialTheme.typography.bodySmall.copy(
                             fontFamily = FontFamily.Monospace),
                         modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                }
            }
        }
    }
}
