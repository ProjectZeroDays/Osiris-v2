# Gap Analysis — closure

The plan versions v4–v8 and v12 each carried a gap list: things the
release notes claimed that the code did not yet do. There was no document
recording their state, so this is that document. Every claim below was
checked against the code on this checkout, not against the plan.

**Result: 6 gaps found. All 6 closed.**

---

## How each claim was checked

Not by reading the claim, but by running the thing that would fail if the
claim were false. Where a claim is a security property, the check is the
test that asserts the refusal.

---

## v4 — Phase 1: the tool collection is bounded

| Claim | State | Evidence |
| --- | --- | --- |
| Deny-by-default capability allowlist | **holds** | `capabilities.test.ts` (7 passed). An unknown capability is denied; there is no generic runner. |
| Exactly one adapter may reach `child_process` | **holds** | `execution-boundary.test.ts` asserts the count by reading every adapter's source. One file matches: `plate-ocr.server.ts`, and it uses `execFile` with a fixed argument vector, never `exec`. |
| No `execSync` anywhere in the adapters | **holds** | The same test greps for it and fails on a match. |

---

## v5–v8 — Phases 4–8: the worker

| Claim | State | Evidence |
| --- | --- | --- |
| The worker answers only the platform | **holds** | `worker-boundary.test.ts` drives the real worker three ways: no key, wrong key, right key. 2 tests, ~115s because they start the process. |
| The worker binds to loopback by default | **holds** | Config default; the compose service name is the one documented exception. |
| Every subprocess goes through the bounded runner | **holds** | No direct subprocess call outside `worker_safety.py`'s runner. |
| Output is bounded, and a flood cannot take the worker down | **holds** | `test_worker_safety.py` — 46 passed. |
| Option injection is refused | **holds** | `test_worker_routes.py` drives the real routes; every attempt is a 400. |

---

## v11–v12 — Phases 10–12: isolation, secrets, provenance

| Claim | State | Evidence |
| --- | --- | --- |
| A tool never sees the platform's secret | **holds** | `worker_safety.py` builds the environment from an allowlist, then strips `NEVER_INHERIT` on top: `OSIRIS_WORKER_KEY`, `OSIRIS_PLATFORM_URL`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `CSC_LINK`, `CSC_KEY_PASSWORD`. The 5 environment tests pass. |
| The tools' own keys survive the scrub | **holds** | `SAFE_ENV_VARS` keeps Shodan, OpenRouter, OpenCellID and Broadcastify keys, so a tool still gets what it was written to use. |
| Tools run in a subprocess, never imported | **holds** | `test_tool_isolation.py` — tools that crash, exit, flood, shell out or return unserialisable data are all contained. |
| A finding carries its provenance | **holds** | Provenance is written into the persisted row and read back by `/api/integrations/findings`. |

---

## Gaps found by this audit

### 1. Closed — 24 routes were undocumented

`src/app/docs/apiCatalog.ts` described itself as "kept in sync by hand".
It was not: 96 routes existed on disk and 68 were catalogued. Worse,
`/api/gdelt` was documented as reading GDELT while the route actually
reads GDACS — the summary was simply wrong.

**Closed by** `src/app/docs/__tests__/api-catalog.test.ts`, which compares
the catalog against the filesystem in both directions. All 24 routes now
have entries; the `/api/gdelt` summary is corrected and points at
`/api/gdelt-events` for the real GDELT records.

### 2. Closed — the single-tenant path had no test

The auth suite needs a database and skips without one, so the other half
of the contract — a deployment with no `DATABASE_URL` — was asserted by
code and tested by nothing.

**Closed by** `src/app/api/auth/__tests__/auth-single-tenant.test.ts`,
which runs the real routes with no database and confirms: no setup is
required, the first-run and sign-in routes refuse with 503, and the
session route names the single-tenant identity marked `ephemeral`.
6 tests pass.

### 3. Closed — the overlay had no window manager

Phase 3's overlay/app switcher was open. Opening a second tool replaced
the first, with no way back to it and no indication of what was open.

**Closed by** `src/components/tools/window-manager.ts` — pure functions for
open/focus/close/cycle/cap, 14 tests — plus the switcher dock, `Ctrl+\``
cycling, and cascade offsets in `ToolWindow.tsx`. `tsc --noEmit` clean and
the production build compiles.

### 4. Closed — no troubleshooting record

Failures were being rediscovered, and one was mis-recorded: the two
full-suite test failures were logged as "live Photon API 503" when
neither file touches the network.

**Closed by** `docs/TROUBLESHOOTING.md`, with each entry reproduced on
this checkout — including one mis-recorded claim corrected. The two
full-suite test failures had been logged as "live Photon API 503", but
neither `src/lib/oi/context.test.ts` nor `src/app/api/cctv/route.test.ts`
touches the network; both pass in isolation and fail under parallel load.
See gap 6.

### 5. Closed — a port scan ran unbounded

`/api/network/portscan` had two paths. The subprocess path went through
the bounded runner; the `python-nmap` library path did not. `nm.scan()`
was called with no `timeout`, and python-nmap documents its default of
`0` as "wait indefinitely" — so a scan against an unresponsive network
held the worker thread until the client gave up, with no cap on what it
accumulated either. The subprocess fallback also passed a bare literal
rather than the shared constant.

This matters more than it looks: the worker is `threaded=True`, so each
unbounded scan pins one of a finite number of threads, and a handful of
concurrent scans stops the worker answering its health check.

**Closed by** passing `timeout=SCAN_TIMEOUT_SECONDS` to `nm.scan()` and
to the nuclei `run_tool` call, with the constant defined as
`DEFAULT_TIMEOUT_SECONDS` (120s). Verified: 64 Python tests pass
including 3 new ones in `test_worker_safety.py` that assert the unbounded
form is gone, that every `run_tool` call names a timeout, and that no
direct `subprocess.Popen` appears in the worker.

### 6. Closed — two tests failed only under full-suite load

`src/lib/oi/context.test.ts` and `src/app/api/cctv/route.test.ts` passed
when each file was run alone and failed in a full parallel run. Both were
clock-sensitive, and neither touched the network — which is why the
original "live Photon API 503" note in `PROGRESS.md` was wrong.

Two test-isolation defects, not product bugs:

- The OI fixture carried a past date, so as real time advanced the stories
  fell out of the 72-hour recency window and the assertions quietly
  stopped seeing them. `NOW` is now a pinned constant.
- A CCTV region left in a 5-minute backoff by an earlier case silenced a
  later one. `clearCctvRefreshes()` now runs in `beforeEach`, so no case
  inherits another's backoff.

Verified: 15/15 in isolation, and 1402/1402 in a full parallel run.

---

## What this audit did not check

- **Live upstreams.** Every check here is against mocks or a local
  worker. Whether an external feed is up today is not a gap in this code.
- **The Android and Electron builds.** Both are built and verified in CI;
  they were not rebuilt here.
- **The database-backed auth path.** No Docker daemon nor Postgres on this
  machine, so `auth-routes.test.ts` skipped. Its single-tenant
  counterpart covers the other shape.
