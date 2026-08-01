# ADR 0003 — Lean Icon Save (Strip Default Catalog)

**Status:** Accepted
**Date:** 2026-04-30
**Supersedes:** none
**Superseded by:** none

## Context

`LocalStorageProvider.sessionSaveDiagram` and the server save paths persist the full Axoview model, including the entire `icons[]` array. The `icons[]` array conflates two concerns (see [ADR 0002](0002-icon-catalog-merge-on-load.md)) — the side-dock catalog and per-diagram persistence.

Today every saved diagram carries a copy of the bundled icon catalog. For default icons (`{ id, name, url: 'https://...' }`) the cost is small but non-zero — a few hundred bytes per icon, dozens of icons, persisted in every diagram, every save. For session storage the budget is ~5 MB total, shared across all diagrams; this overhead matters. For exports it bloats every JSON download.

The bundled catalog already exists in code (at the time of writing, `packages/axoview-lib/src/fixtures/icons.ts` — **retired by the 2026-08-01 addendum below**, which makes the catalog a host-injected parameter). Persisting it is pure redundancy.

## Decision

Always strip default-catalog icons from `model.icons` before writing.

This applies to **every write path**:

- Session storage (`sessionStorage.setItem` for diagrams).
- Server storage (`PUT /api/diagrams/:id`, both fs and R2 backends — strip before the network call).
- Export JSON (single-diagram and within project zips).

The strip rule:

```
keep icon  ⟺  icon.id ∉ bundledFixtures.byId
              ∨  icon differs from bundledFixtures.byId[icon.id] in any user-visible field
```

In other words: drop an icon iff it is a *pure* duplicate of a bundled fixture. Custom icons (unknown id) and overridden defaults (same id, different metadata) are preserved verbatim.

Load-time rehydration is handled by [ADR 0002](0002-icon-catalog-merge-on-load.md) — the loader unions `bundledFixtures` back in before populating the model store.

**As implemented (ADR⇄code, v3.7.0).** Only the **export** path applies this exact fixture-diff rule (via `stripDefaultIcons` in [`leanSave.ts`](../../packages/axoview-lib/src/utils/leanSave.ts)). The **session and server** write paths strip with a simpler predicate — keep only `icon.collection === 'imported'` (`leanIfModel` in [`leanModel.ts`](../../packages/axoview-app/src/services/storage/leanModel.ts)). The two differ for an *overridden* bundled icon (same id, changed metadata): the fixture-diff rule keeps it, `collection==='imported'` drops it. Because `bundledFixtures` is currently **empty by design** (the app injects `@isoflow/isopacks` — see ADR 0002), there is nothing to strip on any path, so the divergence is latent, not observable today. Reconciling the write paths onto one rule is an open item.

**2026-05-02:** Lean-save now also persists `requiredPacks: string[]` — the unique non-isoflow/imported collections referenced by `items`. Loaders consult it to lazy-fetch the right icon packs before the merge in ADR 0002 runs; without this signal, items end up pointing at icon ids that nothing in the loaded catalog can resolve. The field is **preserved** (not re-derived) when the input is already lean — otherwise a round-trip through storage wipes the list to `[]`. Authoritative re-derivation only runs when every `item.icon` resolves against `model.icons`.

## Consequences

**Positive:**

- Session-mode workspaces hold materially more diagrams within the ~5 MB budget — empirically the icon array dominates per-diagram size for diagrams with few items.
- Export JSON files shrink, especially for small diagrams (the icon catalog can be larger than the diagram content itself).
- Server payloads shrink → faster auto-save round-trips.
- The catalog-rehydration path runs on every load, so it cannot bit-rot — no class of bug where "load works for new diagrams but not old saves" can develop quietly.

**Negative / risks:**

- **Reliance on ADR 0002.** If the load-merge contract is broken, the side dock empties after load. Mitigated by the unit test required in ADR 0002.
- **Backward compatibility of older saves.** Saves made before this change still contain the bundled catalog. They must continue to load. The merge in ADR 0002 is union-by-id — duplicate entries from old saves collapse harmlessly.
- **Catalog version drift.** If we ship a build where `bundledFixtures` is missing an icon that older saves persisted as a "default," that icon now becomes effectively a custom icon (preserved on save because its id no longer matches the catalog). This is the desired behavior — we never silently lose a user's icon.

## Implementation notes (non-binding)

- The strip helper lives in `packages/axoview-lib/src/utils/leanSave.ts` (new) so server, session, and export call sites share one implementation.
- `bundledFixtures.byId` is a memoized `Map<string, Icon>` derived from the fixture array.
- "Differs in any user-visible field" compares: `name`, `url`, `collection`, `category` — but **not** any future runtime-only fields (e.g. cached SVG dimensions). Keep the comparison conservative — a diff defaults to "keep."
- The opposite of strip — the merge — already has its home in [useInitialDataManager](../../packages/axoview-lib/src/hooks/useInitialDataManager.ts) per ADR 0002.

## Acceptance criteria

- **Unit test:** model with `icons` = `bundledFixtures` (verbatim), passed through `leanSave`, produces `icons: []`.
- **Unit test:** model with `icons` = `[...bundledFixtures, customIcon]` produces `icons: [customIcon]`.
- **Unit test:** model with `icons[0]` = bundled fixture but `name` changed → fixture is preserved (override wins).
- **Round-trip test** *(specified; not implemented as of v3.7.0)*: a session-save→session-load round-trip asserting the merged `icons` array is element-wise equal is **not present**. `leanSave.test.ts`'s "round-trip: strip then merge" is a pure-function composition (`stripDefaultIcons` → merge) with no `sessionStorage`/provider; `LocalStorageProvider.test` does not save-then-load to compare merged icons. Open test gap.
- **Manual verification:** the side dock after load shows the full bundled catalog (covered by ADR 0002 tests; called out here because the bug history lives in this surface).

---

### 2026-08-01 addendum — one lean-save: lib-owned algorithm, host-injected catalog

**Owner ruling 2026-08-01**, implemented in the exploratory-remediation wave 4.
The accepted text above is left as shipped; this addendum settles WHERE the
implementation lives, which it never stated — and which is why there came to be
two of it.

**What the campaign found (F5/ICON-01/02).** ADR 0003's lean-save existed twice,
with different answers for the same model:

- `axoview-lib/src/utils/leanSave.ts` compared against `src/fixtures/icons.ts`,
  which exported `[]`. With an empty catalog `stripDefaultIcons` was the
  identity function and `mergeBundledFixtures` was inert, so **"Export as JSON"
  and the project ZIP wrote every icon the session had loaded** — the whole AWS
  / GCP / Azure / Kubernetes / Material catalog, SVG payloads and all — into the
  file users mail around.
- `axoview-app/src/services/storage/leanModel.ts` carried its own stricter rule
  (`collection === 'imported'`) used by every StorageProvider, which wrote one
  icon for that same model — and discarded two kinds of user data doing it
  (A2/STOR-14).

There was in fact a **third**: the app's jest mock stubbed `stripDefaultIcons`
as `(model) => model`, so the app's own tests ran against an identity function
and could not see either behaviour.

**The rule.**

> **The ALGORITHM lives in the lib. The CATALOG is a parameter the host
> injects. Neither side holds a copy of the other's half.**

The dependency direction decides it: the lib cannot import from the app, and it
must not bundle the app's icon catalog either — the lib publishes standalone
under a bundle-size gate, and a catalog is host data.

1. `utils/leanSave.ts` keeps the strip-then-merge algorithm and takes
   `catalog: readonly Icon[]`. An **empty** catalog means "the host told us
   nothing" and strips NOTHING — a host that forgets to inject loses bytes,
   never data.
2. `src/fixtures/icons.ts` is **retired**. Any catalog needed by a test is
   declared in that test and is test-only.
3. The app owns ONE canonical catalog module,
   `services/icons/bundledCatalog.ts` (`ALL_ICON_PACK_NAMES` + core icons + the
   live loaded-pack registry). Two readers: lean-save injection, and
   **A2/STOR-14's override detection** — which stayed open in wave 1 precisely
   because the app had no such module.
4. `leanIfModel` composes rather than re-derives. The one thing that stays
   app-side is the question only a host can answer: **which collections this
   build can rehydrate**.

**Rejected alternative, recorded.** Filling the lib's fixture with the real
catalog. It duplicates the catalog on both sides of the package boundary — the
exact class this closes — bloats the standalone bundle, and drifts the moment a
pack changes. **The empty fixture was a symptom; the defect was that a library
held an opinion about host data.**

**One deliberate divergence.** The SAVE path drops a pack icon whose pack is not
currently loaded (its `requiredPacks` entry refetches it); the EXPORT path keeps
it, because the lib cannot tell it from the user's own icon. This is host
knowledge the lib has no way to hold, and it is pinned as such by §4 of the
class gate rather than papered over.

**Gate.** [`leanSaveSingleImplementation.contract.test.ts`](../../packages/axoview-app/src/services/__tests__/leanSaveSingleImplementation.contract.test.ts)
— one definition, no app-side re-implementation, no lib-side catalog, and the
two halves compared on the same input. Verified red twice: once for a planted
duplicate, and once more after the first attempt exempted `leanModel.ts`
wholesale and so missed a duplicate planted in the very file it used to live in.
