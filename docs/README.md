# OSIRIS documentation

A small wiki. Three pages existed before this one; this is the index
that ties them together, so a reader can move between them instead of
having to know which file to open.

## Start here

- [Adding a tool](ADDING-A-TOOL.md) — the full path from a card in the
  manifest to a beacon on the map, with the tests that hold it together.
  Read this before adding anything.
- [Licences and attribution](LICENSES.md) — OSIRIS is MIT; each data
  source has its own licence, and some oblige whoever redistributes the
  data to do something. The record and the document are held together by
  a test.
- [Roadmap](ROADMAP.md) — ideas not yet built, each a candidate rather
  than a commitment, with the operational list that is already complete.
- [Troubleshooting](TROUBLESHOOTING.md) — what to check when a thing
  does not work, including which endpoint answers which question.

## New in v1.0.3

- **PMTiles offline basemap** — air-gapped `.pmtiles` vector basemaps via
  Docker volume; `pmtiles://` protocol handler registered with MapLibre
- **Shader post-processing pipeline** — FLIR thermal, NVG phosphor, CRT
  scanlines canvas overlay over MapLibre
- **Entity node-link graph** — `react-force-graph-2d` link analysis for
  tagged entities (wallet / IP / aircraft)
- **Security tool integrations** — 13 tools in the registry (Shodan,
  Zenmap, Metasploit, Maltego, Sherlock, DedSec CCTV, Exploit-Index,
  SpyTV, Pegasus Pro, Ruflo, nrSuite, StrykerApp, Drone RID), deny-by-default
  capability allowlist, single gated dispatcher, per-tool detail pages

## Reference

- [Gap analysis](GAP-ANALYSIS.md) — the six gaps that were open and how
  each was closed.
- [Release docs](RELEASE-DOCS.md) — what ships and how.
- [Terrain local review](terrain-local-review.md) — notes on the terrain
  review pass.

## If you are deploying it

Start with [BUILD.md](../BUILD.md) and [DOCKER.md](../DOCKER.md), then
[CI_CD_SETUP.md](../CI_CD_SETUP.md). The plan and progress live in
[GOAL.md](../GOAL.md) and [PROGRESS.md](../PROGRESS.md).

## If you are operating it

Read [Troubleshooting](TROUBLESHOOTING.md). The platform can say whether
it can serve via `/api/ready`; `/api/integrations/health` no longer
reports why a call failed, and the worker is behind `/api/ready`.

## If you are changing it

Read [Adding a tool](ADDING-A-TOOL.md), then
[SECURITY.md](../SECURITY.md). The rules the code keeps coming back to:
deny by default, never trust the client, validate at every boundary.

## If you are deciding what to build next

Read [Roadmap](ROADMAP.md) and [GAP-ANALYSIS.md](GAP-ANALYSIS.md).

## Top-level documents

- [BUILD.md](../BUILD.md)
- [DOCKER.md](../DOCKER.md)
- [CI_CD_SETUP.md](../CI_CD_SETUP.md)
- [SECURITY.md](../SECURITY.md)
- [GOAL.md](../GOAL.md)
- [PROGRESS.md](../PROGRESS.md)

## Cross-references

- Adding a tool → Licences: every adapter that reaches an upstream writes
  its source, licence, credit and share-alike flag into the finding. The
  CAP adapter reads its terms from the registry rather than repeating
  them. See [Licences](LICENSES.md).
- Adding a tool → Roadmap: the plan's operational list (migrations,
  health, quotas, cost tracking, secret storage, security headers,
  first-run UX, licensing) is complete. Open items live in
  [Roadmap](ROADMAP.md).
- Costs → Troubleshooting: `/api/integrations/health` no longer reports
  why a call failed; the full reason is in the audit trail, and the
  worker is behind `/api/ready`. See [Troubleshooting](TROUBLESHOOTING.md).

## How this is kept honest

The docs are held to the code by tests where a claim can be checked
mechanically: `api-catalog.test.ts` checks the API catalog, the
adding-a-tool guide is checked against the paths it names, and the
licences page is checked against the registry. A page that drifts from
the code is a failing test, not a stale document.
