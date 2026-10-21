# Roadmap

Ideas not yet built. Each is a candidate, not a commitment.

## What is here already

For orientation, these are the areas the platform covers today, so the
list below is read against something rather than in the abstract:

- 25 registered security tools behind a deny-by-default capability
  allowlist, with a single gated dispatcher and an append-only audit of
  every allow and every deny.
- A shared tool window per tool, a beacon registry, and a popup card per
  beacon kind, all reading the same schema.
- Durable, tenant-scoped findings with per-tool retention deadlines, a
  dedup on the finding's id, and a pruning job.
- Sessions, tenants, assets, consents and device credentials, with a
  first-run screen for a deployment that has no accounts.
- Public and civic feeds: scanner radio, CAP 1.2 emergency broadcasts
  and the Amber, Silver and Blue families, cell towers and heuristics,
  police incident records.
- Local and remote AI providers behind one chat proxy, with a model
  download manager.
- A Windows desktop client and an Android client, both reading the
  platform's registry and both holding their own session.

## Data

- **TAK/CoT interop** — import and export Cursor-on-Target, so the
  platform can carry a track rather than only a point.
- **STIX2 interop** — import and export threat intelligence, so a
  finding can be handed to something that speaks it.
- **CKAN adapter** — more city portals. Socrata and ArcGIS are
  supported; CKAN is not, and the police feed would widen with it.
- **ADS-B direct** — an RTL-SDR feed without a third party in the
  middle.
- **AIS direct** — the same, for maritime.
- **CAP broadcast** — emit alerts rather than only consuming them.

## Map

- **3D Tiles** — photorealistic buildings.
- **Cesium globe** — a full prototype; it is feature-flagged.
- **Time slider** — replay the events rather than watching them.
- **Heatmaps** — density views rather than points.
- **Route animation** — replay tracks.

## Analysis

- **Watchlists** — keyword and entity alerts.
- **Geofences** — area alerts.
- **Entity graph** — link related events across sources.
- **Confidence scoring** — automatic uncertainty, rather than a
  fixed number per tool.
- **Anomaly detection** — beyond the IMSI heuristics.

## AI

- **Local Whisper** — voice input, without the audio leaving the host.
- **Local embeddings** — semantic search over the findings.
- **Agent mode** — multi-step tasks.
- **Report generation** — an auto-draft a human then checks.

## Collaboration

- **Multi-user** — auth, roles and tenants exist; the collaboration
  around them does not.
- **Shared workspaces** — a team map state.
- **Annotations** — collaborative notes on the map.

## Things that are deliberately not on this list

Some work would be wrong rather than merely undone, and it is worth
saying what was considered and rejected:

- **A generic tool runner.** The platform does not execute commands a
  caller supplies, and adding one would undo the boundary the whole
  capability allowlist exists to make.
- **Running the collection in-process.** The collection runs in a worker,
  in a subprocess, with a scrubbed environment. The platform never
  imports a tool module into its own process.
- **Promoting a tool's word to a fact.** A tool's finding is recorded
  as inferred, with the tool's source hash as its evidence. Anything
  that let a tool's assertion be shown as a verified observation would
  be the wrong trade.
- **Storing the operator's raw media.** The platform keeps the
  references and the findings, not the feeds themselves.
- **Anonymising away the provenance.** The source, the licence and the
  attribution travel with every record, because a record that cannot
  name where it came from cannot be cleared for redistribution.
