# Troubleshooting

Real failure modes, with the cause and the fix. Every entry here was
reproduced on a working checkout — if your problem is not on this page,
it is probably a new one, and worth adding here when you find it.

---

## `npm test` fails two tests, but they pass on their own

**Symptom.** A full `npm test` run reports 2 failures out of ~1400:

```
src/lib/oi/context.test.ts > gatherContext > carries on without a source that fails
src/app/api/cctv/route.test.ts > CCTV partial responses > serves an already-cached region
```

Run either file on its own and every test in it passes:

```
npx vitest run src/lib/oi/context.test.ts          # 8 passed
npx vitest run src/app/api/cctv/route.test.ts      # 7 passed
```

**Cause.** Not the network — both files are fully mocked. The suite runs
many files at once, and both tests depend on wall-clock time moving
predictably: one pins the clock with fake timers and asserts a recency
window, the other asserts a cache hit within a shared deadline. Under
parallel load the scheduling shifts and the assertion misses by a step.

**What to do.** If you see exactly these two, they are not your change.
Confirm by running the files individually — if they pass alone, move on.
A change that makes them fail *consistently in isolation* is a real
regression, and is yours.

> This used to be recorded in `PROGRESS.md` as "live Photon API 503".
> That was wrong: neither file touches the network. The description here
> is the one that reproduces.

---

## `npm run lint` exits non-zero on a clean checkout

**Symptom.** `npm run lint` reports a handful of errors
(`react-hooks/set-state-in-effect`) in files you have not touched.

**Cause.** Pre-existing. The rule flags `setState` called synchronously
inside `useEffect`, and several older components do it —
`src/components/tools/useToolQuery.ts`,
`src/components/tools/windows/AiSettingsWindow.tsx`,
`src/components/tools/windows/ToolCollectionWindow.tsx`,
`src/app/docs/CommandPalette.tsx`, `src/app/docs/DocsClient.tsx`.

**What to do.** Lint only what you changed, and leave the rest alone:

```
npx eslint src/components/tools/ToolWindow.tsx
```

If you touch one of those files, fix the error while you are there rather
than adding a disable comment. The correct shape is to clamp or derive
the value when the state is created instead of correcting it afterwards
in an effect.

---

## Docker commands fail with "pipe/docker_engine"

**Symptom.**

```
failed to connect to the docker API at npipe:////./pipe/docker_engine
```

**Cause.** The Docker daemon is not running. This is the host, not the
project — `docker-compose.yml` and the `db` profile are fine.

**What to do.** Start Docker Desktop (or the `docker` service on Linux),
then `docker ps` to confirm before running any compose command. Without
it, the database-dependent paths below stay unavailable.

---

## Everything auth-related is skipped in the test run

**Symptom.** The run summary reports skipped files or tests
(`3 skipped` test files in the last full run), and no auth route tests
appear.

**Cause.** `src/app/api/auth/__tests__/auth-routes.test.ts` needs a real
PostgreSQL database, and skips itself when it cannot find one. Skipping
is deliberate: these tests create accounts, and the first-run route closes
permanently the moment one exists, so they must not run against a database
that has real accounts in it.

**What to do.** Give the suite a database of its own — never a working
one:

```
# Apply the migrations, then:
$env:OSIRIS_TEST_DATABASE_URL = "postgresql://user:pass@localhost:5432/osiris_test"
npm test
```

The suite cleans up the tenants it creates. Without Docker or Postgres,
the single-tenant behaviour is still covered — see
`src/app/api/auth/__tests__/auth-single-tenant.test.ts`, which runs the
real routes with no database configured.

---

## The platform asks me to sign in and I have no account

**Symptom.** A sign-in form, and no way to create an account.

**Cause.** This deployment has a database (`DATABASE_URL` is set) and at
least one account already exists. With a database the platform demands a
session; the first-run form only appears while there are no users at all.

**What to do.** Run first-run setup against the database directly, or seed
an account and set its password — see "Getting in" in `BUILD.md`. If the
deployment has no `DATABASE_URL`, it runs single-tenant, needs no sign-in,
and this form should not appear at all.

---

## A security tool answers 503

**Symptom.** A tool window or a client app gets `503` from
`/api/integrations/...`.

**Cause.** The adapter could not run because something it needs is not
configured. The response body carries the reason in `errorCode`, and the
dispatcher maps any `*_NOT_CONFIGURED` or `*UNAVAILABLE` message to 503:

```json
{ "ok": false, "errorCode": "SHODAN_NOT_CONFIGURED", "requestId": "…", "auditId": "…" }
```

**What to do.** Read `errorCode`. Each adapter names what it wanted —
`SHODAN_NOT_CONFIGURED`, `AI_PROVIDER_NOT_CONFIGURED`,
`RUFLO_NOT_CONFIGURED`, `HIBF_NOT_CONFIGURED`,
`COLLECTION_WORKER_NOT_CONFIGURED`. Set that credential and retry. A 503
is a refusal, not an empty result: the platform does not quietly return
nothing when a source is missing.

---

## The worker refuses every request

**Symptom.** `COLLECTION_WORKER_NOT_CONFIGURED` or
`WORKER_KEY_NOT_CONFIGURED` from the tool-collection tool, and every
worker route except `/api/health` returns 401 or 503.

**Cause.** The worker authenticates the platform with a shared secret,
compared in constant time. The worker side reads `OSIRIS_WORKER_KEY`; the
platform side needs both `OSIRIS_WORKER_URL` and the same
`OSIRIS_WORKER_KEY`. A worker with no key answers only its health check; a
wrong key is 401.

**What to do.** Start the worker with `OSIRIS_WORKER_KEY` set and point the
platform at it with `OSIRIS_WORKER_URL`. The worker binds to loopback by
default, so a remote worker also needs its address configured.

`GET /api/ready` is the first place to look. Its `worker` check calls the
worker's own health route — which, as the cause says, answers without a
key — so it reports a wrong address or a stopped worker, with the reason
in `detail`. What it cannot see is a wrong key: a worker that has one
still answers its health check, and only refuses the routes that carry
platform traffic. That shows up instead when a tool call is denied —
`errorCode` and `auditId` in the response, with the full reason recorded
against the tenant and actor in the audit trail. `GET
/api/integrations/health` shows the source turning `degraded` and then
`down` as the failures accumulate, which is the state without the text:
that endpoint answers without a session, so it reports what happened, not
what an upstream said about it.

See `BUILD.md` → "The worker's tests" for the three cases the boundary
tests drive.

---

## The map renders, but the globe does not

**Symptom.** In a production build the map area stays blank, while the
same code works under `next dev`.

**Cause.** Open, and recorded as `#18` in `PROGRESS.md`. It reproduces
with the security-tool changes reverted, so it is not caused by them.

**What to do.** Verify under `next dev` first — canvas, tiles, camera
markers. If dev works and the production build does not, the problem is
in the build, not in the map code. Check `tools/prepare-map-worker.mjs`
ran (it is wired as both `predev` and `prebuild`).

---

## A build is much larger than expected

**Symptom.** The standalone build is in the gigabytes.

**Cause.** This was fixed: build outputs inside the repo were being traced
into the build, which dropped from 1.3 GB to 44 MB once excluded. If it
returns, something new is writing build output into a path Next.js traces.

**What to do.** Look for newly created output directories under the repo
root and make sure they are both ignored and untraced. The current
exclusions live in `next.config.ts` under `outputFileTracingExcludes`
(`models/`, `releases/`, `android-app/`, `electron-app/`, `runs/`,
`scratch/`, `.next/cache/`) and in `.gitignore` (`/build`, `dist/`).
Anything new that writes build output into the repo needs to be added to
both.

---

## A route works but the docs do not list it

**Symptom.** `/docs` has no entry for a route that exists.

**Cause.** It should not happen any more. The catalog at
`src/app/docs/apiCatalog.ts` is checked against the filesystem by
`src/app/docs/__tests__/api-catalog.test.ts`, in both directions: a route
with no entry fails, and an entry with no route fails.

**What to do.** Add the endpoint to `API_GROUPS` with a summary, its
return keys and any parameters. If it genuinely is not public, add it to
`NOT_PUBLIC` in that test with a reason — an exemption there is a
decision, and the test asks you to make it explicitly.

---

## Where to look next

| Document | Covers |
| --- | --- |
| `BUILD.md` | Building each client, the database, migrations, seeding |
| `DOCKER.md` | Self-hosting, compose, CasaOS, which keys the code reads |
| `CI_CD_SETUP.md` | Pipeline jobs, secrets, runner setup, release flow |
| `SECURITY.md` | Responsible use and reporting |
| `/docs` | Every public API endpoint, rendered from the catalog |
