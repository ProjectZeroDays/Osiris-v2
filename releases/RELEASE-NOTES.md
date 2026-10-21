# Osiris Release 1.0.19

## Artifacts

- **electron.exe** (169 MB) - Electron Windows standalone app with the Cyber-Security dashboard
- **osiris-electron-1.0.19-x64.nsis.exe** (73 MB) - NSIS installer for Windows
- **osiris-app-release.apk** (10.31 MB) - Signed Android release APK

## The platform can be entered

A deployment with a database demands a session, and there was nothing that
issued one. The only way in was to know a user's id and put it in a cookie.
A database-backed platform therefore had no way in at all.

- **A real session model.** The browser holds a random token in an
  `HttpOnly` cookie; the server keeps only the token's SHA-256. A read of
  the `sessions` table yields nothing usable, and a token that is copied
  out of a browser stops working the moment the row is deleted — which is
  what signing out does.
- **Passwords are hashed.** scrypt, with a per-password salt. The work
  factor is written into the hash, so it can be raised later without
  invalidating the passwords that were hashed with the old one. A wrong
  password and an unknown account are refused identically, so neither
  answer says which addresses have accounts.
- **The first-run route.** A platform with no accounts has no way in, so
  it grows one: the first account it is given becomes the administrator
  of the first tenant, and it is signed in as it is created. The check and
  the insert are in one transaction, so two requests arriving together
  cannot both decide they are the first, and the route is closed behind
  the first account for good.
- **The gate.** A deployment with no database runs single-tenant and needs
  no sign-in, and the platform says so rather than showing a form that
  cannot work. The map is not mounted for a visitor who is not signed in.
- A refusal is not a fallback: an unauthenticated caller was briefly
  marked `ephemeral`, so the gate mistook a refusal for the single-tenant
  case and let everyone through. Found and fixed.

## The clients can act, not only look

The registry is open, so both native apps could read the tool list. The
dispatcher is not open, so neither could run anything.

- **The desktop app holds a session.** It signs in, keeps the cookie and
  presents it on every call, from the settings window and from the Cyber
  Tools panel.
- **The token stays out of the renderer.** It is held in the main
  process, and there is no getter that returns it. The renderer asks the
  main process to act, so a script that finds its way into the page
  cannot take the session with it.
- **The token is encrypted at rest.** The desktop app uses Electron's
  `safeStorage`, which uses the operating system's credential store; the
  Android app uses `EncryptedSharedPreferences`, whose key lives in the
  Android keystore. Where the keystore is unavailable the Android app
  says so and keeps the token in plain preferences, rather than
  pretending the storage is protected when it is not.
- Ten tests drive the desktop client against a running platform: a wrong
  password is refused, a capability without a session is refused with
  401, the token is not in the file in the clear, the token is not
  exported, and signing out revokes the session at once.

## The suite is green

The two failures that were blamed on the network were test-isolation
defects, and both are fixed.

- A fixture dated 2 October fell out of a 72-hour recency window as the
  days passed, so the test failed for a reason that had nothing to do
  with what it was testing. The clock is now pinned to the fixture's own
  moment.
- A region left in a five-minute backoff by an earlier case silenced a
  later one. The backoff map is now cleared between cases, as the refresh
  map already was.
- The worker's health check waited 60 seconds while its test allowed 120,
  so a slow start under a loaded machine read as a failure of the
  boundary rather than of the clock. The budget now matches.
- The suite now passes with and without a database, and CI runs it both
  ways: the `web-build` job starts PostgreSQL 17, applies the
  migrations, and runs everything against it.

## The linter finishes

The lint step in CI had never been able to run to completion here. It
exhausted the heap after eight minutes, and the failure had been
mistaken for the code being too large.

- `eslint-plugin-react-hooks` v7's `recommended` set includes the React
  Compiler's static analysis, and analysing a large component with it
  is enormous. Those rules are switched off; the two worth having —
  `rules-of-hooks` and `exhaustive-deps` — are kept. The file says why.
- The type program had been the whole repository, including the desktop
  app's 995 dependency type files. It is now the web platform and its own
  configuration files.
- A vendored MapLibre bundle was producing 1059 warnings. Third-party
  code is not the project's to answer for.
- The errors that were real — three `prefer-const` and two `require`s —
  are fixed, each with the reason kept next to it.
- 0 errors, 539 warnings, in 52 seconds.

## The emergency broadcasts now reach the map

The CAP parser, the Amber, Silver and Blue families, their beacon kinds
and their popup cards all existed. Nothing produced a finding, so
nothing was persisted, nothing was drawn, and none of those cards was
ever reached by anything.

- The adapter now produces findings, and the beacon kind is the alert's
  family — so an Amber Alert is an Amber Alert on the map and gets the
  Amber card.
- The finding carries the alert's headline, so the marker says something
  a reader can use rather than the tool's id.
- The card shows the source, its licence and the credit the source asks
  for.
- Verified live against the National Weather Service: four alerts in the
  test area, four findings, four rows stored, four map features. Run
  twice, the rows stay at four — the write is an upsert.
- An alert with no place on the map is not a beacon. The origin is also
  the parser's "no point", and zero-zero is in the Gulf of Guinea, so it
  is left out rather than drawn.

## The sources' terms are recorded, and the wiki the plan asks for

The plan's v14 asks for a professional wiki, and calls licensing an
implementation gate rather than polish. The repository had neither: no
record of what any source's terms are, and no guide for adding a tool.

- **Every source's licence is recorded where the data is read.** The
  adapters that reach an upstream write the source, the licence, the
  credit and whether the licence is share-alike into the finding itself,
  so a record that is asked about later can answer without going back to
  the adapter.
- **A credit is not a confidence tier.** `attribution` already meant the
  platform's own tier — how far its judgement can be trusted — and the
  source's credit wanted the same name. The source's credit is
  `sourceAttribution`; the tier is still `attribution`.
- **`docs/LICENSES.md`** — every source the code reaches, its licence,
  what it obliges, where the terms are stated, and the plan's
  share-alike warning: what it means here, that the findings table is a
  derived database once a share-alike finding is written into it, and
  that exporting those findings is the case needing a decision.
- **`docs/ADDING-A-TOOL.md`** — the manifest entry, the icon, the
  allowlist, the adapter, the dispatcher and the order of its checks,
  the window, the beacon and the card, the tests, and the checklist.
  Plus what is not negotiable.
- **`docs/ROADMAP.md`** — what is built today, what is next, and a list
  of what was considered and rejected: a generic runner, running the
  collection in-process, promoting a tool's word to a fact, storing the
  operator's raw media, and anonymising away the provenance.
- **The documents are held to the code.** A source in the registry
  without a row in the document, or a row without an entry, fails the
  build. So does a guide that names a file that has been moved, or that
  forgets a part of the platform a tool needs.

## The Android client is tested, and the surface is visible

The desktop client had 14 tests against a running platform. The Android
client had none — the gap was asymmetric by accident rather than by
choice — and a deployment that closes its registry would have met an
app that quietly lost its session.

- **22 tests on the JVM**, with no device and no emulator. The
  registry's shape: every field the screen renders, in the platform's
  order, with a missing optional field becoming the platform's own
  default. And the session on the wire, against a fixture that replaces
  the transport and nothing else — `PlatformSession` and
  `PlatformRegistry` run unmodified.
- **The session is proved on the request.** A held session is presented
  on the registry call and on the session call; a request with no session
  carries no cookie; a sign-in that issues no cookie is not a session;
  and the password is sent once and never presented again.
- **The storage half is separated from the network half.** Talking to the
  platform needs no `Context`; keeping the token for next time does. That
  is what made the whole thing testable.
- **A real defect, found by the tests:** `MasterKeys` initialises its
  provider in a static initialiser, so a device without a usable
  keystore throws an `ExceptionInInitializerError` — an `Error` — and the
  storage fallback's `catch (Exception)` let it past. The fallback exists
  for exactly that case, so it now catches it.
- **The registry's surface is visible from outside.** `/api/health` says
  what a client will meet: whether the registry is open or closed behind
  a session, whether the platform has accounts to sign in as, and the
  path. A client that gets a 401 from the registry is a client that is
  misconfigured, and an operator could not tell that from one that is
  simply not signed in.
- **The gate is decided in one place.** The route that enforces it and
  the health check that reports it read the same module, because two
  readers of one flag can disagree.
- **The flag is not obeyed where it cannot be.** A bare deployment has no
  account to sign in as, so closing its registry would refuse the only
  operator there is, with no way back in. The surface says the registry
  is open there, whatever the flag says. Verified live: a database
  deployment with the flag answers 401 to the registry and says so in the
  health check; a bare deployment with the same flag answers 200.
- The client's tests now run in CI, before the APK is built.

## A sensor's push, and the devices it sees

The plan's risk list names "device identity, secret rotation, rate limits
and bounded ingestion" for sensor push. Two of those were missing, and
the path itself was broken.

- **The push path was broken.** The route validated the array inside the
  body against a schema shaped as an object holding that array, so every
  Remote ID and Flock push was refused as invalid — the one path a sensor
  has. Nothing tested the route, which is why it stayed broken. Ten
  tests drive it end to end now.
- **A push's findings were never kept.** The route produced them and
  dropped them. It writes to the same store the dispatcher does now, so a
  drone seen by a rooftop box reaches the map as a beacon and belongs to
  a tenant, rather than existing only in the response.
- **A device's secrets can be rotated.** `POST /api/integrations/devices`
  creates a device and `PUT` rotates it. The new secret takes effect at
  once; the previous one keeps working for a 24-hour grace window, so a
  sensor is not silenced while it is being told. A secret is shown
  **once**, because the platform keeps only its hash and cannot show it
  again. Creating and rotating a device are administrative acts, and a
  device of another tenant cannot be rotated.
- **A device is a thing, not a sighting.** The `drones` and
  `surveillance_devices` tables existed and were never written to. The
  entity row is now the camera: one row however many times it is seen,
  with the observation count and the first and last sighting. A sighting
  is never made to be more certain by repetition.
- **`GET /api/integrations/entities`** reads them back. A camera seen
  four hundred times is one camera seen four hundred times, and a card
  that says so is a different card from one that says "seen once".

## The platform can say whether it can serve

The plan lists "health/readiness" as an implementation gate. Liveness
existed; readiness did not.

- **`GET /api/ready`** answers 200 when this instance can serve and 503
  when it cannot, so a load balancer keeps traffic off it. `/api/health`
  says the process is up and checks nothing else on purpose; a probe
  that fans out on every call is a self-inflicted outage under load.
- **Three checks:** the database is reachable and has the eight tables
  the platform needs — a migration that was never applied is a table that
  is not there. There is at least one account that is not disabled: a
  platform with a database and no accounts demands a session and has
  nobody to make one for. And the tool-collection worker answers, if one
  is configured.
- **Every check runs**, so an operator who has three things wrong is
  told all three, and the reason a check failed is the reason, not the
  query behind it.
- **The compose file's health check** asks `/api/ready`, not
  `/api/health`. The `start_period` covers the first start of a
  deployment with a database, which is expected to be unhealthy until
  somebody opens the first-run screen.

## What the calls cost

The plan lists "quotas, cost tracking" together. Quotas counted calls;
nothing recorded what those calls cost.

- **Every capability declares a cost**, in the unit the provider charges
  in — a `shodan-query`, an `hibf-lookup`, an `ai-request`. A capability
  with no declaration is a build failure rather than a silent zero: a new
  capability that reaches a metered service has to be given one, and one
  that does not has to be given zero on purpose.
- **The cost is charged with the quota**, in the same row, because a
  limit and a bill are the same question asked two ways. It is charged
  when the call is dispatched — a metered service charges for the
  request whether or not the answer was useful — but not before the
  asset and consent gates, because a call that never left the platform
  cost nothing.
- **`GET /api/integrations/costs`** reports the day's spending per
  tool, and lists the capabilities that cost anything. A tool that was
  used and cost nothing is reported too: that is a different fact from a
  tool that was not used.
- The AI chat counts requests rather than tokens, because counting
  tokens would mean buffering a stream the operator asked to be streamed.

## Verification

- 1642 JavaScript/TypeScript tests pass with a database, 1596 without
  (the database-backed tests skip themselves when there is none)
- 61 Python tests pass (34 safety, 15 routes, 12 isolation)
- 14 desktop-client tests pass against a running platform, including a
  platform that has closed its tool registry
- 27 Android client tests pass on the JVM, with no device and no emulator,
  and 5 more on an emulator against a device with a real keystore
- `npm run typecheck` is clean; the production build completes, and ships
  65 MB with the big project directories excluded
- `npm run lint` finishes with 0 errors
- The Android APK builds, signs and verifies with apksigner (v2 and v3
  schemes)
- The Electron build produces the standalone binary and the NSIS
  installer, with the new platform client inside the package
- The emergency broadcasts were verified live against the National
  Weather Service: alerts, findings, stored rows and map features
- The registry's surface was verified live both ways: a database
  deployment with the flag answers 401 to the registry and says so in
  the health check; a bare deployment with the same flag answers 200

## Known issues

- The Windows executables are unsigned. Code signing needs a certificate
  from a CA; `CSC_LINK` and `CSC_KEY_PASSWORD` in the CI environment will
  sign both the installer and the standalone binary.
- In a local `next build` output the map's dynamic chunk is not requested
  by the client, so the globe does not initialise. This reproduces with
  the security-tool changes reverted, and the deployed build renders the
  globe correctly; it is being tracked separately.
- The tool registry endpoint is open to anyone who can reach the
  platform. It is metadata rather than data, but it does name the
  platform's capabilities, and a deployment that wants it closed has no
  way to close it.
