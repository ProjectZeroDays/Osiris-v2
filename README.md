<div align="center">

# ⬡ OSIRIS

### Open Source Intelligence & Reconnaissance Integrated System

[![Live Demo](https://img.shields.io/badge/osirisai.live-00E5FF?style=for-the-badge&logo=vercel&logoColor=white)](https://osirislive.app)
[![Support OSIRIS](https://img.shields.io/badge/Support_Project-Patreon-FF424D?style=for-the-badge&logo=patreon&logoColor=white)](https://www.patreon.com/posts/159077425)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![MapLibre](https://img.shields.io/badge/MapLibre_GL-GPU_Rendered-396CB2?style=for-the-badge)](https://maplibre.org)
[![Kotlin](https://img.shields.io/badge/Kotlin-2.0-7F52FF?style=for-the-badge&logo=kotlin&logoColor=white)](https://kotlinlang.org)
[![Compose](https://img.shields.io/badge/Jetpack_Compose-Material3-4285F4?style=for-the-badge&logo=jetpackcompose&logoColor=white)](https://developer.android.com/jetpack/compose)
[![Electron](https://img.shields.io/badge/Electron-30-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org)
[![License](https://img.shields.io/badge/License-MIT-D4AF37?style=for-the-badge)](LICENSE)

**A real-time global intelligence dashboard that aggregates live flight tracking, CCTV networks, earthquake monitoring, conflict zone mapping, and 24/7 news feeds into a single GPU-accelerated interface — now with native Android, Windows Electron apps, and integrated Cyber-Security toolkit.**

[Live Demo](https://osirisai.live) · [Report Bug](https://github.com/simplifaisoul/osiris/issues) · [Request Feature](https://github.com/simplifaisoul/osiris/issues) · [Join Discord](https://discord.gg/umBykEpb98)

</div>

---

## Screenshots

<p align="center">
  <img src="docs/screenshots/taiwan-cctv.jpg" alt="OSIRIS over Taipei on the Night map, with live traffic-camera previews pinned across the city and the Longmen Building rooftop feed open" width="100%">
  <br><sub><b>Taiwan</b> — Taipei's public traffic cameras streaming live on the Night map, one feed open full-size</sub>
</p>

<p align="center">
  <img src="docs/screenshots/seoul-live-cctv.jpg" alt="OSIRIS over Seoul in 3D terrain around Namsan Tower, with live CCTV previews and the Cheonggyecheon feed open" width="100%">
  <br><sub><b>Seoul</b> — live CCTV in 3D terrain around Namsan Tower, with the Cheonggyecheon feed playing</sub>
</p>

<p align="center">
  <img src="docs/screenshots/save-an-area.jpg" alt="A drawn area over mountain terrain in OSIRIS, with the live cameras inside it and the Drawing Tools panel showing the saved area" width="100%">
  <br><sub><b>Save an Area</b> — draw a region and OSIRIS finds every camera inside it, ready to export as GeoJSON</sub>
</p>

---

## Overview

Osiris is a production-grade OSINT platform that provides situational awareness across multiple intelligence domains. Built with Next.js 16 and MapLibre GL, every data point is rendered via WebGL for 60fps performance even with thousands of concurrent entities on-screen.

### Key Capabilities

| Domain | Data Points | Sources |
|--------|------------|---------|
| **Aviation** | Commercial, Private, Military, Jets | OpenSky Network |
| **Maritime** | 39 Global Ports, 10 Chokepoints | Static Naval Intel |
| **CCTV** | 17,000+ Cameras | TfL, WSDOT, Caltrans, ODOT, MDOT, HK Transport Dept, Taiwan THB, NZTA, Rijkswaterstaat, Public Webcams + more |
| **Seismic** | Real-time M2.5+ | USGS Earthquake API |
| **Fires** | Active Hotspots | NASA FIRMS |
| **News** | 24/7 Live Streams | 23 Global Broadcasters |
| **Weather** | Severe Events | NASA EONET |
| **Space** | Solar Weather, Satellites | NOAA SWPC, N2YO |
| **Cyber** | CVE Threats, Vulnerability Scanning | NVD, Custom Scanner |
| **Conflict** | 13 Active Zones | Static OSINT Intel |
| **Crypto** | BTC + ETH Wallet Tracing, OFAC SDN Match | blockstream.info, Blockscout, OpenSanctions |
| **Sanctions** | Person / Org / Vessel SDN Search | OpenSanctions (US OFAC SDN mirror) |
| **Telegram OSINT** | Geoparsed Posts from Public Channels | `t.me/s/<channel>` web preview |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  OSIRIS CLIENT                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ MapLibre  │  │  HUD     │  │  RECON Toolkit│ │
│  │  GL (GPU) │  │ Panels   │  │  Port Scan    │ │
│  │  WebGL    │  │ Layers   │  │  DNS / WHOIS  │ │
│  │  Render   │  │ Controls │  │  Vuln Scanner │ │
│  └──────────┘  └──────────┘  └───────────────┘ │
├─────────────────────────────────────────────────┤
│               NEXT.JS API ROUTES                 │
│  /api/flights         /api/earthquakes          │
│  /api/cctv            /api/news                 │
│  /api/fires           /api/maritime             │
│  /api/gdelt           /api/satellites           │
│  /api/weather         /api/scanner              │
│  /api/sentinel        /api/telegram-feed        │
│  /api/osint/*  (whois, dns, ip, cve, sanctions, │
│                 crypto, sweep, threats, …)      │
├─────────────────────────────────────────────────┤
│              EXTERNAL DATA SOURCES               │
│  OpenSky · USGS · NASA · NOAA · TfL · NVD      │
│  GDACS · EONET · FIRMS · N2YO · RSS Feeds      │
│  blockstream.info · Blockscout · OpenSanctions  │
│  t.me public previews                            │
└─────────────────────────────────────────────────┘
```

---

## Platforms

### 🌐 Web (Next.js 16)
The flagship web application with MapLibre GL GPU-accelerated rendering.

**Quick Start:**
```bash
git clone https://github.com/simplifaisoul/osiris.git
cd osiris
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### 📱 Android (Kotlin + Jetpack Compose)
Native Android app with WebView integration, splash screen, and Cyber-Security tools dashboard.

**Build:**
```bash
cd android-app
# Requires Android SDK at C:\Android and Gradle 8.5
./gradlew assembleRelease
```

**Features:**
- Splash screen with app icon (1s delay)
- WebView loading osiris.app with full JS support
- Material 3 UI with purple theme
- Cyber-Security tools dashboard (connects to API server at 10.0.2.2:8080)
- Category tabs: recon, exploit, payload, crypto, network, web, mobile, forensics, etc.
- Tool execution with JSON output display

**APK Location:** `android-app/app/build/outputs/apk/release/osiris-app-release.apk`

### 🖥️ Windows Desktop (Electron 30)
Native Windows desktop application with system tray, native menus, settings window, and full Cyber-Security integration.

**Build:**
```bash
cd electron-app
npm install
npm run dist
```

**Features:**
- Hidden-inset title bar with native window controls
- System tray with minimize-to-tray, context menu
- Native application menu (Osiris, View, Tools, Window, Help)
- Settings modal with toggles (tray, auto-updates, dark mode, compact mode, start on login)
- System info panel (CPU, memory, uptime, Electron/Node/Chrome versions)
- Update checker with status banner
- Keyboard shortcuts: F12 DevTools, Ctrl+R Reload, F11 Fullscreen, Ctrl+H Hide, Ctrl+Q Quit
- Secure IPC with contextBridge, context isolation enabled
- Cyber-Security tools dashboard, reading the platform's registry at
  `OSIRIS_PLATFORM_URL` rather than keeping its own copy of the manifest
- Category tabs with tool counts, tool cards, parameter modals, real-time output
- A session of its own: the app signs in, holds the token in the main
  process so it never reaches the renderer, and keeps it encrypted with
  the operating system's credential store

**Executables:**
- Standalone: `electron-app/dist/win-unpacked/Osiris.exe` (169 MB)
- NSIS Installer: `electron-app/dist/Osiris Setup 1.0.0.exe` (73.3 MB)

---

## Cyber-Security Toolkit Integration

Osiris now includes an integrated Cyber-Security toolkit exposing **1,275 tools across 28 categories** from `C:\Projects\Cyber-Security\Tools`.

### The tool-collection worker

The wide collection — 1,275 tools across 28 categories — runs in a
separate process (`intel/osiris_api.py`) that imports tool modules and
runs some of them as subprocesses.

**It is not an API a client may reach.** The platform's dispatcher is
the only thing that talks to it, and it says so with a shared secret
compared in constant time. The worker answers nothing but its health
check without that secret, and it binds to loopback unless told
otherwise.

```bash
cd intel
pip install -r requirements.txt

export OSIRIS_WORKER_KEY=$(openssl rand -hex 32)
export OSIRIS_WORKER_PORT=8080
python osiris_api.py

# The health check is open: it says whether the worker is alive and what
# it can see, and nothing about that is a secret.
curl http://127.0.0.1:8080/api/health

# Everything else needs the secret.
curl -H "X-OSIRIS-Worker-Key: $OSIRIS_WORKER_KEY" \
  http://127.0.0.1:8080/api/tools
```

The platform reaches it through three allowlisted capabilities and checks
the tool against the worker's own catalogue before asking it to run
anything:

| Platform capability | What it does |
|---------------------|--------------|
| `tool-collection:collection.execute` | Runs one tool from the collection |
| `tool-collection:collection.list` | Lists the tools the worker can see |
| `tool-collection:collection.health` | Asks the worker whether it is alive |

A tool's result carries its provenance — the tool, the path it was
loaded from, the SHA-256 of its source, the entry point, the time and
the duration — and a finding produced by one is recorded as **inferred**,
never as observed.

### Tool Categories (28)

| Category | Tools | Description |
|----------|-------|-------------|
| **recon** | 16 | Reconnaissance & OSINT (Shodan, Censys, DNS, WHOIS, Google Dorks) |
| **exploit** | 41 | Exploits & Vulnerabilities (PoCGen, searchsploit integration) |
| **payload** | 8 | Payload Generation (msfvenom, custom encoders) |
| **crypto** | 6 | Cryptography & Encryption (GrayFish AES-256-GCM) |
| **network** | 13 | Network Tools (nmap, masscan, port scanners) |
| **web** | 14 | Web Application Security (nuclei, sqlmap, XSS scanners) |
| **mobile** | 3 | Mobile Security (ADB, Frida, Frida scripts) |
| **forensics** | 28 | Forensics & Analysis (exiftool, volatility, file carving) |
| **postexploit** | 28 | Post-Exploitation (privilege escalation, persistence) |
| **brute** | 4 | Brute Force & Cracking (hashcat, john, hydra) |
| **c2** | 8 | Command & Control (Sliver, Covenant, custom C2) |
| **social** | 1 | Social Engineering (phishing templates, SET) |
| **rat** | 3 | Remote Access Tools (AsyncRAT, Quasar, custom) |
| **core** | 6 | Core utilities (logging, env, deps, opsec, GrayFish) |
| **scan** | 4 | Scanning utilities |
| **control** | 13 | Control systems (ICS/SCADA) |
| **ops** | 4 | Operations utilities |
| **weapons** | 14 | Weaponized tools |
| **strix** | 79 | Strix framework tools |
| **overlord** | 4 | Overlord C2 |
| **QuantumCLI** | 15 | Quantum CLI tools |
| **Q-Android** | 3 | Android exploitation |
| **PoCGen** | 41 | Proof-of-Concept Generator |
| **Pagasus-Pro** | 6 | Pegasus-style tools |
| **Ruflo** | 7 | RuFlo tools |
| **shadowdragon** | 7 | ShadowDragon integration |
| **keV** | 1 | CISA KEV feed |
| **dorks** | 4 | Google dorking |
| **crack** | 1 | Cracking utilities |
| **catalog** | 1 | Tool catalog |
| **K8tools** | 19 | Kubernetes security tools |
| **OmniRoute** | 118 | OmniRoute networking |
| **LazyOwn** | 861 | LazyOwn collection |
| **guaardvark-system-manager** | 9 | GuaardVark system management |
| **camwar** | 4 | Camera warfare |
| **markets** | 1 | Marketplace tools |
| **social** | 1 | Social engineering |
| **sshshell** | 3 | SSH shell tools |
| **vphone-aio-clone** | 1 | VPhone AIO clone |
| **shotdroid** | 1 | ShotDroid |
| **remote-admin-tool-main** | 1 | Remote admin |
| **nmap-vulners-2.0.2** | 1 | Nmap vulners |
| **Ladon** | 1 | Ladon scanner |
| **eapm** | 1 | EAPM |
| **dash** | 1 | Dashboard |

### Running the worker

The worker needs a shared secret before it answers anything but its
health check, and it binds to loopback by default:

```bash
cd intel
pip install -r requirements.txt

export OSIRIS_WORKER_KEY=$(openssl rand -hex 32)
export OSIRIS_WORKER_PORT=8080
python osiris_api.py
```

The platform reaches it with the same key, set in its own environment
as `OSIRIS_WORKER_URL` and `OSIRIS_WORKER_KEY`. A worker started
without a key refuses every route but its health check, and the platform
refuses to talk to a worker that answers without one.

---

## Features

### Intelligence Layers (Web)
- **16 toggleable data layers** with real-time entity counts
- **GPU-accelerated rendering** — all map data rendered via WebGL, not DOM
- **Progressive loading** — data fetched on-demand when layers are activated
- **Viewport-aware** — only loads relevant data for the visible region

### OI — a prediction engine (bring your own key)
**OI Assist**: talk to the map (press O). Ask in words, typed or spoken, and OI flies you there, switches the layers on, finds what is live (flights, military aircraft, ships, quakes, fires, weather, news, cameras, satellites), marks it on the globe in cyan with the area it searched, lists it in cards you can click through, reads the markets, opens panels and starts forecasts, all on your own model key.

**OI Forecast**: a prediction engine inspired by the community-made [Pythia](https://github.com/jangles-byte/Pythia) and by [MiroFish](https://github.com/666ghj/MiroFish). From Pythia comes the idea of forecasting from the live world OSIRIS already watches; from MiroFish, the method: cast the actors who shape an outcome and play them against each other in parallel simulated worlds. Ask a question and OI researches it from sources you can check (news, prices, prediction markets and the live feeds), runs the worlds, and has a report agent weigh the result against the crowd's price and a statistical baseline before it writes a calibrated forecast, every claim linked to its source. The whole run plays out on the globe as it happens.

- **Your own data**: add files (CSV, JSON, Markdown, text, logs, web pages) or paste up to 100,000 characters. The world model reads it once; or have every actor read it in every period, and quote it. The extra input tokens are shown before you run, on your own key.
- **Your own key**: OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, DeepSeek, xAI, Mistral or Qwen. Kept in your browser, sent per request in a header, never stored on the server.
- **REST API** under `/api/oi` with live Server-Sent Events, and an **MCP server** at `/api/mcp` so agents such as Hermes, Claude and Cursor can run predictions, steer them and read OSIRIS intelligence. See [the docs](https://osirisai.live/docs#oi).

### RECON Toolkit
- **Port Scanner** — TCP connect scan with service fingerprinting
- **DNS Lookup** — Full record resolution (A, AAAA, MX, NS, TXT, CNAME)
- **WHOIS** — Domain/IP registration data (auto-cross-checked against OFAC SDN)
- **SSL/TLS Inspector** — Certificate chain analysis
- **IP Intelligence** — Geolocation, ASN, threat reputation (auto-cross-checked against OFAC SDN)
- **Vulnerability Scanner** — CVE lookup against NVD database
- **Crypto Wallet Trace** — BTC + ETH lookup (balance, tx history, OFAC SDN sanctions flag)
- **OFAC Sanctions Search** — query persons, organizations, vessels and aircraft against the US OFAC SDN list

### Live Broadcast Network
- **23 live 24/7 news streams** from global broadcasters
- Click any news dot on the map to open the live stream
- Feeds from NBC, CBS, ABC, Sky News, Al Jazeera, France 24, NHK, WION, and more

### Telegram OSINT Layer
- **Public-channel feed** scraped from the unauthenticated `t.me/s/<channel>` web preview — no Bot API token, no MTProto
- Default curated set of 5 channels (EN + RU/UA war reporting), overridable via `OSIRIS_TELEGRAM_CHANNELS`
- Posts are geoparsed against a multilingual place dictionary (EN + Cyrillic + Arabic) and plotted on the map
- Click any cyan dot to read the post and jump to the original on Telegram

### Crypto Wallet Intelligence
- **BTC** lookups via [blockstream.info](https://blockstream.info) (Esplora API, keyless)
- **ETH** lookups via [Blockscout](https://github.com/blockscout/blockscout)'s public ETH instance (`eth.blockscout.com`, keyless)
- Every lookup is cross-checked against the OFAC SDN sanctioned-address list (mirrored from [`0xB10C/ofac-sanctioned-digital-currency-addresses`](https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses))
- Sanctioned wallets surface a red **SANCTIONED — OFAC SDN** badge in the RECON panel

### OFAC SDN Cross-Check
- Standalone `SANCTIONS` tab in the RECON toolkit — full-text search across persons, organisations, vessels and aircraft
- WHOIS and IP-intel routes auto-cross-check registrant / ASN-owner names against the SDN list and surface an inline alert
- Data sourced from [OpenSanctions](https://www.opensanctions.org) (CC-BY 4.0) — keyless, ~7 MB cached in-memory for 24h

### Conflict Zone Monitoring
- **13 active conflict/tension zones** with severity-coded warning markers
- Active Wars: Ukraine, Gaza, Sudan, Myanmar, DRC, Yemen
- High Tension: Syria, Lebanon, Sahel, Somalia, Red Sea
- Elevated: Taiwan Strait, Korean DMZ

### Performance Optimized
- **75% reduction in edge requests** vs initial release
- Aggressive polling relaxation (15-30 min intervals for stable data)
- Static data served from memory (zero external API calls for news feeds)
- `layerFetchedRef` prevents duplicate API requests

---

## Quick Start

### Web (Next.js)
```bash
git clone https://github.com/simplifaisoul/osiris.git
cd osiris
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

Without a database the platform runs single-tenant and needs no sign-in.
With one — see [BUILD.md](BUILD.md#the-platforms-database) — it demands a
session, and a platform with no accounts grows its own first one: visit
it and the first-run screen creates the administrator and signs it in.

```bash
# A durable deployment: findings, audit, quotas, the asset registry.
export DATABASE_URL=postgres://user:pass@127.0.0.1:5432/osiris
npx drizzle-kit migrate

# Give an existing account a password, then sign in with it.
npm run user:password -- operator@osiris.local "your-password-here"
```

### Android (Kotlin)
```bash
cd android-app
# Set up Android SDK at C:\Android
# Gradle 8.5 at C:\Android\gradle-8.5
./gradlew assembleRelease
```
APK: `android-app/app/build/outputs/apk/release/osiris-app-release.apk`

### Windows Desktop (Electron)
```bash
cd electron-app
npm install
npm run dist
```
Executables: `electron-app/dist/win-unpacked/Osiris.exe` and `electron-app/dist/Osiris Setup 1.0.0.exe`

### Cyber-Security API Server
```bash
cd intel
pip install -r requirements.txt
python osiris_api.py
```
Server at `http://localhost:8080`

### Docker / Self-Hosting
```bash
git clone https://github.com/simplifaisoul/osiris.git
cd osiris
cp .env.template .env
docker compose up -d
```
Open [http://localhost:3000](http://localhost:3000)

**Prebuilt image (GHCR):**
```bash
docker pull ghcr.io/simplifaisoul/osiris:latest
docker run -d -p 3000:3000 --env-file .env ghcr.io/simplifaisoul/osiris:latest
```

---

## Documentation

**[docs/README.md](docs/README.md)** is the wiki's index: what each page
is for, and when you would want it.

| Document | Covers |
|----------|--------|
| **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** | Real failure modes, with the cause and the fix |
| [BUILD.md](BUILD.md) | Building each client, the database, migrations, seeding |
| [DOCKER.md](DOCKER.md) | Self-hosting, Compose, CasaOS, and which keys the code reads |
| [CI_CD_SETUP.md](CI_CD_SETUP.md) | Pipeline jobs, secrets, self-hosted runners, release flow |
| [SECURITY.md](SECURITY.md) | Responsible use and reporting a vulnerability |
| [docs/RELEASE-DOCS.md](docs/RELEASE-DOCS.md) | Release process and packaging |
| [docs/GAP-ANALYSIS.md](docs/GAP-ANALYSIS.md) | v4-v12 security claims, audited against the code |
| **[docs/ADDING-A-TOOL.md](docs/ADDING-A-TOOL.md)** | Adding a tool: the manifest, the allowlist, the adapter, the window, the beacon, the tests |
| **[docs/LICENSES.md](docs/LICENSES.md)** | Every source's licence, what it obliges, and the share-alike warning |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What is built, what is next, and what is deliberately not on the list |
| `/docs` (in the running app) | Every public API endpoint, generated from the catalog |

The API catalog at `src/app/docs/apiCatalog.ts` is checked against the
routes on disk by a test, in both directions — a route with no entry
fails, and an entry with no route fails.

---

## Release Artifacts

Latest release: **v1.0.19** - [osiris-release-1.0.19.zip](releases/osiris-release-1.0.19.zip) (157 MB)

| Artifact | Size | Description |
|----------|------|-------------|
| `electron.exe` | 169 MB | Windows standalone executable |
| `osiris-app-release.apk` | 10.31 MB | **Signed** Android APK |
| `osiris-electron-1.0.19-x64.nsis.exe` | 73.3 MB | NSIS installer |
| `RELEASE-NOTES.md` | 4.4 KB | Release documentation |

---

## Health and readiness

Two routes, two questions. A load balancer and a container health check
want the second one.

| Route | Question | Answers |
|-------|----------|---------|
| `GET /api/health` | Is the process up? | 200, always. It checks nothing else on purpose — a probe that fans out on every call is a self-inflicted outage under load. |
| `GET /api/ready` | Can this instance serve? | 200 when it can, 503 when it cannot, and the body names the check that failed. |

`/api/ready` checks that the database is reachable and has its tables,
that there is at least one account anybody can sign in as, and that the
tool-collection worker answers if one is configured. A platform with a
database and no accounts is up and useless — it demands a session and has
nobody to make one for.

Both answer without a session, because a probe cannot sign in.

---

## Environment Variables

OSIRIS works **partially without any API keys** — all core feeds use public, keyless sources. Copy [`.env.template`](.env.template) to `.env` and set only what you need:

```env
# Published host port (container always listens on 3000). Default: 3000
OSIRIS_PORT=3000

# RECON scanner backend (the only vars the current code reads).
# SCANNER_KEY must match the backend's OSIRIS_KEY — generate with: openssl rand -hex 32
SCANNER_URL=
SCANNER_KEY=

# Optional, for higher rate limits / future sources
FIRMS_API_KEY=                # NASA FIRMS
OPENSKY_CLIENT_ID=            # OpenSky OAuth2
OPENSKY_CLIENT_SECRET=
N2YO_API_KEY=                 # N2YO satellites
AIS_API_KEY=                 # aisstream.io maritime

# Cyber-Security API
CYBER_API_URL=http://localhost:8080/api
```

> Without `SCANNER_URL`/`SCANNER_KEY` the RECON toolkit returns `503`; every other layer works out of the box. `.env` is gitignored — only the template is committed.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Web Framework** | Next.js 16 (App Router, Turbopack) |
| **Web Language** | TypeScript 5 |
| **Map Engine** | MapLibre GL JS (WebGL) |
| **Animations** | Framer Motion |
| **Icons** | Lucide React |
| **Styling** | Custom CSS Design System |
| **Deployment** | Vercel Edge Network |
| **Android Framework** | Kotlin + Jetpack Compose Material 3 |
| **Android Min SDK** | 26 (Android 8.0) |
| **Android Target SDK** | 34 (Android 14) |
| **Desktop Framework** | Electron 30 + Electron Builder |
| **Cyber API** | Flask (Python 3.11+) |
| **Crypto** | GrayFish (AES-256-GCM) |

---

## Keyboard Shortcuts

### Web
| Key | Action |
|-----|--------|
| `F` | Toggle flight layers |
| `E` | Toggle earthquakes |
| `S` | Toggle satellites |
| `D` | Toggle day/night cycle |
| `Escape` | Close panels |

### Electron Desktop
| Key | Action |
|-----|--------|
| `F12` | Toggle DevTools |
| `Ctrl+R` | Reload |
| `F11` | Toggle Fullscreen |
| `Ctrl+H` | Hide to Tray |
| `Ctrl+Q` | Quit |
| `Ctrl+Plus` | Zoom In |
| `Ctrl+Minus` | Zoom Out |
| `Ctrl+0` | Reset Zoom |

---

## Acknowledgements

**Public webcams** — the cameras in this layer are open data: each one is broadcast publicly by whoever runs it, on their own site or their own channel. What the web lacked was a catalogue of them.

[bekijkhet.nu](https://www.bekijkhet.nu/) is that catalogue, and it is the basis for every camera in the layer. Bram and Annelies have kept it by hand since 2012, and without their index these cameras would still be scattered across several hundred unrelated sites with no way to find them.

OSIRIS links every one of them straight through to the operator who runs it, which is also how bekijkhet.nu asks to be read.

**OI** — the method behind OI follows [MiroFish](https://github.com/666ghj/MiroFish), the open-source swarm-intelligence prediction engine: seed a parallel world from real material, populate it with agents, let them interact while variables are injected, and hand the simulation to a report agent. OSIRIS rebuilds that method natively for its own feeds and globe; no MiroFish code is used.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

**🛠️ SUPPORT THE OSIRIS PROJECT**

The OSIRIS Global Intelligence Grid is entirely open-source, but running the backend scanners and data firehoses isn't cheap.

If you want to help keep the servers alive, and support us to get access to better tools unlock the **Special OSIRIS Console**, you can officially support the project here:

🔗 [Support OSIRIS on Patreon](https://www.patreon.com/posts/159077425)

*Supporters receive the `🔴 RedTeam Console` role and access to encrypted developer comms.*

**Built by [simplifaisoul](https://github.com/simplifaisoul)**

[Join our Discord to be a part of this movement!](https://discord.gg/umBykEpb98)

</div>