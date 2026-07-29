# Exploratory campaign ledger

**Method:** [APPROACH.md](APPROACH.md) · **Dedupe/seed reference:** [coverage-baseline.md](coverage-baseline.md) · **Generated:** 2026-07-29

This file is the campaign's resume point. Update the row (and the area file) **after every hypothesis verdict**, not at session end. Statuses: `OPEN` → `IN PROGRESS` → `DONE` (≥10 counted, all proposed rows resolved or DEFERRED-with-reason).

| Area | Name | Status | Counted | Bugs | Suspects | Seeds (seams/invariants/gaps) |
|------|------|--------|---------|------|----------|-------------------------------|
| E1 | [History & undo/redo engine (dual-store patches)](areas/E1-history-undo-redo.md) | OPEN | 0 / 10 | 0 | 0 | 8/5/12 |
| E2 | [Reducers & cross-store cascades](areas/E2-reducers-cascades.md) | OPEN | 0 / 10 | 0 | 0 | 8/7/8 |
| E3 | [Scene actions, transactions & paste assembly](areas/E3-scene-actions-paste.md) | OPEN | 0 / 10 | 0 | 0 | 9/8/7 |
| E4 | [Clipboard, schemas, initial load & session/UI state](areas/E4-clipboard-schemas-load.md) | OPEN | 0 / 10 | 0 | 0 | 8/22/6 |
| I1 | [Pointer pipeline, mode dispatcher & keyboard routing](areas/I1-pointer-modes-keyboard.md) | OPEN | 0 / 10 | 0 | 0 | 10/20/10 |
| I2 | [Touch & pen gesture state machine](areas/I2-touch-pen-gestures.md) | OPEN | 0 / 10 | 0 | 0 | 10/22/8 |
| I3 | [Selection, drag engine & lasso/freehand marquee](areas/I3-selection-drag-lasso.md) | OPEN | 0 / 10 | 0 | 0 | 10/20/14 |
| I4 | [Connector draw, reconnect & waypoint interactions](areas/I4-connector-interactions.md) | OPEN | 0 / 10 | 0 | 0 | 9/19/11 |
| I5 | [Pan/right-click, context menu, placement tools & transform handles](areas/I5-pan-menu-placement-transform.md) | OPEN | 0 / 10 | 0 | 0 | 11/15/17 |
| R1 | [Projection & coordinate transforms (iso/2D/screen, off-grid)](areas/R1-projection-transforms.md) | OPEN | 0 / 10 | 0 | 0 | 8/12/13 |
| R2 | [WebGL sprite-batch substrate (atlas, shaders, context loss)](areas/R2-webgl-substrate.md) | OPEN | 0 / 10 | 0 | 0 | 9/3/8 |
| R3 | [Bulk GPU scene layers (build/invalidation, style parity, LOD)](areas/R3-gpu-scene-layers.md) | OPEN | 0 / 10 | 0 | 0 | 10/6/11 |
| R4 | [Renderer orchestration (culling, hybrid promotion, fit-to-view)](areas/R4-renderer-orchestration.md) | OPEN | 0 / 10 | 0 | 0 | 10/0/11 |
| R5 | [DOM overlays & presentation parity (labels, hit proxies, grid, compositor)](areas/R5-dom-overlays-parity.md) | OPEN | 0 / 10 | 0 | 0 | 9/23/14 |
| A1 | [Diagram lifecycle: open/save/dirty/autosave state machine](areas/A1-diagram-lifecycle.md) | OPEN | 0 / 10 | 0 | 0 | 10/20/14 |
| A2 | [Storage providers & places model (local/session/Drive, move-to-Drive)](areas/A2-storage-places.md) | OPEN | 0 / 10 | 0 | 0 | 17/7/8 |
| A3 | [Project ZIP & import/export (JSON, ZIP, image)](areas/A3-zip-import-export.md) | OPEN | 0 / 10 | 0 | 0 | 9/9/6 |
| A4 | [File explorer, folders & multi-diagram management](areas/A4-file-explorer-multidiagram.md) | OPEN | 0 / 10 | 0 | 0 | 9/3/14 |
| A5 | [App chrome: boot, dialogs, settings, i18n, theming, storage hygiene](areas/A5-app-chrome-boot-i18n.md) | OPEN | 0 / 10 | 0 | 0 | 10/6/14 |
| S1 | [Google identity & token lifecycle (GIS auth store, gates)](areas/S1-google-identity-auth.md) | OPEN | 0 / 10 | 0 | 0 | 7/7/6 |
| S2 | [Share backend: session snapshots, routes, Express/Worker parity](areas/S2-share-backend.md) | OPEN | 0 / 10 | 0 | 0 | 9/6/9 |
| S3 | [Drive-native sharing & readonly preview ladder](areas/S3-drive-sharing-preview.md) | OPEN | 0 / 10 | 0 | 0 | 10/14/9 |
| F1 | [Text, labels-as-text & rich-text editing (inline canvas edit, notes, sanitization)](areas/F1-text-richtext-editing.md) | OPEN | 0 / 10 | 0 | 0 | 0/9/12 |
| F2 | [View/preview/presenter modes & annotation overlay](areas/F2-view-modes-annotations.md) | OPEN | 0 / 10 | 0 | 0 | 0/14/16 |
| F3 | [Styling system (docked strip, bulk styling, color picker, style round-trips)](areas/F3-styling-system.md) | OPEN | 0 / 10 | 0 | 0 | 0/6/9 |
| F4 | [Layers panel & z-order (visibility, locking, assignment, ordering)](areas/F4-layers-zorder.md) | OPEN | 0 / 10 | 0 | 0 | 0/17/16 |
| F5 | [Icons & catalog (packs, custom icons, merge-on-load, icon resize)](areas/F5-icons-catalog.md) | OPEN | 0 / 10 | 0 | 0 | 0/7/11 |

## Wave order (suggested)

Engine (E1–E4) and interaction (I1–I5) first — highest seam density and everything downstream depends on them; then rendering (R1–R5), app shell (A1–A5), share/backend (S1–S3), feature cuts (F1–F5). Any order is fine as long as LEDGER stays current; areas are independent by design.

## Infrastructure status

- [ ] `packages/axoview-e2e/playwright.explore.config.ts` + `fixtures/explore.fixture.ts` (console/pageerror oracle, `expectStoreInvariants`, schema oracle)
- [ ] `packages/axoview-lib/jest.explore.config.js` + `'/__explore__/'` added to the default config's `testPathIgnorePatterns`
- [ ] Root scripts: `explore:e2e`, `explore:unit`
- [ ] First shared-oracle helper landed and used by ≥1 probe

## Cross-area mop-up (final wave)

After all areas are DONE: completeness-critic pass per APPROACH §8 — list the area *pairs* no hypothesis crossed, propose one hypothesis per suspicious pair.

## Bugs filed

*none yet — every BUG verdict adds a row: ID · one-line symptom · known_issues.md anchor*
