# Build Guide

Complete build instructions for all Osiris platforms.

## Prerequisites

### Android
- **Android SDK**: `C:\Android` (or set `ANDROID_HOME`)
- **Gradle 8.5**: `C:\Android\gradle-8.5`
- **JDK 17+** (for Gradle)
- **Build Tools 34.0.0+**

### Electron (Windows)
- **Node.js 20+**
- **npm 10+**
- **Python 3.8+** (for node-gyp)
- **Visual Studio Build Tools** (for native modules)

### Cyber-Security API (Python)
- **Python 3.11+**
- **pip**
- **Flask, cryptography, requests, pycryptodome, python-nmap, shodan**

---

## Android Build

```bash
cd android-app

# Configure local.properties (auto-generated if missing)
echo "sdk.dir=C:\\Android" > local.properties

# Configure gradle.properties
cat > gradle.properties << EOF
android.useAndroidX=true
android.enableJetifier=true
org.gradle.jvmargs=-Xmx4096m -Xms4096m -XX:+UseParallelGC
EOF

# Build release APK
./gradlew clean assembleRelease

# Output: app/build/outputs/apk/release/app-release-unsigned.apk
# Sign with debug keystore (for testing):
# apksigner sign --ks ~/.android/debug.keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey app-release-unsigned.apk
```

### Troubleshooting

| Error | Fix |
|-------|-----|
| `SDK location not found` | Set `sdk.dir` in `local.properties` or `ANDROID_HOME` env var |
| `Gradle daemon died` | Increase JVM heap: `org.gradle.jvmargs=-Xmx4096m` |
| `AAPT: resource not found` | Ensure all drawable/mipmap resources exist; use vector drawables |
| `Kotlin compilation failed` | Add `-opt-in=androidx.compose.material3.ExperimentalMaterial3Api` to `kotlinOptions.freeCompilerArgs` |
| `Duplicate resource` | Remove duplicate files in `res/drawable/`, `res/mipmap/`, `res/values/` |

### Signing Release APK

```bash
# Generate keystore (once)
keytool -genkey -v -keystore osiris-release.keystore -alias osiris -keyalg RSA -keysize 2048 -validity 10000

# Sign APK
apksigner sign --ks osiris-release.keystore --ks-pass pass:YOUR_PASSWORD --key-pass pass:YOUR_PASSWORD --ks-key-alias osiris app-release-unsigned.apk

# Verify
apksigner verify app-release-unsigned.apk
```

---

## Electron Build (Windows)

```bash
cd electron-app

# Install dependencies
npm install

# Development
npm start

# Build distributables
npm run dist

# Output:
# dist/win-unpacked/Osiris.exe          (standalone)
# dist/Osiris Setup 1.0.0.exe           (NSIS installer)
```

### package.json Build Config

```json
{
  "build": {
    "appId": "com.osiris.electron",
    "productName": "Osiris",
    "win": {
      "target": ["nsis"],
      "icon": "public/icon.ico"
    },
    "files": ["main.js", "preload.js", "src/**/*", "public/**/*"],
    "directories": { "output": "dist" }
  }
}
```

### Code Signing (Requires Certificate)

```bash
# Set environment variables
export CSC_LINK="path/to/certificate.p12"
export CSC_KEY_PASSWORD="certificate_password"

# Or use electron-builder config
"win": {
  "certificateFile": "cert.p12",
  "certificatePassword": "password"
}
```

---

## Cyber-Security API Build

```bash
cd intel

# Install dependencies
pip install -r requirements.txt

# The worker needs a shared secret before it answers anything but its
# health check, and it binds to loopback by default.
export OSIRIS_WORKER_KEY=$(openssl rand -hex 32)
export OSIRIS_WORKER_PORT=8080
python osiris_api.py

# Server starts at http://127.0.0.1:8080
# Every route except /api/health needs the key:
curl -H "X-OSIRIS-Worker-Key: $OSIRIS_WORKER_KEY" http://127.0.0.1:8080/api/tools
```

### The platform's database

```bash
# The platform's own store: findings, audit, quotas, the asset registry.
# Without DATABASE_URL the platform runs single-tenant and keeps the
# record in memory; with it, everything is durable.
export DATABASE_URL=postgres://user:pass@127.0.0.1:5432/osiris

# Apply the migrations
npx drizzle-kit migrate

# For a local check, seed a tenant, a user, an asset and a consent.
# The platform refuses an unauthenticated request when a database is
# configured, so the check needs a session.
psql "$DATABASE_URL" -f intel/seed.local.sql
```

### Getting in

A deployment with a database demands a session, and a session is issued
rather than assumed. There are two ways to get one.

**The first-run screen.** A platform with no accounts has no way in at
all, so it grows one: the first account it is given becomes the
administrator of the first tenant, and it is signed in as it is created.
The route is open only while the platform has no users, and it is closed
behind the first one for good. Visit the platform with an empty database
and the screen appears.

**An existing account.** A password is a scrypt hash, so it cannot be
written with a plain SQL update — the hash has to be made the way the
platform makes it. The tool does that:

```bash
# Give the seeded account a password.
npm run user:password -- operator@osiris.local "your-password-here"

# Then sign in at / with that email and password.
```

The session is a random token in an `HttpOnly` cookie; the server stores
only the token's SHA-256, so a read of the `sessions` table yields
nothing, and signing out deletes the row rather than waiting for the
cookie to expire.

### The client's tests

Each native client has its own tests, and neither needs a device or an
emulator to run them.

```bash
# The desktop client, against a running platform with an account.
OSIRIS_PLATFORM_URL=http://localhost:3000 \
  node --test electron-app/test/platform.test.js

# The Android client, on the JVM.
cd android-app
gradle testDebugUnitTest
```

The Android client's **encrypted storage** cannot be tested on the JVM:
`MasterKeys` needs the Android keystore, and a JVM has not got one. That
path is covered by an instrumented test, which does need a device:

```bash
# With an emulator running (or a device attached):
cd android-app
gradle connectedDebugAndroidTest
```

It covers the encrypted path, the session surviving a reload, and the
token not being readable in the preferences file. The app has to declare
`androidx.test.runner.AndroidJUnitRunner` for it to be found at all —
without it the legacy runner starts, finds nothing, and reports a
successful run with zero tests.

The Android tests run in CI: the `android-build` job runs the unit tests
before it builds the APK, and the `web-build` job runs the desktop
client's tests against a platform it started. The instrumented test needs
an emulator image, which is a large download and a third-party action, so
it is run locally rather than in CI.

### The platform's probes

Two routes, two questions. A load balancer and a container health check
want the second one.

| Route | Question | Answers |
|-------|----------|---------|
| `GET /api/health` | Is the process up? | 200, always. It checks nothing else on purpose. |
| `GET /api/ready` | Can this instance serve? | 200 when it can, 503 when it cannot, and the body names the check that failed. |

`/api/ready` checks that the database is reachable and has its tables,
that there is at least one account anybody can sign in as, and that the
tool-collection worker answers if one is configured.

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/ready
```

### Quotas and costs

Two limits on the same calls, kept in the same row because they are the
same question asked two ways.

- A **quota** says how many calls a tenant may make per tool per day.
- A **cost** says what those calls cost, in the unit the provider charges
  in — a `shodan-query`, an `hibf-lookup`, an `ai-request`. The platform
  does not know what a credit is worth to you; it knows how many have
  been spent.

```bash
# What has been spent today, per tool.
curl -s -H "Cookie: $OSIRIS_SESSION" http://localhost:3000/api/integrations/costs | jq .total
```

Every capability declares a cost, and a capability with no declaration is
a build failure rather than a silent zero: a new capability that reaches
a metered service has to be given one, and one that does not has to be
given zero on purpose.

Most of the platform is free. The capabilities that are not are the ones
that reach somebody else's API and are metered for it.

### The database-backed tests

The sign-in flow is the platform's front door, so it is tested against a
real PostgreSQL rather than a mock — a mock would prove nothing about
whether a session is stored as a hash. The tests need a database with no
accounts in it, because the first-run route closes behind the first one.

```bash
# A database of its own, so the tests never touch a working one.
createdb osiris_test
export OSIRIS_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/osiris_test
DATABASE_URL="$OSIRIS_TEST_DATABASE_URL" npx drizzle-kit migrate

# The auth routes and the persistence layer.
npx vitest run src/app/api/auth src/lib/integrations/__tests__/persistence.test.ts
```

CI does exactly this: the `web-build` job starts a PostgreSQL service,
applies the migrations, and runs the whole suite against it. Without
`OSIRIS_TEST_DATABASE_URL` the database-backed tests skip themselves and
the rest of the suite runs unchanged.

#### Without a server to borrow

The recipe above assumes a PostgreSQL that is already running and a
password for it. If there is neither — a machine with no Docker daemon,
or an installed server whose password is not known — a throwaway cluster
needs no credentials at all, because trust auth is configured at
creation. On Windows, with the PostgreSQL binaries on disk:

```powershell
$pg   = "C:\Program Files\PostgreSQL\17\bin"
$dir  = "$env:TEMP\pgdata"          # a directory of its own
& "$pg\initdb.exe" -D $dir -U postgres -A trust -E UTF8
# Start it detached: a server started as a child of a shell that then
# exits dies with it (0xC0000142 on Windows), so do not just `& pg_ctl`.
Start-Process "$pg\pg_ctl.exe" -WindowStyle Hidden `
  -ArgumentList "-D","`"$dir`"","-l","`"$dir\pg.log`"","-o","`"-p 5433`"","start"

$env:DATABASE_URL = "postgres://postgres@127.0.0.1:5433/osiris"
& "$pg\createdb.exe" -h 127.0.0.1 -p 5433 -U postgres osiris
npx drizzle-kit migrate
```

`-A trust` means no password is asked for over the loopback, so the URL
carries no credentials. It is a test cluster on a non-default port and
should be stopped and deleted when finished — it is not a deployment.
Do not run `initdb` under an elevated token on Windows; it refuses.

### The native clients

Both native apps talk to the platform over HTTP and both need a session
to run anything, because the dispatcher checks the session on every call.

```bash
# The desktop app reads the platform's address from its own environment.
OSIRIS_PLATFORM_URL=http://localhost:3000 npm start     # in electron-app/

# The Android app has it in OsirisConfig.kt, where 10.0.2.2 is the host
# machine as seen from an emulator.
```

Each app signs in from its own settings, and keeps the session token
encrypted: the desktop app with Electron's `safeStorage`, which uses the
operating system's credential store, and the Android app with
`EncryptedSharedPreferences`, whose key lives in the Android keystore.
The desktop app keeps the token in the main process and never hands it
to the renderer.

The desktop client's session is tested against a running platform:

```bash
OSIRIS_PLATFORM_URL=http://localhost:3000 \
  node --test electron-app/test/platform.test.js
```

It needs a platform with an account. A wrong password is refused, a
capability without a session is refused with 401, the token is not in
the file in the clear, the token is not exported, and signing out
revokes the session at once.

### The worker's tests

```bash
cd intel
python test_worker_safety.py     # 34 tests: option injection, output bounds, traversal, environment
python test_tool_isolation.py    # 12 tests: a tool cannot crash or flood the worker
python test_worker_routes.py     # 15 tests: the real worker, over HTTP (needs it running)
```

### Docker Build (All Platforms)

```dockerfile
# Multi-stage build for web
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
# Build and run
docker build -t osiris-web .
docker run -d -p 3000:3000 --env-file .env osiris-web
```

---

## Release Packaging

```bash
# Create release package
cd releases

# Copy all artifacts
cp ../electron-app/dist/win-unpacked/Osiris.exe electron.exe
cp ../electron-app/dist/Osiris\ Setup\ 1.0.0.exe osiris-electron-1.0.3-x64.nsis.exe
cp ../android-app/app/build/outputs/apk/release/osiris-app-release.apk .
cp RELEASE-NOTES.md .

# Create zip
Compress-Archive electron.exe, osiris-app-release.apk, osiris-electron-1.0.3-x64.nsis.exe, RELEASE-NOTES.md osiris-release-1.0.6.zip

# Verify
unzip -l osiris-release-1.0.6.zip
```

### Expected Release Structure
```
osiris-release-1.0.6.zip
├── electron.exe                    (177 MB)
├── osiris-app-release.apk          (9.88 MB)
├── osiris-electron-1.0.3-x64.nsis.exe (76.9 MB)
└── RELEASE-NOTES.md
```

---

## CI/CD Integration

See [CI_CD_SETUP.md](CI_CD_SETUP.md) for GitHub Actions workflow configuration.

### Required Secrets
- `ANDROID_KEYSTORE_BASE64` - Base64 encoded release keystore
- `ANDROID_KEYSTORE_PASSWORD` - Keystore password
- `ANDROID_KEY_ALIAS` - Key alias
- `ANDROID_KEY_PASSWORD` - Key password
- `CSC_LINK` - Windows code signing certificate (base64)
- `CSC_KEY_PASSWORD` - Certificate password
- `GH_TOKEN` - GitHub token for releases

---

## Verification Checklist

### Web
- [ ] `npm run build` succeeds
- [ ] `npm run typecheck` is clean
- [ ] `npm run lint` finishes with no errors
- [ ] The suite passes with a database configured
- [ ] A platform with an empty database shows the first-run screen
- [ ] The first account can sign in, and sign out
- [ ] A signed-out request to `/api/integrations/findings` is refused (401)

### The native clients
- [ ] `gradlew assembleRelease` succeeds and the APK is signed
- [ ] `npm run dist` succeeds and the installer is built
- [ ] The desktop client signs in, and the platform accepts its session
- [ ] The Android client signs in, and the platform accepts its session
- [ ] A signed-out client is refused by the dispatcher (401)

### Android
- [ ] `gradlew clean assembleRelease` succeeds
- [ ] APK installs on emulator/device
- [ ] Splash screen shows for ~1s
- [ ] WebView loads osiris.app
- [ ] Cyber Tools screen connects to API
- [ ] APK signed and verified

### Electron
- [ ] `npm run dist` succeeds
- [ ] Standalone exe launches
- [ ] NSIS installer works
- [ ] System tray appears
- [ ] Settings window opens
- [ ] Cyber Tools dashboard loads
- [ ] Keyboard shortcuts work

### Cyber API
- [ ] `python osiris_api.py` starts
- [ ] `GET /api/health` returns 200
- [ ] `GET /api/tools` returns 1275+ tools
- [ ] `POST /api/crypto/encrypt` works
- [ ] Tool execution returns results

### Release Package
- [ ] All 4 artifacts present
- [ ] Zip extracts correctly
- [ ] Checksums match