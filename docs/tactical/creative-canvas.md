# Tactical — Creative Canvas (asset import, terrain, tiled paths)

> **Read first:**
> - [ADR 0048 — Imported Image Asset Pipeline](../adr/0048-imported-image-asset-pipeline.md)
> - [ADR 0049 — Asset Store and Reference Model](../adr/0049-asset-store-and-reference-model.md) — **§7–§13 closed 2026-08-10**
> - [ADR 0050 — Terrain Paint Layer](../adr/0050-terrain-paint-layer.md)
> - [ADR 0051 — Tiled Paths on Connectors](../adr/0051-tiled-paths-on-connectors.md)
> - [ADR 0003](../adr/0003-session-storage-lean-icon-save.md) + [ADR 0002](../adr/0002-icon-catalog-merge-on-load.md) — lean save / catalog merge, the rules ADR 0049 generalises
> - [ADR 0038](../adr/0038-webgl-instanced-render-substrate.md) — the substrate everything draws into
> - [docs/guidelines/ux-principles.md](../guidelines/ux-principles.md) — mandatory for the import dialog and the tool modes
> - [docs/workflow.md](../workflow.md) — session cadence
>
> **Status:** Not started · **Owner:** molikas · **Last updated:** 2026-08-10
>
> This is a **short-lived working doc.** Delete it after the work merges; ADRs are the durable record. PLAN.md gets a one-line entry referencing the ADRs once shipped — see "Wrap-up" below.

## Session startup checklist

1. Read this file fully.
2. Read each linked ADR.
3. Skim `PLAN.md` Phase Status Dashboard **for context only** — do not modify it during this work.
4. Use `TodoWrite` to track sub-tasks below.
5. Mark `[x]` as work completes.
6. On completion, follow the "Wrap-up" section to update PLAN.md with a single line.

## Goal

Make Axoview's engine medium-agnostic. The same scene graph that draws an
architecture diagram should draw a village, a battle map, or a child's world
sketch — by letting users bring their own art in cleanly, paint ground with it,
and run tiled paths between things.

Four capabilities, in dependency order: a real **asset importer** (crop, matte,
resize, encode), an **asset store** that can hold the result, a **terrain paint
layer**, and **tiled paths** on connectors.

**Not a goal:** an art tool. We do not draw, we do not do general matting, and
we do not author tilesets. Users bring finished art (typically model-generated
PNGs) and we make it usable.

**Not a goal:** changing the professional diagramming surface. Every addition is
opt-in and invisible to a user who never imports a tile.

## Scope

### In scope

- One shared, tested image-import pipeline replacing the two duplicated inline resizes.
- An import dialog with crop, background removal, and a live preview.
- WebP output at the resolution the renderer can actually sample.
- A content-addressed asset store across IndexedDB / shared library / Drive.
- `terrain` as a new per-view entity, painted with brush tools.
- `pathTileId` on connectors, rendered through the terrain emitter.
- Fixing `ICON_COMPARE_FIELDS`' missing `scale` (pre-existing bug, same blast radius).
- Adding asset bytes to the Storage Manager gauge.

### Out of scope

- Raising `ICON_ATLAS_CAP` above 256 (separate, gated on atlas-pressure measurement).
- Multi-cell tile footprints, per-cell tile rotation/variants.
- A tileset marketplace or user-shared library.
- Retroactively re-importing already-degraded 128 px assets.
- Animation of any kind.

## Locked decisions (from design discussion 2026-08-10)

| # | Decision |
|---|---|
| 1 | Scaffold the full arc as four ADRs under one tactical — the asset-store choice is shared by all four, so the importer must be designed knowing where it leads. |
| 2 | Input is PNG (what users upload); **storage format is WebP**, with PNG fallback where the browser cannot encode WebP. |
| 3 | Assets live in three tiers: a **limited curated shared library**, **IndexedDB** locally, and **Google Drive** for the user's own. No server storage — the Cloudflare deploy stays storage-less per ADR 0009. |
| 4 | Terrain is a **new entity** — a sparse map of painted cells — not an extension of `Rectangle`. Rectangles can only ever be rectangular; ground is freeform. |
| 5 | Terrain cells are **not selectable**. A named, documented exception to ADR 0006; a painted cell has no identity. |
| 6 | Tiled paths are **derived terrain cells from a connector route**, not a new connector renderer. This avoids rotating pre-sheared isometric art. |
| 7 | Downscaling is **step-halved**, never a single `drawImage`, and the stored aspect ratio is the **cropped subject's** — no square letterboxing. |
| 8 | Background removal (corner-seeded flood fill) is **core, not optional** — model-generated art arrives with baked-in backgrounds and is unusable as a sprite without it. |
| 9 | ~~ADR 0049 ships incomplete on purpose.~~ **Closed 2026-08-10** — all thirteen open decisions resolved against comparative research (Excalidraw, tldraw, draw.io, Figma, Tiled/Godot/Unity, current MDN/WebKit storage docs). Rows 10–19 are those rulings. |
| 10 | **Drive layout: one file per asset**, digest-named, under an Axoview `assets/` tree, digest in `appProperties`. Not `appDataFolder` (deleted on app uninstall). The manifest is a **rebuildable cache** — `files.list` + `appProperties` works under `drive.file`, verified against the shipped `GoogleDriveProvider` (`APP_MARKER_Q`). The ADR's original "unrecoverable" claim was wrong and has been corrected in place. |
| 11 | **Signed-out users: allow import, never block.** One-time honest notice, project-ZIP export as the escape hatch, sign-in pitched as the durability upgrade. |
| 12 | **Signed out, IndexedDB is PRIMARY storage, not a cache.** App-side eviction never runs for anonymous users. Highest-consequence invariant in the arc. |
| 13 | **Shared viewing: inline.** The Drive save format reuses the §5 export path (assets inlined as data URLs); `sessionStorage` keeps the lean referenced form. One proxy hit per anonymous view, no per-asset ACL sync. draw.io's model, which ADR 0042 already mirrors. |
| 14 | **GC: two code paths that never merge.** IndexedDB LRU evicts only when unused ∧ ~24 h grace elapsed ∧ provably present in Drive/shared library. Drive is **never** auto-deleted — user-confirmed only, via a Storage Manager review driven by a generalised `IconUsageScan`. |
| 15 | **Quota: request `persist()` on first asset import** (user gesture). Check `persisted()` first; denial is normal — gauge state, never a modal. Catch `QuotaExceededError` on every write. A Safari grant does not stop the 7-day ITP wipe. |
| 16 | **Migration: convert on load in memory, write on next save** (tldraw v1→v2). The runtime holds only `axo-asset:` refs; the file changes only on user save. The tolerant loader is permanent. **Runtime is never dual-path; only the (de)serialiser is.** |
| 17 | **Terrain serialisation: per-layer tile palette + Tiled-style chunk records** (`{x, y, data}`, `0` = empty). The naive `"x,y"` map was ~4× optimistic once values are `axo-asset:` refs (~600 KB per 100×100). Reserve high bits for future flip/rotate/variant. |
| 18 | **Culling: chunk, no harness exemption.** Fixed 16×16 cell chunks with cached per-chunk buffers, rebuilt on edit or first visibility. `data-build-count` reads "flat during pan/zoom over warm chunks." |
| 19 | **Multi-cell tiles: sliced at import, not modelled.** The terrain cell field stays strictly 1×1; the importer cuts a `tileFootprint > 1` asset into unit tiles and the brush becomes a multi-tile stamp. |
| 20 | **Asset groups = Drive folders.** Subfolders of `assets/`, app-created with marker `appProperties`. Group is **organisation metadata only** — identity stays the digest, `axo-asset:` refs never encode it, so regrouping cannot break a diagram. Single-valued. Maps onto `collection`; orthogonal to `kind`. Signed-out: IndexedDB metadata only. ZIP keeps `assets/` flat; group rides in the manifest. |

## Ripple analysis (Phase 1.5) — carry these into every wave

**Redundant — plan the removal, do not leave it standing:**

- [`ImportIconsDialog.tsx`](../../packages/axoview-lib/src/components/LeftDock/ImportIconsDialog.tsx) — its only control (the isometric checkbox) becomes one field of the new dialog. **Delete it**; re-point the `dialog-import-icons-confirm` hook used by `packages/axoview-e2e/pom/DialogsPOM.ts`.
- The dead pre-scale `const [iconScale, _setIconScale] = useState(100)` in [IconSelectionControls.tsx](../../packages/axoview-lib/src/components/ItemControls/IconSelectionControls/IconSelectionControls.tsx) — setter never called, and ADR 0044 made scaling non-destructive and per-node. Remove.
- The duplicated resize in two components — collapses into one module.

**Contradicts — reconcile before building:**

- `isIsometric` vs `kind`. One is a *projection* property, the other is *what the asset may be placed as*. Do not overload; ADR 0048 §7.
- ADR 0003's "drop what the host can reproduce" vs a network-resolved shared library — the rule survives, but its failure mode changes from "empty dock" to "missing art". ADR 0049 §3/§6.
- `Icon.url` becomes polymorphic (`https:` | `data:` | `axo-asset:`). **Every consumer that hands it to `new Image()` breaks.** The resolver must land before the first producer of references.
- Connector `style` / `lineType` are meaningless while `hideLine` is true (ADR 0051 §5 TODO).

**Orphaned / phantom surfaces — all grep-confirmed:**

- **No IndexedDB exists in this repo.** `indexedDB|IDBDatabase|idb` → zero hits outside `node_modules`. The asset store is a from-scratch build, not an extension point. Budget accordingly.
- **`importedBlob.ts` is not an asset module** despite the name — it sanitises imported *diagram documents*. Do not put asset code there.
- **`measureStorage`** in [storageAccounting.ts](../../packages/axoview-app/src/services/storage/storageAccounting.ts) scans `localStorage` + `sessionStorage` only. An uncounted IndexedDB store reproduces the CHR-02 defect that module exists to fix. Non-negotiable follow-on.
- **`ICON_COMPARE_FIELDS`** in [leanSave.ts](../../packages/axoview-lib/src/utils/leanSave.ts) omits `scale` **today** — an icon overridden only by `scale` is stripped and the override lost on load. Every new field inherits this. Fix in wave 1.
- Project ZIP ([ADR 0001](../adr/0001-project-zip-format.md)) must bundle assets or exports break. `requiredPacks` is the precedent shape.
- Terrain as a new entity orphans: layers panel, undo, `validateModel`, context menu ([ADR 0027](../adr/0027-canvas-context-menu.md)), paste, image export. Each needs an explicit decision, not a default.
- ADR 0050 §2's viewport culling pressures the `data-build-count` invariant asserted by [ADR 0020](../adr/0020-engine-perf-harness-and-measurement-protocol.md)'s harness. **Resolve by chunking, not by exemption.**

## Sub-tasks

### Wave 1 — the importer, standalone (ADR 0048)

Ships without any storage change. **A 256 px WebP is smaller than today's 128 px
PNG**, so quality improves while storage cost *drops* — no architecture required.

- [ ] Extract `packages/axoview-lib/src/utils/imageImport/` — pure pipeline, no React.
- [ ] Step-halved downscale ladder to a 256 px long edge.
- [ ] Auto-crop to content bounds; drop square letterboxing.
- [ ] Corner-seeded flood-fill matte + 1 px feather, with on/off.
- [ ] WebP encode with feature-detected PNG fallback.
- [ ] `ImportAssetDialog` — crop handles, tolerance slider, checkerboard preview, 3×3 tile-repeat preview, `kind` / `isIsometric` / `tileFootprint` / `group` fields.
- [ ] Slice `tileFootprint > 1` assets into unit tiles at import (decision 19).
- [ ] Re-point both call sites at the module; delete `ImportIconsDialog`; re-point the e2e POM hook.
- [ ] Remove the dead `iconScale` pre-scale.
- [ ] Add `scale` (and the new fields) to `ICON_COMPARE_FIELDS`; regression test the strip.
- [ ] Unit tests per ADR 0048 acceptance criteria, with the four fixture bitmaps.

### Wave 2 — the asset store (ADR 0049) — **unblocked 2026-08-10**

- [ ] Content addressing: digest, `axo-asset:` reference grammar, metadata sidecar.
- [ ] IndexedDB store (hand-rolled; the bundle-size gate is live).
- [ ] `AssetResolver` with the three-tier fallback and back-fill.
- [ ] Re-point every `Icon.url` consumer through the resolver — DOM icon components, `SceneCanvas.getImage`, `ExportImageDialog`, ZIP import/export, lean save.
- [ ] Shared-library tier: content, hosting, versioning.
- [ ] Drive tier — per-asset files under `assets/`, digest in `appProperties`, listing-based manifest rebuild (decision 10).
- [ ] Asset groups as Drive subfolders + `collection` mapping (decision 20).
- [ ] **Auth-state branch in eviction** — signed-out is primary storage, eviction is a no-op (decision 12). Write this test first; it is the highest-consequence bug in the arc.
- [ ] LRU + grace-period + provably-elsewhere eviction for the signed-in cache (decision 14).
- [ ] Drive-side "unused assets" review via generalised `IconUsageScan`, trashed-diagram subtlety preserved (decision 14).
- [ ] `persist()` request on first import, `persisted()` check, `QuotaExceededError` handling (decision 15).
- [ ] `StorageBreakdown.assets` + Storage Manager UI, fed by `navigator.storage.estimate()`.
- [ ] Self-contained Drive save format reusing the export inliner (decision 13).
- [ ] Legacy data-URL migration: convert on load, write on next save (decision 16).
- [ ] Placeholder + single-report behaviour for unresolvable references.
- [ ] Add `kind`, `tileFootprint`, `group` to `ICON_COMPARE_FIELDS`.

### Wave 3 — terrain (ADR 0050)

- [ ] `terrain` schema — per-layer tile palette + 16×16 chunk records, reserved value bits (decision 17); `validateModel`, paste, ZIP round-trip.
- [ ] `terrainEmitter.ts`, emitting first in the merged draw order.
- [ ] 16×16 chunk cache, rebuilt on edit or first visibility; `data-build-count` flat over warm chunks (decision 18).
- [ ] Tool modes: brush, rectangle fill, flood fill (budgeted), eraser, pick.
- [ ] Multi-tile stamp brush over importer-sliced unit tiles (decision 19).
- [ ] Stroke-coalesced undo.
- [ ] Layers integration (visibility, lock).
- [ ] Context-menu entries; image export coverage.

### Wave 4 — tiled paths (ADR 0051)

- [ ] `pathTileId` / `pathWidth` / `hideLine` on `connectorSchema`.
- [ ] Supercover route→cells rasterisation + dilation, memoised on the routed polyline.
- [ ] Emit through the terrain emitter, after painted terrain, before entities.
- [ ] Style-strip tile picker; resolve the `style`/`lineType` disable question.
- [ ] Drag-perf verification against the harness.

## Wrap-up

When all sub-tasks are complete and the smoke checklist passes:

1. Add a single line under the appropriate `PLAN.md` phase:
   ```
   - Creative canvas shipped — see docs/adr/0048..0051 and (this file's git history).
   ```
2. Delete this file. The ADRs are the durable record; this checklist's job is done.
3. Update the memory pointer if the decisions here supersede or extend it.

## Notes for Claude

- **Branch fresh off `master`.** `remediation/exploratory-campaign` is content-identical to `origin/master` (squash-merged as `6b76758f`, PR #86) — it is spent, not a base.
- **`NodesCanvas.tsx` no longer exists.** PR #86's canvas merge deleted it. The render path is now [`SceneCanvas.tsx`](../../packages/axoview-lib/src/components/SceneLayers/SceneCanvas.tsx) plus the emitters in [`src/webgl/scene/`](../../packages/axoview-lib/src/webgl/scene/). Any doc, comment, or memory citing `NodesCanvas` is stale.
- **The app resolves `axoview` to the BUILT lib.** Source edits in `axoview-lib` are invisible until `npm run build:lib`. This has cost real time before.
- **Waves 1 and 2 have opposite risk profiles.** Wave 1 is self-contained, immediately shippable, and improves storage. Wave 2 touches every icon consumer in the codebase. Do not merge them into one branch.
- **The one invariant to hold above all others:** signed out, IndexedDB is the user's ONLY copy. Eviction must branch on auth state and be a no-op for anonymous users (decision 12). Getting that branch wrong destroys work with no recovery path. Write its test before its code.
- **`persist()` is never a guarantee.** Safari evicts after 7 days of no interaction regardless of a grant. The first-import notice must not overpromise (decision 11/15).
- **UI verification is mandatory** for the import dialog and every tool mode (`packages/axoview-*/src/components/` rule in workflow.md). Dev server + browser, not just jest.
- **Commitlint:** no uppercase words in the subject. Write commit-message files with the Write tool and `git commit -F` — PS 5.1 `Set-Content -Encoding utf8` writes a BOM that fails header-trim.
