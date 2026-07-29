# F5 — Icons & catalog (packs, custom icons, merge-on-load, icon resize)

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `ICON-`

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

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
