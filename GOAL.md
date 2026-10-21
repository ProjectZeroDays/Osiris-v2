# Osiris Project Goals

## What this is

OSIRIS is a MapLibre-based situational-awareness platform. It consumes
normalised, permission-checked data from external tools, sensors, public
feeds and AI providers, and it is **not** the runtime for those tools or
their reference backends. A shared pipeline handles authentication,
validation, policy checks, adapters, persistence, audit and retention,
and exposes safe records to the map, the tool windows, the beacon cards
and the APIs.

The design proposals this was built from are in the plan (v4 through v15).
This document is the goal and the state, not the plan.

## The rules everything else follows from

- **Registry-driven.** One manifest defines a tool's identity, its
  capabilities, its state, its scope, its retention, its icon, its window
  and its beacon kinds.
- **Deny by default.** Typed adapters and explicit capability allowlists.
  No generic command runner, no arbitrary upstream URL, no client-trusted
  state, no unreviewed execution.
- **Real authorisation.** Session identity, tenant and role checks, asset
  ownership, consent where required, and device authentication for sensor
  push. Fail closed; audit every decision.
- **Validate and minimise.** A schema at every boundary. Imported
  reports, decoded network data and upstream responses are untrusted.
  Minimise sensitive fields before they are persisted or displayed.
- **Persist deliberately.** Durable findings, audit events, sensor
  detections, and dedup/upsert state. Explicit migrations; retention
  jobs. Raw and high-volume artefacts stay out of the primary database.
- **Map through existing infrastructure.** Normalise to GeoJSON and
  beacon records; use the existing MapLibre path. Live sources need an
  explicit refresh; a static URL does not poll.
- **Shared UI.** Universal tool windows, map beacons, a detail panel,
  popup cards, and a window-to-map-to-popup loop.
- **Operational controls.** Per-source health, rate limits and quotas, cost
  tracking, secret handling, security headers, first-run setup, readiness
  probes, and reproducible tests.
- **External services are contracts.** Allowlisted hosts, documented
  contracts, bounded timeouts, graceful degradation, and the licence and
  terms of every source recorded where the data is read.

## Where the work stands

### Done

- **25 registered security tools** behind a single gated dispatcher, with
  a deny-by-default capability allowlist and an append-only audit of every
  allow and every deny.
- **A shared tool window per tool**, a beacon registry, and a popup card
  per beacon kind, all reading one schema.
- **Durable, tenant-scoped findings** with per-tool retention deadlines,
  a dedup on the finding's id, and a pruning job.
- **Sessions, tenants, assets, consents and device credentials.** A
  database-backed deployment has a way in: a first-run screen creates the
  first administrator, and the session is a hashed token that can be
  revoked at once.
- **A worker, not a surface.** The wide tool collection runs in a
  separate process, in a subprocess per tool, with a scrubbed environment
  and a shared secret, and every result carries its provenance.
- **Public and civic feeds.** Scanner radio, CAP 1.2 emergency broadcasts
  and the Amber, Silver and Blue families, cell towers and heuristics,
  police incident records.
- **AI providers** behind one chat proxy — local GGUF, MLX and Ollama,
  plus a server-held OpenRouter key — with a model download manager.
- **Two native clients.** A Windows desktop app and an Android app, both
  reading the platform's registry, both holding their own session, both
  keeping it encrypted at rest, and the desktop one keeping it out of the
  renderer entirely.
- **The operational surface.** Health and readiness, quotas, cost
  tracking, secret handling, security headers, first-run UX, and the
  licence of every source.
- **The plan's documentation.** The adding-a-tool guide, the licences,
  the roadmap, the troubleshooting record, the gap analysis, the API
  catalog, and a test that holds each of them to the code.

### Not done, and why

- **Windows code signing.** Needs a certificate from a CA. The build
  already knows what to do with one: `CSC_LINK` and `CSC_KEY_PASSWORD`.
- **The map's dynamic chunk in a local production build.** Pre-existing;
  it reproduces with the security-tool changes reverted, and the deployed
  build renders the globe.

## How the work is verified

| | |
|---|---|
| JavaScript and TypeScript | 1547 tests with a database, 1495 without, 0 failures |
| Type check | `npm run typecheck` clean, over the web platform only |
| Lint | `npm run lint`, 0 errors |
| Python (the worker) | 64 tests: safety, routes, isolation |
| Android | 22 client tests on the JVM and 5 instrumented tests on an emulator; the APK builds, signs and verifies |
| Desktop | 14 client tests against a running platform |
| The release | v1.0.19: EXE, NSIS installer, signed APK, notes |

The full task table, with what each item was verified against, is in
[PROGRESS.md](PROGRESS.md).

## Where to start

- **[README.md](README.md)** — what it is, and how to run it.
- **[BUILD.md](BUILD.md)** — building each client, the database, the
  migrations, and the first run.
- **[DOCKER.md](DOCKER.md)** — self-hosting, the two probes, and which
  keys the code reads.
- **[docs/ADDING-A-TOOL.md](docs/ADDING-A-TOOL.md)** — adding a tool.
- **[docs/LICENSES.md](docs/LICENSES.md)** — every source's licence, and
  the share-alike warning.
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** — real failure
  modes, with the cause and the fix.
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — what is next, and what was
  considered and rejected.
