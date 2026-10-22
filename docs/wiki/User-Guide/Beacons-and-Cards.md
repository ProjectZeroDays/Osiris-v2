# Beacons and Cards

## Beacon / Card system (stub)

A **beacon** is a map marker tied to a finding; a **card** is the popup/details panel shown when a beacon is selected. Both read from `src/lib/map/beacons.ts` (kind/style) and `src/lib/map/popup-schemas.ts` (card schema). A new security integration must register both if it produces geolocated findings.
