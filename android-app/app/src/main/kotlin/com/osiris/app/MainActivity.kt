package com.osiris.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.osiris.app.ui.theme.OsirisTheme
import androidx.annotation.OptIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        /* The stored session is read once, at startup, so the app already
           holds a session on the screen that needs one. */
        PlatformSession.load(applicationContext)
        setContent {
            OsirisTheme {
                OsirisApp()
            }
        }
    }
}

@Composable
fun OsirisApp() {
    var currentScreen by remember { mutableStateOf<Screen>(Screen.Home) }
    var webViewUrl by remember { mutableStateOf<String>("https://osiris.app") }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Osiris") },
            actions = {
                IconButton(onClick = { currentScreen = Screen.Home }) {
                    Icon(Icons.Default.Home, contentDescription = "Home")
                }
                IconButton(onClick = { webViewUrl = "https://osiris.app"; currentScreen = Screen.WebView }) {
                    Icon(Icons.Default.Refresh, contentDescription = "Reload")
                }
                IconButton(onClick = { currentScreen = Screen.CyberTools }) {
                    Icon(Icons.Default.Security, contentDescription = "Cyber Tools")
                }
                IconButton(onClick = { currentScreen = Screen.Settings }) {
                    Icon(Icons.Default.Settings, contentDescription = "Settings")
                }
            }
        )

        androidx.compose.foundation.layout.Box(modifier = Modifier.fillMaxSize()) {
            when (currentScreen) {
                Screen.Home -> HomeScreen(onNavigate = { screen -> currentScreen = screen }, onLoadWeb = { url -> webViewUrl = url; currentScreen = Screen.WebView })
                Screen.WebView -> WebViewScreen(url = webViewUrl, onBack = { currentScreen = Screen.Home })
                Screen.CyberTools -> CyberToolsScreen(onBack = { currentScreen = Screen.Home })
                Screen.Settings -> SettingsScreen(onBack = { currentScreen = Screen.Home })
            }
        }
    }
}

enum class Screen { Home, WebView, CyberTools, Settings }

@Composable
fun HomeScreen(onNavigate: (Screen) -> Unit, onLoadWeb: (String) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Osiris",
            style = androidx.compose.material3.MaterialTheme.typography.displayLarge.copy(
                fontWeight = FontWeight.Black,
                color = androidx.compose.material3.MaterialTheme.colorScheme.primary
            )
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Native Android • Kotlin • Material 3",
            style = androidx.compose.material3.MaterialTheme.typography.bodyLarge,
            color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(32.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = androidx.compose.material3.MaterialTheme.colorScheme.primaryContainer)
        ) {
            androidx.compose.foundation.layout.Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Text("Quick Actions", style = androidx.compose.material3.MaterialTheme.typography.titleLarge)
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onLoadWeb("https://osiris.app") }
                ) { Text("Open Osiris Web App") }
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onLoadWeb("https://github.com/osiris") }
                ) { Text("GitHub Repository") }
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onNavigate(Screen.CyberTools) }
                ) { Text("Cyber-Security Tools") }
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onNavigate(Screen.Settings) }
                ) { Text("Settings") }
            }
        }
    }
}


@Composable
fun WebViewScreen(url: String, onBack: () -> Unit) {
    val context = LocalContext.current
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            WebView(ctx).apply {
                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    databaseEnabled = true
                    cacheMode = WebSettings.LOAD_DEFAULT
                    setSupportZoom(true)
                    builtInZoomControls = true
                    displayZoomControls = false
                    loadWithOverviewMode = true
                    useWideViewPort = true
                    mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                }
                webViewClient = WebViewClient()
                webChromeClient = WebChromeClient()
                loadUrl(url)
            }
        },
        update = { webView ->
            if (webView.url != url) {
                webView.loadUrl(url)
            }
        }
    )
}

@Composable
fun SettingsScreen(onBack: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Settings", style = androidx.compose.material3.MaterialTheme.typography.displayMedium)
        Spacer(modifier = Modifier.height(24.dp))
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = androidx.compose.material3.MaterialTheme.colorScheme.surfaceVariant)
        ) {
            androidx.compose.foundation.layout.Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Text("App Version: 1.0.5", style = androidx.compose.material3.MaterialTheme.typography.bodyLarge)
                Text("Build: Release", style = androidx.compose.material3.MaterialTheme.typography.bodyMedium)
                Text("Min SDK: 26 (Android 8.0)", style = androidx.compose.material3.MaterialTheme.typography.bodyMedium)
                Text("Target SDK: 34 (Android 14)", style = androidx.compose.material3.MaterialTheme.typography.bodyMedium)
                Spacer(modifier = Modifier.height(16.dp))
                Text("Cyber API: http://10.0.2.2:8080", style = androidx.compose.material3.MaterialTheme.typography.bodySmall, color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
