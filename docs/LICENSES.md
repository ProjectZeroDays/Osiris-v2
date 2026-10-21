# Licences and attribution

OSIRIS is MIT. **Each data source has its own licence**, and some of
them oblige whoever redistributes the data to do something.

This page is the human-readable side of a record that also exists in the
code: `src/lib/integrations/licenses.ts` holds the same table, and the
adapters write the licence into the findings they produce. A test holds
the two together — a source added to the code without a row here, or a
row here without an entry in the code, fails the build.

## Why a licence is recorded with the data

A finding that names its source can be cleared for redistribution. A
finding that does not can only be asked about. The platform writes the
source, the licence, the attribution and whether the licence is
share-alike into the finding's properties, so those questions are
answerable later from the record rather than by going back to the
adapter and working out what it read.

## Source licences

| Source | Licence | Obligation | Where the terms are |
|--------|---------|------------|---------------------|
| `opencellid` | CC-BY-SA-4.0 | **Share-alike** + attribution | https://opencellid.org/ |
| `beacondb` | CC0-1.0 | None | https://beacondb.net/ |
| `osm` | ODbL | **Share-alike** + attribution | https://www.openstreetmap.org/copyright |
| `carto` | ODbL (OSM-derived basemap) | **Share-alike** + attribution | https://carto.com/basemaps |
| `nws` | Public domain | Attribution | https://www.weather.gov/ |
| `ipaws` | Public domain | Attribution | https://www.fema.gov/emergency-managers/risk-analysis/knowledge-systems/ipaws |
| `state` | Varies | Attribution | The state's own terms |
| `usgs` | Public domain | Attribution | https://earthquake.usgs.gov/ |
| `firms` | Public domain | Attribution | https://firms.modaps.eosdis.nasa.gov/ |
| `socrata` | Varies per dataset | Attribution | https://dev.socrata.com/ |
| `arcgis` | Varies per dataset | Attribution | https://developers.arcgis.com/ |
| `broadcastify` | Provider terms | Attribution | https://www.broadcastify.com/ |
| `openmhz` | Provider terms | Attribution | https://openmhz.com/ |
| `shodan` | Provider terms (API) | Attribution | https://www.shodan.io/ |
| `haveibeenflocked` | Provider terms | Attribution | https://haveibeenflocked.com/ |
| `exploit-index` | Untrusted metadata; no redistribution | Attribution | — |

"Where the terms are" is a starting point, not a legal review. The rows
that say *Provider terms* or *Varies* are rows where the terms have not
been read for this deployment. Read them before shipping a product that
redistributes the data.

## The share-alike warning

**OpenCellID (CC-BY-SA-4.0)** and **OpenStreetMap (ODbL)** carry
share-alike clauses. If you redistribute a database derived from them,
the derived database may inherit the licence. Check before shipping a
derived product.

What this means in practice, for this platform:

- The cell-tower database the platform reads is either OpenCellID's or
  BeaconDB's, depending on whether `OPENCELLID_KEY` is set. A finding
  that judges an observation against those towers carries the tower
  source's licence, so an anomaly can be told apart from a bare
  coordinate.
- A **tower location** is a published fact. An **anomaly** — a 2G
  serving cell where LTE was expected — is the operator's own
  observation, compared against a published fact. The platform records
  both: the observation is the operator's, the comparison carries the
  comparison's terms.
- The map's basemap and the place names come from OSM-derived data.
  The platform displays the attribution it is required to display
  (`© OpenStreetMap contributors`), but it does not persist the
  basemap tiles, so it holds no derived database of them.
- **The platform's own findings table is a derived database** once a
  finding that carries share-alike terms is written into it. Exporting
  findings that carry `shareAlike: true` is the case that needs a
  decision before the export is made.

## Attribution

Every record carries `attribution`. The UI shows it in popups, and
exports include it. A record whose source is not in the table above is
a record whose provenance is unrecorded, which the test catches.

## Adding a source

1. Add the source to `SOURCE_LICENSES` in `src/lib/integrations/licenses.ts`,
   with the licence, the attribution, the obligation and where the terms
   are stated. If the terms have not been read, say so — write
   "Provider terms" rather than guessing a licence.
2. Record it in the adapter that reads it, with `sourceProperties(source)`,
   so the finding carries the terms.
3. Add the row to the table above.
4. The test will tell you if you missed a step.

## What is not covered

The licence of the code's own dependencies is the packages' business,
and is recorded in `package-lock.json` and the projects' own licence
files. This page is about the data the platform reads, which the
platform is responsible for.
