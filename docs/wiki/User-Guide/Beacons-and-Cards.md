# Beacons and Cards

## Overview
OSIRIS uses beacon cards (UI cards) to surface alerts, scanner findings, and map entities. Each card is driven by `popup-schemas.ts` and classified by `AlertClassifier`.

## Alert Families
- **Amber** (`amber-alert`): Child abduction — immediate response; fields include `family`, `severity`, `certainty`, `provenance`.
- **Silver** (`silver-alert`): Missing elderly — high priority; same core fields.
- **Blue** (`blue-alert`): Law enforcement — active incident.
- **Unknown** (`cap-alert`): Unclassified CAP feed.

## Card Usage
Cards render on the map via `OsirisMap.tsx` and in the alert panel. Use `first-run` screen when no users/tenants exist.

## Security
All card payloads pass through `popup-schemas` validation. CSP notes and security headers are documented in `.env.template`.
