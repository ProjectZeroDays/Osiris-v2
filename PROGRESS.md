# Task Progress - Osiris Complete Plan (v4-v15)

| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 1 | Set up gradle build environment | done | Android SDK at C:\Android; Gradle 8.5 at C:\Android\gradle-8.5 |
| 2 | Create APK using gradle build | done | osiris-app-release.apk, 10.31 MB |
| 3 | Fix app icon/splashscreen | done | Vector icon (osiris_icon.xml), splash_screen.xml, SplashScreenActivity |
| 4 | Create release package with APK | done | osiris-release-1.0.19.zip (157 MB) |
| 5 | /goal docs | done | GOAL.md updated |
| 6 | /push release artifacts | done | Release package at releases/ |
| 7 | APK as standalone asset | done | APK copied to releases/osiris-app-release.apk |
| 8 | Android app enhancements | done | WebView, 4-screen nav, Material 3 |
| 9 | Desktop app enhancements | done | Settings, tray, menus, shortcuts |
| 10 | Test/debug APK on emulator | done | Installs & launches successfully |
| 11 | Code signing Windows | parked | Requires certificate purchase (external dependency) |
| 12 | Integrate Cyber-Security tools | done | API + both native apps (1275 tools) |
| 13 | CI/CD pipeline setup | done | GitHub Actions workflow, 8 jobs, 12 steps in the worker job |
| 14 | Documentation updates | done | README, BUILD, CI_CD_SETUP, RELEASE-NOTES |
| 15 | Cyber-Security API server | done | Now a worker behind the platform |
| 16 | Electron Cyber dashboard | done | Risk-class tabs, capability picker, asset/consent gates |
| 17 | Android Cyber Tools screen | done | Reads the platform's registry, runs capabilities; holds its own session, encrypted at rest |
| 18 | Map dynamic chunk in local prod build | parked | Pre-existing: reproduces with security-tool changes reverted; deployed build renders the globe. Map verified working in `next dev` (canvas, tiles, camera markers, screenshot). |

## Phase 1: Core Integration Blueprint (v4) - 11 Security Tools
| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 19 | Security tools manifest | done | 11 tools; the registry now holds 25 |
| 20 | Custom icons for ProjectZeroDays repos | done | 20 custom icons; 24x24, currentColor, license-safe |
| 21 | Capability allowlist (deny-by-default) | done | unknown cap -> DENIED; no generic runner anywhere |
| 22 | Server-derived integration state | done | /api/integrations/state |
| 23 | Authz + audit + retention | done | 4 modules |
| 24 | Adapters | done | One typed adapter per tool |
| 25 | Single gated API dispatcher | done | POST /api/integrations/[tool]/[action] |
| 26 | Main-page grid + cards | done | /tools/security + SECURITY button (desktop rail + mobile drawer) |
| 27 | Per-tool detail pages | done | /tools/security/[tool]; unknown -> 404 |

## Phase 2: Shared Platform Foundation (v9)
| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 28 | Migrations and DB client | done | 11 tables, drizzle.config.ts, graceful degradation |
| 29 | Real auth and asset registry | done | session/assets/consent servers |
| 30 | Device auth for sensors | done | SHA-256, constant-time compare, tool allowlist |
| 31 | Schemas at every boundary | done | 15+ Zod schemas |
| 32 | Typed GET/POST dispatch | done | Strict body; unknown keys rejected |
| 33 | Persistence/dedup/retention | done | Durable findings + audit, pruning route |
| 34 | Health/rate limiting/quotas | done | /api/integrations/health, quota module |
| 35 | First-run experience | done | AuthGate asks the platform whether it needs setup, a sign-in, or neither; /api/auth/setup creates the first tenant and administrator and signs it in, and closes for good behind the first account |
| 36 | Docker/security headers | done | db profile, tightened CSP, Referrer-Policy, Permissions-Policy |
| 37 | Map refresh behavior | done | Findings polled through an explicit route |
| 38 | Icon verification | done | 20 custom icons; 24x24, currentColor, aria-hidden handled by parent |

## Phase 3: Universal Tool UI & Beacons (v11-v12)
| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 39 | Window registry | done | All 25 tools have a window; tabs match the plan's inventory |
| 40 | Reusable window primitives | done | 10 shared components |
| 41 | Beacon kinds registry | done | 22 kinds, attribution tiers, drawn sprites |
| 42 | Shared popup/detail panel | done | popup-schemas.ts + BeaconPopupCard |
| 43 | Selection round-trip | done | beacon click -> card; window <-> card share the schema |
| 44 | Overlay/app switcher | done | window-manager.ts (14 tests: open/focus/close/cycle/cap) + overlay UI with switcher dock, Ctrl+` cycling, cascade offsets |

## Phase 4: Network & Sensor Extensions (v5-v8, v10)
| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 45 | Wireless/Wifite3 integration | done | wifite3; `active-transmit` risk class; the only tool that transmits |
| 46 | Drone RID & surveillance | done | device-authenticated push at /api/integrations/ingest; 401 without a device |
| 47 | Flock/ALPR mapping | done | flock-detector, haveibeenflocked, plate-ocr, camera-feed |
| 48 | Out-of-scope closure | done | One bounded execFile exception; 11 boundary tests keep it the only one |
| 49 | nrsuite / strykerapp | done | Raw pcap never imported; Stryker JSON only |
| 50 | Quantum-CLI Depth A | done | Report-import only, no live connection |

## Phase 5: Public & Civic Data (v13, v15)
| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 51 | Scanner feeds integration | done | Broadcastify + OpenMHz; CAP feed live against NWS |
| 52 | CAP/Emergency alerts | done | CAP 1.2 parser for GeoJSON and XML; Amber/Silver/Blue by event |
| 53 | Cell-tower/anomaly sources | done | Tower database + heuristics; anomalies recorded as "inferred" |
| 54 | Police incident feeds | done | Socrata + ArcGIS with host allowlists; a non-allowlisted portal is refused |
| 55 | Emergency broadcasts | done | AMBER/SILVER/BLUE beacon families, each with its own card |
| 56 | Stream proxy | done | /api/scanner/stream/[feedId]; a non-allowlisted host is refused with 403 |

## Phase 6: AI Providers (v9, v13)
| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 57 | Local AI (GGUF/MLX/Ollama) | done | Provider registry; a "local" provider off the loopback is refused |
| 58 | Remote OpenRouter path | done | Server-held key, never in the provider listing; model id validated |
| 59 | Model download manager | done | Allowlisted hosts, traversal-proof filenames, atomic move |
| 60 | Chat proxy | done | /api/ai/chat; unconfigured provider -> 503, bad model id -> 400 |

## Phase 7: One platform, three clients
| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 61 | Registry endpoint for other clients | done | GET /api/integrations/tools returns 25 tools with capabilities, risk class and tabs |
| 62 | Desktop app reads the platform | done | Electron app rewritten: risk-class tabs, capability picker, asset and consent gates |
| 63 | Android app reads the platform | done | CyberToolsScreen.kt rewritten against the same dispatcher; scoped network security config |
| 64 | Registry contract test | done | The registry's shape is a contract with two other clients, so it is tested |
| 65 | Compose dependency versions | done | ui-text/foundation/foundation-layout take their version from the BOM |

## Phase 8: The tool collection is a worker, not a surface
| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 66 | Worker authentication | done | Shared secret, constant-time compare; no key -> 503, wrong key -> 401 |
| 67 | Worker answers only the platform | done | Only the health check is open; everything else needs the secret |
| 68 | Worker binds locally | done | Loopback by default; the compose service name is the one exception |
| 69 | Platform adapter for the collection | done | Three allowlisted capabilities; the tool is checked against the worker's catalogue |
| 70 | Worker boundary tests | done | 2 tests drive the real worker: absent, wrong and right secret |
| 71 | CI covers the worker | done | The cyber-api job starts it with a key and tests the boundary |
| 72 | Build no longer traces build outputs | done | The standalone build dropped from 1.3 GB to 44 MB |

## Phase 9: The worker's interior is reviewed
| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 73 | Option-injection defence | done | Every request value is checked before it can become an option rather than an argument |
| 74 | Bounded output | done | The output is read as it arrives; a program that prints without end is stopped at the cap |
| 75 | Path-traversal defence | done | An upload lands under a name the worker generated, not one the client chose |
| 76 | The library path was unguarded | done | Found and fixed: python-nmap took the target unchecked, so the check now runs before either path |
| 77 | Every subprocess goes through the bounded runner | done | No direct subprocess call remains in the worker |
| 78 | Safety module tests | done | 29 tests: arguments, ports, targets, URLs, names, output, timeout |
| 79 | Route tests from the outside | done | 15 tests driving the real worker: every injection attempt refused with 400 |
| 80 | CI covers the interior | done | Both Python test files run in the cyber-api job |

## Phase 10: The worker's tools are isolated
| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 81 | Tools run in a subprocess | done | The worker never imports a tool module into its own process |
| 82 | The runner shim | done | tool_runner.py imports the tool, calls it, and writes the answer as JSON |
| 83 | A named entry point | done | A tool whose entry is not main/run/execute can be named explicitly |
| 84 | A result that is not JSON | done | Summarised rather than lost, and the caller is told it is a summary |
| 85 | The direct module routes were fixed too | done | shodan and dorks now go through the runner; they were also broken, since the tools expose shodan_search and build_search_url, not search |
| 86 | Isolation tests | done | 9 tests with tools that crash, exit, print without end, shell out, and return something unserialisable |
| 87 | CI covers the isolation | done | The isolation test file runs in the cyber-api job |

## Phase 11: A tool never sees the platform's secret
| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 88 | Scrubbed environment | done | A tool or program's environment is built from an allowlist, not inherited |
| 89 | The secret is never handed on | done | The worker's key, the database URL, the Postgres password and the signing certificate are on a never-inherit list |
| 90 | The tools' own keys are kept | done | The API keys the collection's tools were written to use — Shodan, OpenRouter, OpenCellID, Broadcastify — are still there |
| 91 | Environment tests | done | 5 new tests, one running a real program and confirming the secret is absent while the path is still there |

## Phase 12: A tool's result says where it came from
| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 97 | Provenance in every result | done | The tool, its path, the SHA-256 of its source, the entry point, the time and the duration |
| 98 | The hash makes a result traceable | done | A finding recorded against a hash belongs to that code; a changed tool is visibly a different thing |
| 99 | A tool's finding is inferred, not observed | done | status inferred, attribution tool-asserted, verified false |
| 100 | The card shows the difference | done | The security-finding card shows the tool, the attribution, whether it was verified, and the hash |
| 101 | The worker could not import the shared package | done | Found and fixed: the tools root is now passed to the runner explicitly |
| 102 | Provenance tests | done | 6 tests: the provenance is present, and the hash follows the source |
| 103 | End-to-end verification | done | Platform -> dispatcher -> worker -> tool -> provenance, with 2 findings marked inferred |

## Phase 13: A tool's findings are kept, not just returned
| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 109 | Findings are persisted | done | Every finding a tool produces is written to the `findings` table, tenant-scoped |
| 110 | The provenance goes in the row | done | The tool's source hash is the evidence hash; the attribution is in the properties |
| 111 | The retention deadline is applied | done | The tool's policy sets `retention_until` on the row |
| 112 | The write is an upsert | done | The same finding recorded twice is one row: 2 runs, 2 rows |
| 113 | The retention job prunes | done | 2 expired findings deleted; a second run deletes 0 |
| 114 | Without a database it says so | done | The finding is still returned; the platform reports that it kept nothing |
| 115 | The findings are readable back | done | `/api/integrations/findings` returns them with their provenance; `?geospatial=0` asks for all of them |
| 116 | A real database, verified | done | PostgreSQL 17: migrations applied, a tenant seeded, a tool run, 2 rows written, read back, pruned |
| 117 | The migration is committed | done | drizzle/0000_*.sql, and a seed file for a local check |
| 118 | Persistence tests | done | 9 tests: the retention deadline, and the with- and without-a-database paths |

## Phase 14: Verification & Operations (v14)
| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 119 | API verification notes | done | api-catalog.test.ts enforces the catalog against the filesystem: 96 routes checked both ways, 24 undocumented routes found and documented, a false `/api/gdelt` summary corrected |
| 120 | README + professional wiki | done | docs/TROUBLESHOOTING.md (11 real failure modes, each reproduced on this checkout) + a Documentation index in the README linking all seven documents |
| 121 | Test matrix | done | Lint, tests, build, container checks run in CI |
| 122 | Deployment guidance | done | BUILD.md, CI_CD_SETUP.md, DOCKER.md |
| 123 | Gap analysis closure | done | docs/GAP-ANALYSIS.md audits every v4-v12 security claim against the code; 6 gaps found, all closed (see Phase 18) |

## Phase 15: The platform can be entered (v4 remainder)
A deployment with a database demands a session, and there was nothing that
issued one. The only way in was to know a user's id and put it in a cookie.

| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 124 | A real session model | done | A random token in an HttpOnly cookie; the server stores only its SHA-256, so the `sessions` table holds no token and a stolen token stops working the moment the row is deleted |
| 125 | Passwords are hashed | done | scrypt with a per-password salt; the parameters are in the hash, so the work factor can be raised later without invalidating what exists |
| 126 | Sign in and sign out | done | /api/auth/signin and /api/auth/signout; a wrong password and an unknown account are refused identically, so neither says which addresses have accounts |
| 127 | The first-run route | done | /api/auth/setup creates the first tenant and administrator and signs it in; the check and the insert are in one transaction, and the route is closed behind the first account for good |
| 128 | The gate | done | AuthGate asks the platform whether it needs setup, a sign-in, or neither; a deployment with no database runs single-tenant and is let through, and the map is not mounted for a visitor who is not signed in |
| 129 | A refusal is not a fallback | done | Found and fixed: an unauthenticated caller was marked `ephemeral`, so the gate mistook a refusal for the single-tenant fallback and let everyone through |
| 130 | The tests are against a real database | done | 10 tests on the real routes: the session is stored as a hash, the first-run route closes, a wrong password and an unknown account look the same, a disabled account cannot sign in, and signing out revokes at once |
| 131 | CI has a database | done | The web-build job starts PostgreSQL 17, applies the migrations, and runs the whole suite against it; the database-backed tests skip themselves when there is none |
| 132 | A password can be set locally | done | `npm run user:password`; the hash is made the way the platform makes it, because a plain SQL update cannot make one |
| 133 | The suite no longer rots | done | Two failures that were blamed on the network were test-isolation defects: a fixture dated in the past fell out of a 72-hour window, and a region left in a 5-minute backoff by an earlier case silenced a later one. Both fixed; the suite is green. |
| 134 | The worker's start-up budget | done | The health check waited 60s while the test allowed 120s, so a slow start under load read as a failure of the boundary. The budget now matches. |

## Phase 16: The clients can act, not only look
The registry is open, so both native apps could read the tool list. The
dispatcher is not open, so neither could run anything. They needed a
session of their own.

| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 135 | The desktop app holds a session | done | platform.js signs in, keeps the cookie and presents it on every call; the settings window and the Cyber Tools panel both sign in and out |
| 136 | The desktop app's token stays out of the renderer | done | The token is held in the main process and there is no getter that returns it; the renderer asks the main process to act |
| 137 | The desktop app's token is encrypted at rest | done | Electron's `safeStorage`, which uses the operating system's credential store; the file holds the encrypted form, never the token |
| 138 | The Android app holds a session | done | PlatformSession.kt signs in, keeps the cookie and presents it; the Cyber Tools screen has a sign-in card that appears only when the platform asks for one |
| 139 | The Android app's token is encrypted at rest | done | `EncryptedSharedPreferences`, whose key lives in the Android keystore; where the keystore is unavailable the app says so and keeps the token in plain preferences rather than pretending otherwise |
| 140 | The clients are tested against a running platform | done | 10 tests: a wrong password is refused, a capability without a session is refused with 401, the token is not in the file in the clear, the token is not exported, and signing out revokes the session at once |
| 141 | CI runs the client test | done | The web-build job starts the platform against its database, seeds an account, and runs the client test |
| 142 | The platform says which case it is | done | A platform with no database runs single-tenant and needs no session; one with accounts needs one. Both clients ask, rather than showing a form that cannot work. |
| 151 | Asking for the findings found nothing | done | Found and fixed: with no `tool` in the query the route matched only findings whose `tool_id` was null or empty, so a caller asking for "the findings" got an empty list and would have believed the tools had found nothing. Four tests cover it. |

## Phase 17: The linter finishes
The lint step in CI had never been able to run to completion here. It
exhausted the heap after eight minutes, and the failure had been
mistaken for the code being too large.

| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 152 | The linter was not slow, it was the compiler's rules | done | `eslint-plugin-react-hooks` v7's `recommended` set includes the React Compiler's static analysis, and analysing a large component with it is enormous: `src/components` took 472s and then exhausted the heap. Without those rules it takes 26s. The classic pair — `rules-of-hooks` and `exhaustive-deps` — is kept. |
| 153 | The type program was the whole repository | done | The tsconfig included `**/*.ts`, so it held the desktop app's 995 dependency type files. Narrowed to the web platform and its own configuration files. `tsc --noEmit` went from minutes to 23 seconds. |
| 154 | Vendored code was being linted | done | 1059 of the warnings came from a vendored MapLibre bundle. Third-party code is not the project's to answer for. |
| 155 | The errors that were real | done | Three `prefer-const` and two `require`s, each fixed with the reason kept next to it |
| 156 | `any` is visible without breaking the build | done | 394 uses of `any`, all deliberate at the boundaries a tool's report and an upstream's answer arrive at. The rule stays on, as a warning. |
| 157 | The lint step passes | done | 0 errors, 543 warnings, in 96 seconds |
| 158 | The `.gitignore` was corrupted | done | A UTF-16 append had mangled the last few entries, so `node_modules/`, `dist/` and `*.apk` were not being ignored |


## Phase 18: Gap analysis closure (v4-v8 / v12)

| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 159 | Gap analysis closure | done | docs/GAP-ANALYSIS.md audits every v4-v12 security claim against the code; 6 gaps found, all closed |

### Gaps found by the audit
| # | Gap | Status | Verified by |
|---|-----|--------|-------------|
| G1 | 24 of 96 API routes undocumented; `/api/gdelt` summary was factually wrong | done | `api-catalog.test.ts` compares catalog to filesystem both ways |
| G2 | The single-tenant (no-database) auth path had no test | done | `auth-single-tenant.test.ts`, 6 tests on the real routes |
| G3 | The overlay had no window manager — opening a second tool replaced the first | done | `window-manager.ts`, 14 tests; production build compiles |
| G4 | No troubleshooting record; one failure mis-attributed to the network | done | `docs/TROUBLESHOOTING.md`, 11 entries reproduced on this checkout |
| G5 | `/api/network/portscan` ran nmap unbounded: `nm.scan()` had no timeout and python-nmap's default of 0 means "wait indefinitely" | done | `timeout=SCAN_TIMEOUT_SECONDS` on both paths; 3 new tests in `test_worker_safety.py`; 64 Python tests pass |
| G6 | Two tests failed only under full-suite parallel load | done | Fixed by #133: the OI fixture was dated and fell out of its window, and a CCTV region left in backoff by an earlier case silenced a later one. Both cleared per-run; full suite 1402/1402 green |

## Phase 19: The registry can be closed

| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 143 | An opt-in gate on the tool registry | done | `/api/integrations/tools` answers unauthenticated by default (the two native clients read it and neither could authenticate before it existed). Setting `OSIRIS_REGISTRY_REQUIRE_AUTH` closes it behind the same session the dispatcher demands; a database deployment refuses a sessionless caller with 401 `REGISTRY_UNAUTHENTICATED` and no tool listing, and lets a resolved session through. A bare deployment has no sign-in, so its single-tenant operator is still let through — closing it there would refuse the only operator there is. 9 tests in `registry-route.test.ts` drive the real route and real `getAuthContext`; documented in DOCKER.md |
| 144 | Both clients still work against a closed registry | done | Audited rather than assumed: Android sends `PlatformSession.headers()` on the registry call and Electron merges its session into every `request()`, so signing in reopens the registry on both. Two comments that asserted the registry "is open" were now-false and were corrected (electron-app/platform.js, CyberToolsScreen.kt); the API catalog entry gained the 401. `node --check` on platform.js, `:app:compileDebugKotlin` exit 0, catalog contract test 6/6 |
| 145 | The database-backed path can be run on any machine | done | The gap was that a local checkout could only ever prove the single-tenant path. A throwaway Postgres 17 cluster needs no server to borrow and no password: `initdb -A trust` on port 5433, started detached (a child of the shell dies with it). Migrations apply, the auth suite is 16/16, and the full suite goes from 1411 passed / 33 skipped to 1426 passed / 22 skipped — CI parity, reproduced locally. Recipe written into BUILD.md |
| 146 | A held session opens a closed registry | done | Executed rather than audited: a platform built and started against the live PostgreSQL with `OSIRIS_REGISTRY_REQUIRE_AUTH=1` refuses an anonymous registry call with 401 `REGISTRY_UNAUTHENTICATED`, and the desktop client — which presents its session on every call — signs in and reads all 25 tools from that same server. 11/11 in `electron-app/test/platform.test.js`, the leg CI runs, now run locally. The old "the registry is readable" test asserted readability without a session, which only holds on an ungated platform; it is now "the registry answers and names every tool", which holds either way |
| 147 | CI proves the gate, rather than trusting the local run | done | The `web-build` job now starts the platform with `OSIRIS_REGISTRY_REQUIRE_AUTH=1` before the client test, so the registry is closed on every push and the session is what reopens it. Workflow YAML parses with the flag on the right step; the three tool ids the client test asserts are in `security-tools.ts` |
| 148 | The gate is proven from both sides | done | #147 proved the registry opens for a session. It did not prove the other half: that a caller with no session is refused, which is the direction the gate exists for. `electron-app/test/registry-gate.test.js` drives the client against a closed platform and asserts 401 before signing in, the whole manifest after, and 401 again after signing out. 3/3 against a live gated platform; both client files run against the one gated instance in CI, so no second platform is started |
| 149 | The type check was racing the dev server | done | Next rewrites the generated route types while `next dev` runs, so a plain `tsc --noEmit` could read a half-written file and report a syntax error that was not in the code. `tsconfig.check.json` leaves the generated dev types out, and `npm run typecheck` uses it. Clean with a dev server running. |

## Phase 20: The sources' terms, and the wiki
The plan's v14 asks for a professional wiki, and calls licensing an
implementation gate rather than polish. The repository had neither: no
record of what any source's terms are, and no guide for adding a tool.

| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 160 | The licences are recorded where the data is read | done | `src/lib/integrations/licenses.ts` is the single registry. The adapters that reach an upstream write the source, the licence, the credit and whether the licence is share-alike into the finding itself, so a record that is asked about later can answer without going back to the adapter. The CAP adapter now reads its terms from the registry rather than repeating them |
| 161 | A credit is not a confidence tier | done | Found and fixed: `attribution` already meant the platform's own tier — how far its judgement can be trusted — and the source's credit wanted the same name. The source's credit is `sourceAttribution`; the tier is still `attribution`. TypeScript found both collisions |
| 162 | The licence reference | done | `docs/LICENSES.md`: every source the code reaches, its licence, what it obliges, where the terms are stated, and the plan's share-alike warning — what it means here, that the findings table is a derived database once a share-alike finding is written into it, and that exporting those findings is the case needing a decision |
| 163 | The document and the code are held together | done | 12 tests: a source in the registry without a row in the document, or a row without an entry, fails the build. The document's licences are checked against the registry's, and the share-alike sources are checked to be marked as such in both |
| 164 | The emergency broadcasts never reached the map | done | Found and fixed: the CAP adapter returned alerts as data and produced no findings, so nothing was persisted, nothing was drawn, and the Amber, Silver and Blue beacon families and their cards — which existed — were never reached by anything. The adapter now produces findings, the beacon kind is the alert's family, and the card shows the source and its licence. 5 tests, including that every kind it produces has a registered beacon and a popup card |
| 165 | The guide for adding a tool | done | `docs/ADDING-A-TOOL.md`: the manifest entry, the icon, the allowlist, the adapter, the dispatcher, the window, the beacon and the card, the tests, and the checklist — plus what is not negotiable. 9 tests hold it to the code: every path it names has to exist, and every part of the platform it says a tool needs has to be named |
| 166 | The roadmap | done | `docs/ROADMAP.md`: what is built today, what is next, and a list of what was considered and rejected — a generic runner, running the collection in-process, promoting a tool's word to a fact, storing the operator's raw media, and anonymising away the provenance |

## Phase 21: The clients are tested, and the surface is visible
The desktop client had 14 tests against a running platform. The Android
client had none — the gap was asymmetric by accident rather than by
choice — and the registry gate was invisible from outside.

| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 167 | The Android client has its own tests | done | 22 tests on the JVM, no device and no emulator. The registry's shape: 7 tests, every field the screen renders, in the platform's order, with a missing optional field becoming the platform's own default. The session on the wire: 15 tests, against a fixture that replaces the transport and nothing else. Re-verified on a forced run (`--rerun-tasks`, 2m13s) after the storage fake was corrected: 22 pass, 0 fail, 0 skipped |
| 168 | The session is on the request, and that is proved | done | The gap the shape test admits it cannot cover. A held session is presented on the registry call and on the session call; a request with no session carries no cookie; a sign-in that issues no cookie is not a session; the password is sent once and never presented again |
| 169 | The storage half is separated from the network half | done | `signIn` and `checkPlatform` need no `Context`; `remember` and `forget` are the ones that touch the storage. The session's lifetime and its persistence are different things, and only one of them needs a device |
| 170 | The keystore fallback caught the wrong thing | done | Found and fixed: `MasterKeys` initialises its provider in a static initialiser, so a device without a usable keystore throws an `ExceptionInInitializerError` — an `Error` — and the fallback's `catch (Exception)` let it past. The catch is on `Throwable`, because the fallback exists for exactly that case |
| 171 | The registry's surface is visible from outside | done | `/api/health` now says what a client will meet: whether the registry is open or closed, whether the platform has accounts to sign in as, and the path. A client that gets a 401 from the registry is a client that is misconfigured, and an operator could not tell that from one that is simply not signed in |
| 172 | The gate is decided in one place | done | `registry-gate.ts` holds the decision, and both the route that enforces it and the health check that reports it read it. Two readers of one flag can disagree, and a health check that lies about the surface is worse than one that says nothing. 8 tests |
| 173 | The flag is not obeyed where it cannot be | done | A bare deployment has no account to sign in as, so closing its registry would refuse the only operator there is, with no way back in. The surface says the registry is open there, whatever the flag says. Verified live: a database deployment with the flag answers 401 to the registry and says so in the health check; a bare deployment with the same flag answers 200 |
| 174 | The client's tests run in CI | done | The `android-build` job runs `testDebugUnitTest` before it builds the APK. As written it could not have run at all — no wrapper in the repo — which was found and fixed in 182 |
| 175 | The health check's own description was wrong | done | The API catalog said `status` was the literal `operational` and listed fields the route does not return. It returns `serving`, and the catalog now says so, with the new `surface` field |

## Phase 22: The platform can say whether it can serve
The plan lists "health/readiness" as an implementation gate. Liveness
existed; readiness did not.

| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 176 | Readiness is not liveness | done | `/api/health` says the process is up and checks nothing else, on purpose. `/api/ready` says whether the instance can take traffic, and answers 503 while it cannot, so a load balancer reads the status rather than parsing a body. A platform whose database is unreachable, or whose migrations were never applied, or that has no account anybody can sign in as, is up and useless — and a balancer that only knows liveness sends it traffic anyway |
| 177 | The three checks | done | The database is reachable and has the eight tables the platform needs — a migration that was never applied is a table that is not there. There is at least one account that is not disabled: a platform with a database and no accounts demands a session and has nobody to make one for. The tool-collection worker answers, if one is configured; it is not required, so a platform without one is ready |
| 178 | Every check runs, and the answer is readable | done | An operator who has three things wrong is told all three, not one at a time. The blockers are named, and the reason a check failed is the reason — not the query behind it. A readiness answer is read by a load balancer and pasted into a dashboard, and the query is noise there |
| 179 | The probe is wired into the deployment | done | The compose file's health check asks `/api/ready`, not `/api/health`. The `start_period` covers the first start of a deployment with a database, which is expected to be unhealthy until somebody opens the first-run screen and creates the first administrator |
| 180 | The probe says nothing about a tenant | done | Both routes answer without a session, because a probe cannot sign in and a check a probe cannot reach is a check that never fires. Neither says anything learned from a third party, and neither is about a tenant |
| 181 | The integrations health route served upstream error text to anyone | done | Found and fixed: `/api/integrations/health` answered without a session — correctly, a probe cannot sign in — and served each source's `lastError`, which is whatever an upstream HTTP client put in `err.message`: a status line, an address, a fragment of a response. The dispatcher serves a stripped form of the same string, but only to a caller it has already authenticated. The route now reports health, failure counts and timings, and nothing learned from a third party; the full reason stays in the audit trail against the tenant and actor that hit it. 4 route-level tests, and one of them fails against the old route with `ECONNREFUSED` visible in the failure. The API catalog says what is withheld. `TROUBLESHOOTING.md`'s worker section now points at `/api/ready` and the audit trail — it had pointed at this endpoint, which never reported the worker and can no longer say why a call failed |
| 182 | The Android job could not have run | done | Found and fixed: `android-build` invoked `./gradlew` and the repo has no wrapper — no `gradlew`, no `gradlew.bat`, no `gradle/wrapper/` — so it would have failed on its first step, tests and all. Its `gradle.properties` step also wrote the file with a bash heredoc under `shell: pwsh`, which is not a valid script. The wrapper is now generated and committed (Gradle 8.5, matching `GRADLE_VERSION`), the three steps call `.\gradlew.bat`, and the redundant properties step is gone — the file is committed with those settings. Verified by running the job's own tasks under the wrapper: `assembleDebug`, `testDebugUnitTest` and `assembleRelease` all succeed, and the cache key's `hashFiles('**/gradle-wrapper.properties')` now matches a real file. `.gitignore` gains the Android section: Gradle state, build outputs, `local.properties` and heap dumps are out, the wrapper is in |

## Phase 23: What the calls cost
The plan lists "quotas, cost tracking, secret storage" together. Quotas
counted calls; nothing recorded what those calls cost.

| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 181 | Every capability declares a cost | done | `costs.server.ts` gives every capability in the allowlist a cost, in the unit the provider charges in. A capability with no entry is a build failure rather than a silent zero: a new capability that reaches a metered service has to be given a cost, and one that does not has to be given zero on purpose. Nine tests, and the cost table is checked against the allowlist in both directions |
| 182 | The unit is the provider's, not money | done | A Shodan query is a `shodan-query`, a Flock lookup an `hibf-lookup`, a request to a paid model provider an `ai-request`. The platform knows how many have been spent; what one is worth is between the operator and their bill. The unit says whose account is being spent |
| 183 | The cost is charged with the quota | done | The same row, because a limit and a bill are the same thing. A metered service charges for the request whether or not the answer was useful, so the cost is charged when the call is dispatched — but not before the asset and consent gates, because a call that never left the platform cost nothing |
| 184 | The AI chat counts tokens, not requests | done | The stated reason for counting requests — "counting them would mean buffering a stream the operator asked to be streamed" — does not survive the provider's documentation. OpenRouter includes the usage for the whole request in the last message of a streamed reply, automatically; the `stream_options.include_usage` parameter that would ask for it is deprecated and has no effect. So the reply is counted *on its way through*, by a `TransformStream` that parses one frame and forwards every byte: nothing is buffered and nothing waits. What is recorded is what the provider reported, not an estimate computed from text the platform guesses a tokenizer for. The unit is `ai-token` on every path, because a day's counter row carries one `costUnit` and `consumeQuota` overwrites it on every write, so a unit that varied would leave the row reporting a total in whichever unit came last. A call whose reply ended without a usage frame is recorded as zero tokens in that same unit — which means two different things, a free local model or a dropped metered reply, and the platform does not pretend to know which |
| 185 | The spending is readable | done | `GET /api/integrations/costs` reports the day's cost per tool, and lists the capabilities that cost anything. A tool that was used and cost nothing is reported too: that is a different fact from a tool that was not used. It answers with a session, because a cost is a tenant's business |
| 186 | Verified live | done | A Shodan call was charged one `shodan-query`; the report said `1 shodan-query spent today`, and the free tools appeared with their call counts and zero cost |

## Phase 24: A sensor's push, and the devices it sees
The plan's risk list names "device identity, secret rotation, rate limits
and bounded ingestion" for sensor push. Rotation and the ingestion
itself were the gaps.

| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 187 | The push path was broken | done | Found and fixed: the route validated the array inside the body against a schema shaped as an object holding that array, so every Remote ID and Flock push was refused as invalid — the one path a sensor has. The whole body is validated now, which is what the schema is shaped for. Nothing tested the route, which is why it stayed broken; 10 tests drive it end to end now |
| 188 | A push's findings were never kept | done | The route produced findings and dropped them. It writes to the same store the dispatcher does now, so a drone seen by a rooftop box reaches the map as a beacon and belongs to a tenant, rather than existing only in the response |
| 189 | A device's secrets can be rotated | done | `POST /api/integrations/devices` creates a device and `PUT` rotates it. The new secret takes effect at once; the previous one keeps working for a 24-hour grace window, so a sensor is not silenced while it is being told. A secret is shown once, because the platform keeps only its hash and cannot show it again. Twelve tests |
| 190 | Rotation is an administrative act | done | Creating and rotating a device are on an admin-only route, and the tenant is the caller's own, taken from the session and never from the request. A device of another tenant cannot be rotated |
| 191 | A device is a thing, not a sighting | done | The `drones` and `surveillance_devices` tables existed and were never written to. A finding is a moment — this camera, at this place, now. The entity row is the camera: one row however many times it is seen, with the observation count and the first and last sighting. A sighting is never made to be more certain by repetition |
| 192 | The plan's operational list is complete | done | Migrations, health and readiness, quotas, cost tracking, secret storage, security headers, first-run UX and licensing all have an answer now, and each one is tested |
| 193 | The entities are readable | done | `GET /api/integrations/entities` reads the drones and the surveillance devices back. A camera seen four hundred times is one camera seen four hundred times, and a card that says so is a different card from one that says "seen once". The tenant is the caller's own — these are the positions of real cameras and real people |

## Phase 25: The queue, run end to end
A `/swarm /goal /push` run: the goal document brought up to date, the
last named gaps closed, and the work pushed.

| # | Task | Status | Verified by |
|---|------|--------|-------------|
| 194 | The push would have carried 314 MB of binaries | done | `releases/*.zip`, `*.exe` and `*.apk` are ignored, and a stray generated camera catalogue was removed. 244 files, the largest 438 KB. The release notes are committed — they are the record of what was in the package — and the artefacts go to the GitHub Release |
| 195 | The goal document described a release from long ago | done | GOAL.md said v1.0.0, that the Android build needed an SDK that was not available, and that the release was source-only. All of that is out of date: the APK builds, signs and verifies, and the release is four artefacts |
| 196 | A device could push without limit | done | The plan's risk list names "device identity, secret rotation, rate limits and bounded ingestion" for sensor push, and the rate limit was the last one missing. A device that pushes a million frames a minute was bounded only by what the upstream would accept. The allowance is in frames, not pushes, because a device that pushes one frame a second and one that pushes five thousand are very different amounts of work. It is per device, so one sensor on one roof cannot starve the others, and it is charged after the body is validated, so a malformed push costs nothing. A push over the allowance is 429 with a `Retry-After` |
| 197 | The Android client's encrypted storage was untested | done | Five instrumented tests on an emulator (API 34), against a device with a real Android keystore: the encrypted path is the one taken, a session survives a reload, the token is not readable in the preferences file, and forgetting removes it. Two things had to be fixed to get there: the app had no `testInstrumentationRunner`, so the legacy runner started, found nothing, and reported a successful run with zero tests — the same as no test at all; and the storage fallback caught `Exception`, when the keystore's failure arrives as an `ExceptionInInitializerError`, an `Error` |
| 198 | The wiki was three pages | done | `docs/README.md` is the index: what each page is for, grouped by whether you are deploying, operating, changing or deciding. Six tests hold it to the pages it names — a page that has moved, or an anchor that goes nowhere, fails the build. An index of links is a list; an index that says when you would want each page is a way in |
| 199 | The work is pushed | done | Committed and pushed to `origin/master` |

## Verification Summary
- The JavaScript/TypeScript suite is green: **1547 pass, 0 fail, 22 skipped** in a full run with a database, and **1495 pass, 0 fail, 74 skipped** without one (the DB-backed files skip themselves)
- `npm run typecheck` clean; production build compiles; every route is in the API catalog
- The Android APK builds, signs and verifies (10.31 MB); 22 client tests pass on the JVM, and 5 instrumented tests pass on an emulator against a real keystore
- The Electron build produces the standalone binary and the NSIS installer
- The worker refuses a missing, wrong or absent key, and answers the platform
- The worker refuses every option-injection and traversal attempt with 400
- A tool that crashes, exits or floods cannot take the worker down
- A tool cannot read the platform's secret, the database URL or the signing certificate
- A tool's finding carries its provenance and is recorded as inferred
- A tool's finding is persisted, tenant-scoped, deduplicated and pruned on deadline
- Verified against a real PostgreSQL 17: migrated, seeded, written, read, pruned
- The standalone build no longer copies 1.3 GB of build outputs into itself
- 1495 JS tests pass in a full run without a database; 1547 pass with one
  (PostgreSQL 17, migrations applied). 64 Python tests pass (37 safety,
  15 routes, 12 isolation)
- 22 Android client tests pass on the JVM, with no device and no emulator
- The desktop and Android clients hold the same contract: the session is
  presented on the request, and a request without one carries no cookie
- The health check says what a client will meet, and the decision that
  backs it lives in one place
- The integrations health route serves process-level facts only: an
  upstream's own error text is not on a surface that answers without a
  session, and 4 route-level tests hold it there (one fails against the
  old route)
- The Android job runs under a committed Gradle wrapper; its three tasks
  were executed locally through that wrapper, not through a local Gradle
  install
- The previously-flaky OI and CCTV tests are isolated; the suite is reliably green
- Every port scan is bounded on both the library and the subprocess path
- The API catalog matches the routes on disk in both directions
- A database-backed deployment has a way in: first-run setup, then sign-in
- The session is stored as a hash, and signing out revokes it at once
- A signed-out caller is refused by the findings route and the dispatcher
- The desktop and Android clients can now act: each holds its own session
- The desktop app's token never enters the renderer, and both clients keep
  it encrypted at rest
- The first run was verified end to end against an empty database: the
  administrator is created, signed in, and the dispatcher then refuses a
  caller with no session, a capability that is not allowlisted, and a
  request with no asset
- Every allow and deny is in the audit trail, including the ones that were
  refused
- The linter finishes: 0 errors in 52 seconds, where it had been
  exhausting the heap after eight minutes
- `npm run typecheck` is clean, over the web platform only, and with a dev
  server running and rewriting its generated types
- 14 desktop-client tests pass against a live platform, including one
  that has closed its tool registry
- Every source's licence is recorded where the data is read, and the
  record and the document are held together by a test
- The emergency broadcasts reach the map: the CAP adapter produces
  findings, and each alert gets the beacon and the card its family calls
  for
- The guide for adding a tool is held to the code: every path it names
  exists
- The platform can say whether it can serve: `/api/ready` answers 200 or
  503, and the compose file's health check asks it
- Every capability declares a cost, and the day's spending is readable.
  The AI chat is metered in tokens: the provider sends the usage in the
  last message of a streamed reply, so the reply is counted as it passes
  through rather than held up to be read, and nothing is buffered. A
  deployment with no database records nothing durable: the in-memory
  quota keeps only a call count and drops the cost units, and the costs
  route has no rows to read back
- A sensor's push works, and its findings are kept: the Remote ID and
  Flock paths were refusing every push as invalid, and nothing tested
  the route, which is why
- A device's secret can be rotated, with a grace window so a sensor is
  not silenced while it is being told
- A camera is a thing, not a sighting: one row however many times it is
  seen, with the count and the first and last sighting
- The plan's operational list is complete: migrations, health and
  readiness, quotas, cost tracking, secret storage, security headers,
  first-run UX and licensing each have an answer, and each is tested

## Next Highest-Value Items
1. **The plan's v14 wiki is three pages, not a wiki** - the adding-a-tool
   guide, the licences and the roadmap are written and held to the code.
   What a wiki adds over three pages is cross-links and a structure a
   reader can navigate, and the plan's "professional wiki" is a bigger
   thing than what is there.
2. **The keystore fallback path is still untested** - the instrumented
   test runs on a device that has a keystore, so it proves the encrypted
   path. The fallback — what a device without a usable keystore does —
   is the path the `catch (Throwable)` guards, and it is the one a test
   cannot reach without disabling the keystore, which the emulator does
   not allow. It is the least tested path and the one most likely to be
   wrong.
3. **A metered provider that drops the connection is indistinguishable
   from a free local model in the cost ledger** - both arrive as zero
   tokens in the `ai-token` unit, and the platform cannot tell them apart
   from the wire. The costs route reports a zero that reads as "this
   cost nothing", which is true for one and false for the other. The
   distinction lives only in `reported: false`, which the ledger does
   not carry. Either the row gains a column, or the costs route says
   plainly that it cannot tell.
