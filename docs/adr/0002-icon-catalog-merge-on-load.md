# ADR 0002 — Icon Catalog Merge on Load

**Status:** Accepted
**Date:** 2026-04-30
**Supersedes:** none
**Superseded by:** none

## Context

The Axoview model carries an `icons[]` array. This array is two things conflated:

1. **The side-dock catalog** — what the user can drag onto the canvas.
2. **The persistence shape** — what gets saved to JSON when a diagram is exported or written to storage.

Conflating these has produced at least one regression historically: loading a saved diagram replaced the side-dock catalog with `model.icons`, so the user lost access to bundled (default) icons that weren't already on the diagram. The dock would shrink to just the icons referenced in the saved file.

[ADR 0003](0003-session-storage-lean-icon-save.md) makes this worse on paper — it strips default-catalog icons from saves entirely. Without an explicit merge contract on load, the side dock would always be empty after loading a stripped diagram.

We need to lock the relationship between the bundled fixture catalog, the model's `icons[]`, and the side dock so the bug cannot return.

## Decision

The side-dock icon catalog is **always** computed as:

```
sideDockCatalog = bundledFixtures ∪ model.icons
```

Where:

- `bundledFixtures` was a static array exported from `packages/axoview-lib/src/fixtures/icons.ts`. **As of 2026-05-01 that array was empty by design**, and **as of the [ADR 0003 addendum 2026-08-01](0003-session-storage-lean-icon-save.md) the module is RETIRED** — the catalog is a parameter the host injects, so `mergeBundledFixtures(model, catalog)` takes it explicitly. The paragraph below is preserved for the reasoning; read `catalog` wherever it says `bundledFixtures` — the real catalog is supplied by the consuming app (the Axoview PWA injects `@isoflow/isopacks` into the model at create-time). The merge contract still holds: an empty `bundledFixtures` makes the union `≡ model.icons`, and any future library-bundled defaults can be added to the file without changing call sites.
- `model.icons` is whatever was loaded from JSON (post-strip, may be empty or contain only custom icons).
- Union is by `id`, with `model.icons` taking precedence on collision (so a user override of a default icon's metadata wins).

`model.icons` **never replaces** the catalog. The load path must merge.

### Where the merge happens

The merge belongs in the loader, not in every consumer. Consumers (the side dock, item-rendering hooks) read from a single derived selector that has already merged.

Concretely:

- The `load(modelData)` flow in [useInitialDataManager](../../packages/axoview-lib/src/hooks/useInitialDataManager.ts) is the single entry point for hydrating the model store.
- Before writing to `useModelStore`, `load` merges `bundledFixtures` into `modelData.icons` per the rule above.
- Every other consumer reads `useModelStore(state => state.icons)` and gets the merged array. No consumer reaches into `bundledFixtures` directly.

### Save path (mirror)

When writing the model out (to storage, to export JSON), the lean-save pass strips any icon whose `id` exists in `bundledFixtures` and whose metadata is unchanged. Custom icons and user-overridden defaults are preserved. See [ADR 0003](0003-session-storage-lean-icon-save.md).

## Consequences

**Positive:**

- The side dock is always complete regardless of what's saved.
- ADR 0003's lean-save is safe to ship — load-time merge guarantees no side-dock regression.
- Future icon catalogs (custom packs, user uploads) plug into this contract by extending the union, not by changing consumers.
- The `model.icons` field can shrink to zero in stripped saves without breaking anything.

**Negative:**

- A test must enforce the contract; without it, a future refactor of the load path could silently break this again. We add the test as part of accepting this ADR.
- A user who *deletes* a bundled icon cannot persist that deletion — the merge will always re-add it. This is intentional. If we later want "hide bundled icons," it goes in user preferences, not the model.

## Acceptance criteria

- **Unit test (must exist):** load a diagram whose `icons[]` is empty; assert `useModelStore.getState().icons` contains every entry from `bundledFixtures`.
- **Unit test:** load a diagram whose `icons[]` contains one custom icon; assert the merged array has `bundledFixtures.length + 1` entries and the custom icon is present.
- **Unit test:** load a diagram whose `icons[]` contains an entry with the same `id` as a bundled icon but different metadata; assert the loaded version wins.
- **Integration test:** export-then-import a diagram with a custom icon; assert the side dock contains both the custom icon and all defaults.

> **As-built note (ADR⇄code, v3.7.0).** `bundledFixtures` is **empty by design** — the app injects `@isoflow/isopacks` at runtime rather than shipping a bundled catalog. This changes how two criteria above stand:
> - The **override-wins unit test** (same `id`, different metadata) is **intentionally not present**: with no bundled defaults the override path is unreachable in production. That rationale currently lives only as a comment in [`leanSave.test.ts`](../../packages/axoview-lib/src/utils/__tests__/leanSave.test.ts) (`describe('mergeBundledFixtures (ADR 0002)')`) — recorded here as the ADR-level waiver.
> - The **export-then-import integration test** is **not present** at the e2e layer: [`import-export-json.spec.ts`](../../packages/axoview-e2e/tests/import-export-json.spec.ts) covers import (J7) and export (J8) separately, not the round-trip dock assertion (and "all defaults" is vacuous while `bundledFixtures` is empty). Open test gap.

## Lifecycle — imported-icon delete + missing-icon tombstone (2026-05-18, MQA #26)

The merge contract above covers *additions* to the catalog. This section covers the inverse operation — the user removing an imported icon — and the rendering contract for items whose `icon` id no longer resolves.

### Delete scope

Only icons whose `collection === 'imported'` are deletable. Bundled-fixture icons and isopack icons (`aws`, `gcp`, `azure`, `kubernetes`, `material`) are non-deletable from the side dock:

- Bundled fixtures would be re-merged on the next load anyway (Decision, above).
- Isopack icons are managed at the *pack* level in Settings → Icon Packs.

The × badge on the Elements panel tile is rendered only when `icon.collection === 'imported'` (see `Icon.tsx`).

### Workspace-wide usage scan

Before deletion, the confirm dialog lists every diagram that references the icon id. The scan is split:

- The library has no notion of "other diagrams." It only knows the active model.
- The consuming app injects an `iconUsageScan: (iconId) => Promise<IconUsageReport[]>` callback via the `<Axoview>` prop. The PWA's `services/iconUsage.ts` uses `StorageProvider.listDiagrams()` + `loadDiagram(id)` to count references across the workspace, preferring the in-memory current diagram's items so unsaved edits count.
- When no callback is injected (tests, stripped embeds), `ElementsPanel` falls back to a current-diagram-only scan.

Failures inside the scan resolve to `[]` (with `console.error`) rather than blocking — the warning copy in the dialog already states the consequence of proceeding, so failing closed would frustrate without protecting.

### Warn-and-allow, not block

The dialog surfaces the usage list and lets the user proceed. The user retains agency; affected items remain in their diagrams and render the tombstone (below) until the icon is re-imported under the same id.

### Tombstone fallback

`useIcon(id)` now distinguishes three cases:

1. `id` is `undefined` / falsy → `DEFAULT_ICON` (today's behavior; a freshly-created blank item).
2. `id` resolves in `model.icons` → that icon.
3. `id` is set but does not resolve → `TOMBSTONE_ICON` (new) — a faded dashed-square SVG so the canvas keeps the spatial layout.

The tombstone path covers *both* the post-delete state and items pasted in from a diagram that referenced a never-imported id. One render path, no special case for "this was deleted."

Re-importing an icon under the same `id` resurrects every tombstoned item automatically (the merge already covers this).

### Undo

`modelActions.set({ icons: filtered })` pushes a history entry (see `modelStore.tsx`). `Ctrl+Z` restores the icon, which un-tombstones every item that referenced it. Cross-diagram references aren't separately tracked — they un-tombstone in place once the id reappears in `model.icons`.

### Why this can't bit-rot

The delete path goes through the same `modelActions.set({ icons })` channel that the import path uses, so the lean-save (ADR 0003) and load-merge contracts apply unchanged. The only new invariant: `Icon.tsx` must keep its `icon.collection === 'imported'` gate — without it, the × would render on isopack tiles whose deletion isn't durable.
