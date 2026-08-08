# F5 — Icons & catalog (packs, custom icons, merge-on-load, icon resize)

**Status:** DONE · **Counted hypotheses:** 10 / 10 · **Bugs:** 6 (one known) · **Suspects:** 0 · **Hypothesis ID prefix:** `ICON-`

**Scope:** Icon catalog merge-on-load (ADR 0002), lean-save icon stripping + requiredPacks derivation (ADR 0003), icon pack manager + usage tracking (app services), custom/override icons through every round-trip, keyboard icon placement, on-canvas icon resize (ADR 0044), icon filtering/categories.

**Code:**
- `packages/axoview-app/src/services/iconPackManager.ts + iconUsage.ts`
- `packages/axoview-lib/src/hooks/useIcon.tsx, useIconCategories.ts, useIconFiltering.ts, useKeyboardIconPlacement.ts`
- `packages/axoview-lib/src/components/IconPackSettings/`
- `packages/axoview-lib/src/utils/ (leanSave)`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Import / export / custom icons*; Unit: *App utils, runtime config & shell components/dialogs*, *Lib persistence/export utils (lean save, model fix, SVG/image export)*. Then grep the suites directly.

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(ADR 0023 §1 + §7 acceptance / clipboard)** Off-grid fields (offset/snap/collides) survive every persistence and duplication path; absent fields default to snapped/colliding. → *Ctrl+C/Ctrl+V (or context-menu Duplicate) of an unsnapped off-grid node: clipboard.ts/useCopyPaste reconstruct view items — if they omit offset/snap/collides, the paste silently re-snaps and re-enables collision. The ADR's round-trip test covers export→import, and ADR 0044 names clipboard as 'the real risk site' for iconScale — the same hole exists for the 0023 trio with no clipboard round-trip test.*
- **(rendering guidelines §15)** Every component that paints an entity or exposes an interactive affordance re-applies the layer visible/locked filter itself — it is never inherited; locked-layer items may be selected but get a ring with NO transform handles. → *The label hit-proxies (LabelHitLayer/NodeLabelHitLayer) and the new ADR 0044 ScreenBoxTransformControls/size-readout pill are affordance layers added after the §15 sweep — if any iterates the raw scene list, a hidden layer's label chip stays grabbable (invisible drag) or a locked node still shows resize handles. The §15 fix audited RectanglesCanvas + ConnectorAnchorOverlay + TransformControlsManager; nothing prevents the next overlay from skipping the filter.*
- **(ADR 0034 §4 + testing.md S1-brick guard)** No dead writes: every strip write must be schema-legal at the write site — a strip range wider than a schema cap bricks saved diagrams at safeParse on reload (the connector-label 24→40 lesson). → *ADR 0044 group icon-resize: a uniform factor multiplies each member's startScale preserving ratios — a member already at 2.5× times factor 1.3 commits 3.25, outside the schema's hard [0.1,3] → the whole diagram fails safeParse on next load. TransformNode.test covers the single-node clamp; nothing asserts per-member clamping under group factor multiplication (and per-member clamping would itself violate 'relative sizes preserved').*
- **(ADR 0003 (lean icon save))** Default-catalog icons are stripped from every save and rehydrated on load; custom AND override icons are preserved verbatim. → *An icon-pack version bump changes a bundled icon's base64: the strip's duplicate detection (compare against current catalog) now sees a user's diagram icon (saved from the OLD pack) as non-duplicate and keeps it — or worse, a normalization change makes a user's deliberate override compare equal and get stripped, silently reverting their customization on save. leanSave.test compares against a fixed fixture catalog, never a drifted one.*
- **(features.md requiredPacks + ADR 0003)** Lean saves persist requiredPacks so importers auto-load the right icon packs before merging; icons render on first paint after re-import. → *Ctrl+C a Material-icon node in diagram A, Ctrl+V into diagram B which never loaded the Material pack: paste inserts the view item but B's requiredPacks derivation and icon catalog may not gain the pack/icon → save B, reload → tombstone. No test pastes across diagrams with disjoint loaded packs.*
- **(ADR 0044 §4 (iconScale resolution order))** Every render reader resolves viewItem.iconScale ?? icon.scale ?? 1 — DOM icon paths, WebGL NodesCanvas, selection-ring extent, and image export must agree. → *A reader outside the four audited ones — the hover outline box, NodeLabelHitLayer's chip stalk anchor, or the ADR 0012 popover's side-anchor offset — computes extent from icon.scale only: a per-node-resized icon shows a ring/label/popover anchored to the wrong extent. Unit tests cover the mode math and schema round-trip; a missed reader is visual-only and CI is pixel-blind (§11).*
- **(ADR 0044 §6 + ADR 0023 addendum (hit-testing))** Icon resize is visual-only — the node keeps a single-tile footprint for collision/hit/anchoring; meanwhile off-grid hit-testing compares px against RENDERED footprints. → *An enlarged (2.5×) off-grid node: getItemAtTile's px footprint test and the tile-footprint rule pull in opposite directions — if hover/selection chrome traces the scaled extent (ADR 0044 third pass) but click hit-testing stays tile-sized, the user can hover-highlight a spot they cannot click. The renderedGeometry invariant suite's corpus predates iconScale and doesn't parametrize over it.*

## Known coverage gaps (from the baseline inventory)

- (Import / export / custom icons) Corrupt/invalid ZIP import error path (only bad JSON covered)
- (Import / export / custom icons) Import into a NON-empty session (merge/replace semantics)
- (Import / export / custom icons) Export PNG dimensions/scale options
- (Import / export / custom icons) Export honoring hidden layers and off-grid offsets (visual fidelity)
- (Import / export / custom icons) JSON schema-version migration on import of older files
- (Import / export / custom icons) Custom icon that is malformed/oversized; icon persistence in ZIP round-trip
- (App utils, runtime config & shell components/dialogs) packages/axoview-app/src/hooks/useAutoSave.ts and useFileTree.ts — zero tests (autosave debounce/dirty logic, tree building)
- (App utils, runtime config & shell components/dialogs) packages/axoview-app/src/providers/DiagramLifecycleProvider.tsx and AuthProvider.tsx — only source-grep contract tests, no behavioral tests of load/save/dirty lifecycle
- (App utils, runtime config & shell components/dialogs) packages/axoview-app/src/components/DiagramManager.tsx and fileExplorer/FileExplorer.tsx, FileTreeNode.tsx, FileTreeToolbar.tsx, ImportDialog.tsx, ContextMenuItems.tsx, ExportProjectZipDialog.tsx, SessionStorageGauge.tsx — zero behavioral tests (rename/move/DnD/context menus)
- (App utils, runtime config & shell components/dialogs) app shell components with zero tests: AppToolbar.tsx, AuthControl.tsx, ErrorBoundary.tsx, LoadDialog.tsx, SaveDialog.tsx, ExportPopover.tsx, ExportSingleDiagramDialog.tsx, MigrateSessionDialog.tsx, DriveDisplayGate.tsx, DriveSetupGate.tsx, DriveRootFolderDialog.tsx, NotificationStack.tsx, StatusCluster.tsx, LocalModeBanner.tsx, LocalModeShareErrorDialog.tsx, PublicShareLoadErrorDialog.tsx, ReadonlyLoadErrorDialog.tsx, ConfirmDialog.tsx, NotFound.tsx
- (App utils, runtime config & shell components/dialogs) packages/axoview-app/src/utils/apiBaseUrl.ts, authDebug.ts, bootScreen.ts, downloadBlob.ts, isoGridBackground.ts — zero tests; also diagramUtils.ts, appBase.ts, serviceWorkerRegistration.ts

## Hypotheses

Probe files:
- `A` = `packages/axoview-app/src/__explore__/F5/leansave-icon-01-02-03.explore.test.ts`
- `P` = `packages/axoview-app/src/__explore__/F5/packs-icon-04-05-06.explore.test.ts`
- `S` = `packages/axoview-lib/src/__explore__/F5/iconscale-icon-07-09.explore.test.ts`
- `E` = `packages/axoview-e2e/tests-exploratory/F5-icons/iconscale.explore.spec.ts`

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|
| ICON-01 | ADR 0003 lean-save is implemented twice with different rules, and the JSON/ZIP export half strips nothing — so "Export as JSON" writes the whole loaded icon catalog while a save of the same diagram writes four icons | bug-class: sibling drift | `leanModel.test.ts` (storage half only) | `A` | **BUG** | CONTROL: `leanIfModel` on a realistic loaded model keeps `['my-logo']` and records `requiredPacks: ['aws']`. `stripDefaultIcons` on the same model keeps all four, and the serialised export is >2× the size of the saved payload |
| ICON-02 | The lib's bundled-fixture list is empty, so both halves of the ADR 0002/0003 lib round trip (`stripDefaultIcons` on save, `mergeBundledFixtures` on load) are inert | bug-class: dead code behind a contract | `leanSave.test.ts` | `A` | **BUG** | `src/fixtures/icons.ts` exports `[]`. Nothing can match a fixture on save and nothing is merged back on load — ADR 0002's "the side dock always has the full catalog regardless of what was saved" is delivered by the app's pack manager alone. Filed with ICON-01 as one entry (same root, one fix) |
| ICON-03 | An exported JSON's pack icons become permanent once re-imported | ADR 0001 / 0003 round trip | `projectZip.test.ts` | `A` | FALSIFIED | Round-tripping the fat export back through the storage lean-save strips the pack icons again and re-derives `requiredPacks: ['aws']`. CONTROL: an already-lean payload keeps its recorded `requiredPacks` instead of deriving `[]`. The bloat is confined to the file |
| ICON-04 | `loadEnabledPacks` JSON-parses the preference with no shape check, so well-formed JSON of the wrong shape reaches `loadIconPack`, which throws on an unknown name | boundary / degenerate input | `iconPackManager.test.ts` | `P` | **BUG** | CONTROL: valid input round-trips and a parse error correctly falls back to all five packs. But `JSON.stringify('aws')` comes back as the string `'aws'`, `null` comes back as `null`, and `['aws','AWS','not-a-pack']` comes back verbatim — and `loadIconPack('not-a-pack')` rejects with `Unknown icon pack` |
| ICON-05 | `iconPackManager`'s localStorage readers are unguarded, unlike the lib's `persistedSettings`, so a browser that throws on `localStorage` takes the pack manager down with it | bug-class: sibling drift | none | `P` | **BUG** | With a `localStorage` getter that throws `SecurityError` (Safari private mode / a storage-blocked iframe), both `loadEnabledPacks()` and `loadLazyLoadingPreference()` propagate the throw. CONTROL: the same hostile store, read through the try/catch shape `persistedSettings.ts` uses everywhere, returns `null` |
| ICON-06 | `scanIconUsage` skips soft-deleted diagrams, so the icon-delete confirm reports "used nowhere" for an icon a trashed diagram still references | bug-class recurrence (SHARE-06) | `iconUsage.test.ts` | `P` | **BUG** | CONTROL: a live diagram using the icon IS reported. The same diagram with a `deletedAt` is filtered out by `metas.filter((m) => !m.deletedAt …)` and the report comes back empty — so deleting the icon leaves a dangling reference that surfaces when the diagram is restored (CLIP-14's class) |
| ICON-07 | A reader of `viewItem.iconScale ?? icon.scale ?? 1` outside the audited set resolves differently, so a resized icon's ring / label / popover anchors to the wrong extent | ADR 0044 §4 | `TransformNode.test.ts` (the mode math) | `S` | FALSIFIED | Sweep over all five readers that exist today (`NodesCanvas`, `HoverOutline`, `NodeTransformControls`, `NodeGroupTransformControls`, `useIcon`) × four cases including an explicit `0`. All agree. CONTROL: the sweep distinguishes a reversed precedence and a `\|\|`-based rule, so it can fail |
| ICON-08 | On a 2.5× node the drawn icon extends outside its one-tile footprint, and that visible area is not clickable — ADR 0044 §6's visual-only resize meets the tile-sized hit test | ADR 0044 §6 | none | `E` | **BUG** | Real mouse, read-back pixel oracle for the extent. CONTROL: the node's own tile still selects it after the resize. A press at the painted box's left edge — asserted to be left of where the 1× icon ended, at the node's own vertical band, so those are icon pixels — selects nothing. The enlarged part of the icon is visible and inert |
| ICON-09 | A group icon-resize commits a scale outside the schema's hard `[0.1, 3]` | ADR 0034 §4 / testing.md S1-brick guard | `TransformNode.test.ts` (single-node clamp) | `S` | BUG (known — CLIP-13) | A member at 2.5× times a 1.3 factor commits 3.25, which `viewItemSchema` rejects. Re-confirmed from the F5 side with the reason a clamp is NOT the fix: clamping one member destroys the size ratio the group resize exists to preserve. No duplicate entry filed |
| ICON-10 | Keyboard icon placement is reachable in a read-only diagram | thread C | none | `E` | FALSIFIED | `useKeyboardIconPlacement`'s `editorMode !== 'EDITABLE'` early return holds: opening the dock in view mode, focusing an icon and pressing Enter/Space places nothing. Worth recording that the Elements dock toggle IS still mounted in `EXPLORABLE_READONLY`, so that early return is the ONLY gate rather than defence in depth |

**Next:** area closed (10 counted, 6 bugs — one of them a re-confirmation of CLIP-13). Nothing outstanding.

## Standing thread this area adds

**F-e. The app/lib boundary is where a contract gets implemented twice.** Every
F5 bug but two is a pair of implementations that drifted across the package
line: lean-save exists in both packages and the lib's half is inert (ICON-01/02),
storage-access guarding exists in both and only the lib's half has it (ICON-05).
The falsified ones are the mirror image — where there is exactly ONE
implementation (`iconScale`'s resolution rule, the keyboard-placement gate) it is
consistent everywhere it is read. When an area finds a helper exported from
`axoview` and a similarly-named one in `axoview-app`, diff them before testing
either.

## Product questions (SUSPECT verdicts)

*none yet*
