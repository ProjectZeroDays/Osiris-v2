# 07–13 Implementation Status

## 07 v9 Shared Foundation — ✅ Mostly complete
- DB schema (`src/db/schema.ts`): tenants, users, findings — complete
- DB client (`src/db/client.server.ts`): complete
- Auth (`src/lib/auth/context.server.ts`, `authz.server.ts`): real session + fallback
- Capabilities (`capabilities.server.ts`): deny-by-default allowlist
- State derivation (`state.server.ts`): complete
- Audit (`audit.server.ts`): append-only buffer (DB swap pending)
- Retention (`retention.server.ts`): per-tool deadlines
- Health / Readiness (`health.server.ts`, `readiness.server.ts`): complete
- Rate / Quota (`quota.server.ts`): exists; wire into dispatcher pending
- First-run UX (`src/components/FirstRunScreen.tsx`): added v9 Part 12
- Docker / Security headers: verify `.env` + compose
- Map refresh: layer refresh logic needs verification

## 08 v10 Wifite3 / Quantum-CLI — ✅ Partial / complete
- Manifest entries (`wifite3`, `quantum-cli`): complete
- Icons (`WifiIcon`, `QuantumCliIcon`): complete
- Adapter (`wifite3.server.ts`): complete
- Dispatcher additions (`tools/route.ts`): complete
- Docker WiFi passthrough: verify profile
- Quantum-CLI disabled-by-policy: verified (no API route, no capabilities)

## 09 v11 Universal Tool UI & Beacons — ✅ Partial
- Window registry / beacon kinds: partially implemented via OsirisMap overlays
- Popup / detail panel: existing (`ShaderPost`, `LiveNewsPreviews`, satellite/popup cards)
- Window↔map↔popup navigation loop: existing
- Full universal window primitives: needs final closure

## 10 v12 Full UI & Integration Closure — 🔄 Partial
- All security-tool cards (13) registered
- Most adapters, authz, audit, retention in place
- API dispatcher routes present (`integrations/tools/route.ts`)
- Remaining gaps: full integration tests, complete window registry closure

## 11 v13 Scanner / Cell / Police / AI — ✅ Partial
- Manifest (`scanner-feeds`, `imsi-catcher`, `police-reports`, `ai-settings`): complete
- Icons (`ScannerIcon`, `CellTowerIcon`, `PoliceIcon`, `AiProvidersIcon`): complete
- Adapters (`scanner-feeds.server.ts`, `imsi-catcher.server.ts`, `police-reports.server.ts`, `ai-settings.server.ts`): complete
- CAP adapter: present in scanner-feeds adapter
- AMBER/Silver/Blue classifier: needs wire-up to alert window

## 12 v14 Verification / Wiki — 🔄 Partial
- `docs/README.md`: enhanced with v1.0.3
- `docs/GAP-ANALYSIS.md`: exists
- `docs/ADDING-A-TOOL.md`: exists
- Test files (`__tests__`): many present (manifest, capabilities, authz, adapter, retention tests)
- Full README update: done (main README + docs/README)
- Wiki pages (Getting-Started, User-Guide, API): partially complete

## 13 v15 Emergency Broadcasts & AMBER Alerts — 🔄 Partial
- CAP adapter: in scanner-feeds adapter
- `scanner-feeds` layer: in manifest
- AMBER / Silver / Blue family logic: needs classifier wire-up
- SSE live-stream endpoint (`/api/scanner`): needs verification
- Popup schema for family-aware alerts: needs implementation
