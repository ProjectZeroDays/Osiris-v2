# CI/CD Pipeline Setup Guide

This document describes the GitHub Actions CI/CD pipeline for Osiris and how to configure it.

## Overview

The pipeline (`.github/workflows/ci-cd.yml`) runs on every push to `main`/`develop` and on version tags (`v*`). It includes:

| Job | Platform | Purpose |
|-----|----------|---------|
| `web-build` | Ubuntu | Next.js lint, type-check, test, build, and the desktop client's session test against a real PostgreSQL |
| `android-build` | Windows | Gradle build, sign, verify APK |
| `electron-build` | Windows | Electron build, sign, verify executables |
| `cyber-api-test` | Ubuntu | Flask API server integration tests |
| `release-package` | Windows | Create release zip + GitHub Release (tags only) |
| `docker-build` | Ubuntu | Build & push Docker image to GHCR (tags only) |
| `security-scan` | Ubuntu | Trivy (deps) + TruffleHog (secrets) |
| `notify` | Ubuntu | Completion status |

### The database in CI

The `web-build` job starts a PostgreSQL 17 service and applies the
migrations to it. The reason is the sign-in flow: it only exists when
there is a database, and the tests that cover it are only worth anything
if they run against a real one. A mock would prove nothing about whether
a session is stored as a hash.

The database is the job's own — it is created fresh for every run, and
the service is torn down with the job. The tests clean up after
themselves, so a second run starts from the same place as the first.

The same job then starts the platform against that database, seeds an
account, and runs the desktop client's session test against the running
platform. That is the only test that exercises the whole path: a native
client, a real session, and a dispatcher that refuses a call without one.

---

## Required Secrets

Configure these in **GitHub Repository Settings → Secrets and variables → Actions → Repository secrets**:

### Android Signing
| Secret | Description | How to Generate |
|--------|-------------|-----------------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded release keystore | `base64 -w0 osiris-release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password | Your keystore password |
| `ANDROID_KEY_ALIAS` | Key alias (e.g., `osiris`) | From `keytool -list -keystore osiris-release.keystore` |
| `ANDROID_KEY_PASSWORD` | Key password | Usually same as keystore password |

**Generate keystore:**
```bash
keytool -genkey -v -keystore osiris-release.keystore -alias osiris -keyalg RSA -keysize 2048 -validity 10000
# Enter passwords, then:
base64 -w0 osiris-release.keystore  # Copy output to ANDROID_KEYSTORE_BASE64
```

### Windows Code Signing (Optional)
| Secret | Description |
|--------|-------------|
| `CSC_LINK` | Base64-encoded .p12 certificate |
| `CSC_KEY_PASSWORD` | Certificate password |

**Generate certificate:**
```bash
# Purchase from CA (DigiCert, Sectigo, etc.) or create self-signed for testing
# Export as .p12, then:
base64 -w0 certificate.p12  # Copy to CSC_LINK
```

### Docker/GHCR
| Secret | Description |
|---------|-------------|
| `GH_TOKEN` | Auto-provided by GitHub (no setup needed) |

### Release Automation
| Secret | Description |
|---------|-------------|
| `GH_TOKEN` | Auto-provided for `softprops/action-gh-release` |

---

## Self-Hosted Runner (Recommended for Windows Builds)

The Android and Electron builds require Windows. GitHub-hosted `windows-latest` runners work but have limitations:

- **Time limit**: 6 hours (sufficient)
- **No GPU**: Not needed for these builds
- **Cache**: Gradle/npm caches work

For faster builds, use a **self-hosted Windows runner**:

```powershell
# On your Windows build machine
mkdir C:\actions-runner
cd C:\actions-runner
# Download from GitHub Settings → Actions → Runners → New self-hosted runner
./config.cmd --url https://github.com/YOUR_ORG/osiris --token YOUR_TOKEN
./run.cmd
```

Then update workflow:
```yaml
jobs:
  android-build:
    runs-on: [self-hosted, windows, x64]
  electron-build:
    runs-on: [self-hosted, windows, x64]
```

---

## Local Testing Before Push

Test each job locally before pushing:

### Web
```bash
npm ci
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

The type check has a configuration of its own. `tsconfig.json` is Next's
own, and Next rewrites it: it adds the generated route types to the
include list, and it rewrites them while the dev server runs. A plain
`tsc --noEmit` can therefore read a half-written generated file and
report a syntax error that is not in the code. `tsconfig.check.json`
leaves the generated dev types out, so `npm run typecheck` is correct
whether or not a dev server is running.

The lint step reports warnings and fails only on errors. The React
Compiler's analysis rules are switched off in `eslint.config.mjs`: they
take eight minutes and exhaust the heap on this codebase, and the two
rules worth having — `rules-of-hooks` and `exhaustive-deps` — are kept.
The file says why.

With a database, which is how CI runs it:
```bash
createdb osiris_test
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/osiris_test
export OSIRIS_TEST_DATABASE_URL="$DATABASE_URL"
npx drizzle-kit migrate
npm test -- --run
```

The desktop client's session test needs a running platform:
```bash
npm run build
DATABASE_URL="$DATABASE_URL" npx next start -p 3000 &
OSIRIS_PLATFORM_URL=http://localhost:3000 node --test electron-app/test/platform.test.js
```

### Android
```bash
cd android-app
echo "sdk.dir=C:\Android" > local.properties
cat > gradle.properties << EOF
android.useAndroidX=true
android.enableJetifier=true
org.gradle.jvmargs=-Xmx4096m -Xms4096m -XX:+UseParallelGC
EOF
./gradlew clean assembleRelease
```

### Electron
```bash
cd electron-app
npm ci
npm run dist
```

### Cyber API
```bash
cd intel
pip install -r requirements.txt
python osiris_api.py &
sleep 5
curl http://localhost:8080/api/health
curl http://localhost:8080/api/tools
```

### Security
```bash
# Trivy (install: https://aquasecurity.github.io/trivy/)
trivy fs --severity CRITICAL,HIGH .
trivy fs --severity CRITICAL,HIGH intel

# TruffleHog
trufflehog filesystem . --base=main --head=HEAD
```

---

## Tagging & Release Flow

```bash
# 1. Ensure all tests pass locally
# 2. Update version in package.json, android-app/build.gradle.kts, etc.
# 3. Commit and tag
git tag -a v1.0.7 -m "Release v1.0.7"
git push origin v1.0.7

# 4. Watch GitHub Actions → CI/CD Pipeline
# 5. On success: GitHub Release created automatically with artifacts
# 6. Docker image pushed to ghcr.io/your-org/osiris:v1.0.7
```

---

## Troubleshooting

### Android Build Fails
| Error | Solution |
|-------|----------|
| `SDK location not found` | Ensure `local.properties` has `sdk.dir` or `ANDROID_SDK_ROOT` set |
| `Gradle daemon died` | Increase memory: `org.gradle.jvmargs=-Xmx4096m` |
| `AAPT: resource not found` | Check `res/` for missing drawables/mipmaps; use vector XML |
| `Kotlin: Experimental API` | Add `-opt-in=androidx.compose.material3.ExperimentalMaterial3Api` to `freeCompilerArgs` |
| `Duplicate resource` | Remove duplicates in `res/drawable/`, `res/mipmap/`, `res/values/` |

### Electron Build Fails
| Error | Solution |
|-------|----------|
| `electron-builder` not found | Run `npm ci` in `electron-app/` |
| `Code signing failed` | Ensure `CSC_LINK` and `CSC_KEY_PASSWORD` are set; or remove `win.certificateFile` from `package.json` |
| `NSIS installer too large` | Normal (>70 MB); exclude unnecessary files in `build.files` |

### Cyber API Tests Fail
| Error | Solution |
|-------|----------|
| `Connection refused` | Server not started; check `python osiris_api.py &` and `sleep 5` |
| `Module not found` | Run `pip install -r intel/requirements.txt` |
| `Quantum module` | Ensure `C:\Projects\Cyber-Security\quantum\core` symlink/copy exists |

### Security Scan Fails
| Error | Solution |
|-------|----------|
| `Trivy: CRITICAL vuln` | Update vulnerable dependency: `npm audit fix` or `pip install --upgrade` |
| `TruffleHog: secret found` | Remove secret from history; rotate if real; add to `.trufflehogignore` if false positive |

---

## Workflow Customization

### Skip Jobs
Add `[skip ci]` to commit message or use `if:` conditions:

```yaml
jobs:
  android-build:
    if: github.repository == 'your-org/osiris'  # Skip on forks
```

### Matrix Builds
Test multiple configurations:

```yaml
android-build:
  strategy:
    matrix:
      api-level: [26, 28, 30, 34]
    runs-on: windows-latest
```

### Conditional Release
Only create release on specific tag pattern:

```yaml
release-package:
  if: startsWith(github.ref, 'refs/tags/v') && github.repository == 'your-org/osiris'
```

---

## Monitoring & Notifications

Add Slack/Discord webhook to `notify` job:

```yaml
- name: Send Discord Notification
  if: always()
  uses: sarisia/actions-status-discord@v1
  with:
    webhook: ${{ secrets.DISCORD_WEBHOOK }}
    title: "Osiris CI/CD ${{ job.status }}"
    description: "Workflow ${{ github.workflow }} ${{ job.status }}"
```

---

## Performance Tips

1. **Cache aggressively**: Gradle, npm, pip caches save 2-5 minutes per run
2. **Parallel jobs**: Web, Android, Electron, Cyber API run concurrently
3. **Self-hosted runners**: 3-5x faster for Windows builds
4. **Docker layer caching**: GHCR cache speeds up Docker builds
5. **Skip on forks**: Prevents wasted runs on external PRs

---

## Support

For CI/CD issues:
1. Check workflow logs in GitHub Actions tab
2. Review this guide for common fixes
3. Open issue with workflow run URL and error details