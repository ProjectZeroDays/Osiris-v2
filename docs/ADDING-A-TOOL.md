# Adding a Tool

A tool is a card in the manifest, an entry in the capability allowlist, a
window on the screen, and — if it puts something on the map — a beacon
kind and a popup card. None of these is optional on its own, and the
tests below are what hold them together.

The rule that governs all of it: **deny by default**. A capability that
is not on a tool's allowlist is refused before anything runs, so adding
a capability is adding a power, and the allowlist is where the decision
is written down.

## The steps

### 1. The card

`src/config/security-tools.ts` — add an entry to `SECURITY_TOOL_CARDS`
(alongside the 13 registered security tools: Shodan, Zenmap, Metasploit,
Maltego, Sherlock, DedSec CCTV, Exploit-Index, SpyTV, Pegasus Pro, Ruflo,
nrSuite, StrykerApp, Drone RID):

```ts
{
  id: "my-tool",
  name: "My Tool",
  purpose: "One line saying what it is for, and what it is allowed to touch",
  href: "/tools/security/my-tool",
  Icon: Radar,
  state: "not-configured",
  riskClass: "passive-metadata",
  retentionDays: 90,
  requiresAsset: true,
  requiresConsent: false,
}
```

The fields that are decisions rather than details:

- **`riskClass`** — `passive-metadata` for anything that only reads,
  `report-import` for anything that ingests a report, `user-owned-media`
  for the operator's own cameras, `read-only-mcp` for a read-only MCP
  endpoint, and `active-transmit` for anything that puts a signal into
  the air. `wifite3` is the only tool in `active-transmit`, and the test
  that says so is in `manifest.test.ts`. A second one has to be
  deliberate.
- **`retentionDays`** — how long the findings are kept. `0` means the
  tool keeps nothing. The deadline is applied on the way into the
  database, so a finding can be pruned without anybody remembering to
  set it.
- **`requiresAsset` / `requiresConsent`** — whether a call needs an
  asset that belongs to the tenant, and whether it needs the operator
  to attest that they have permission. Both are checked by the
  dispatcher, not by the card.
- **`state`** — the card's default. The live state is derived on the
  server from the environment and the asset registry; the card's own
  value is what a client sees before the server has answered.

### 2. The icon

`src/components/security-tools/icons/` — one file, imported by the
file itself rather than through an index, so there is no import cycle.
The shape is the same for all of them: 24×24, `currentColor`,
`strokeWidth` 1.75, and `aria-hidden` handled by the parent.

Lucide has a mark for most things. A neutral custom mark is for a tool
whose vendor has a logo — a vendor logo is not ours to ship.

### 3. The capability allowlist

`src/lib/integrations/capabilities.server.ts` — the tool's entry in
`SAFE_CAPABILITIES`:

```ts
"my-tool": ["myCapability.doTheThing"],
```

This is the deny-by-default boundary. A capability that is not on the
list is refused with `INTEGRATION_CAPABILITY_DENIED` before the adapter
is reached, so the allowlist is the whole of what the tool can do.

The capability name is a promise about what the call does. `read`,
`import`, `export` and `configure` are different promises, and the
naming is what a reader of the audit trail sees.

### 4. The adapter

`src/lib/integrations/adapters/my-tool.server.ts` — one typed function.

- **No shell, no `eval`, no `new Function`.** The adapter reads an
  allowlisted upstream, imports a report, or is a pure link. It does
  not run the tool.
- **The upstream is named by the code**, never by the request. A URL
  from the caller is a caller choosing where the platform connects.
- **The response is untrusted.** Validate it against a schema before
  reading it, and bound what you read.
- **A finding says what it is.** `status: "observed"` for something
  that was measured, `"inferred"` for something the platform worked
  out, `"unverified"` for a lead. `confidence` is the number that goes
  with it.
- **The source and its terms.** If the adapter reads an upstream, the
  finding carries `source`, `license`, `sourceAttribution` and
  `shareAlike`, taken from `sourceProperties(...)` in
  `src/lib/integrations/licenses.ts`. A finding that cannot name its
  source cannot be cleared for redistribution.

### 5. The dispatcher

`src/app/api/integrations/[tool]/[action]/route.ts` — a case in the
switch. The order of the checks is the security property, and it does
not change:

1. Identity and shape — a client cannot assert its own tenant.
2. The capability must be on the tool's allowlist.
3. The asset must belong to the tenant, and a consent record must
   cover this exact capability.
4. The source must not be in cooldown.
5. The quota, charged before the work.
6. The adapter.
7. The findings are persisted, and the decision is audited.

### 6. The window

`src/components/tools/registry.tsx` — an entry in `TOOL_WINDOWS`, and
an entry in `TOOL_WINDOW_META` in `window-meta.ts` with the title, the
risk class and the tabs.

The window shell does the drag, the resize and the close. A registry
entry is only the body. Use the shared primitives in
`src/components/tools/ui.tsx` rather than rolling a new one — a window
that rolls its own tabs is a window whose tabs behave differently.

### 7. The beacon and the card, if it puts something on the map

`src/lib/map/beacons.ts` — a kind, with a style and an attribution
tier. `src/lib/map/popup-schemas.ts` — the card for that kind.

A finding becomes a beacon only if it says where it is. A finding
without coordinates is a row in a table, and the map is not the place
for it. A kind with no registered beacon is left out rather than drawn
as a generic dot — a marker that means nothing is worse than no
marker.

The window, the beacon and the card read the same schema, so a new kind
of detection is a schema and a registry entry rather than new UI.

### 8. The tests

- `src/lib/integrations/__tests__/manifest.test.ts` — the card, the
  allowlist, the retention and the risk class.
- `src/lib/integrations/__tests__/capabilities.test.ts` — the
  allowlist denies what is not on it.
- `src/lib/integrations/__tests__/adapters.test.ts` — the adapter's
  shape, and what it refuses.
- `src/components/tools/__tests__/registry.test.ts` — the window and
  its metadata.

## The checklist

- [ ] The card renders with the correct state
- [ ] The icon exists, and is 24×24 in `currentColor`
- [ ] The window opens and works
- [ ] The beacon kind has a style and a popup schema
- [ ] The capabilities are allowlisted, and the names say what they do
- [ ] The findings name their source and carry its licence
- [ ] The retention deadline is set
- [ ] The tests pass
- [ ] The licence is recorded in `docs/LICENSES.md`
- [ ] The upstream's terms have been read, and the licence is what it
      says — not a guess

## What is not negotiable

- **No generic runner.** There is no route that takes a command, and no
  capability that executes one.
- **No in-process execution.** The platform does not run the tool; the
  collection that does runs it in a worker, in a subprocess, with a
  scrubbed environment, and the platform reaches it only through
  allowlisted capabilities.
- **The state is server-derived.** A client cannot assert that a tool is
  ready.
- **Every decision is audited.** Every allow and every deny, with the
  reason.
