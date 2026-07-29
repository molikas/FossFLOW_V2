# E3 — Scene actions, transactions & paste assembly

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `SCN-`

**Scope:** useSceneActions is the write facade: per-entity CRUD wrapping reducers.view with saveToHistoryBeforeChange; transaction() buffers state in pendingStateRef and commits with two skipHistory sets; beginDragTransaction/commitDragTransaction implement freeze-based one-entry drags; immer-free batch updaters (batchUpdateViewItemTiles/Rectangles/TextBoxTiles/LabelTiles) and previewConnectorPaths (flushSync scene-only write) are the drag hot path; pasteItems does a single structural build + one validateView + computePathsAsync (rAF-batched provisional-path routing); deleteSelectedItems cascades multi-kind deletes incl. waypoint-anchor splices; createView/deleteView/switchView drive view lifecycle through useView.changeView (SYNC_SCENE + uiState.setView). useSceneData is the read facade (currentView fallback logic, hit vs render connector lists).

**Code:**
- `packages/axoview-lib/src/hooks/useSceneActions.ts`
- `packages/axoview-lib/src/hooks/useSceneData.ts`
- `packages/axoview-lib/src/hooks/useScene.ts`
- `packages/axoview-lib/src/hooks/useView.ts`
- `packages/axoview-lib/src/hooks/useDiagramUtils.ts`
- `packages/axoview-lib/src/hooks/useModelItem.ts`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Undo/redo / clipboard / hotkeys / modes*; Unit: *Lib perf/refactor regression suite (__perf_refactor_regression__)*, *Lib clipboard (copy/cut/paste)*. Then grep the suites directly.

## Seed seams (2026-07-29 mapping — starting points, not a ceiling)

- computePathsAsync races user edits: each rAF batch snapshots model+scene, routes 25 connectors, then writes the WHOLE scene back skipHistory. An undo, delete, or drag landing between snapshot and write is clobbered for the scene slice (paths recomputed from the pre-edit snapshot overwrite the post-edit scene), and deleted connectors get orphan scene entries re-added.
- createView is NOT undoable (setState with skipHistory, no saveToHistoryBeforeChange) while deleteView IS — undo after create+edit skips the creation, and if an orphaned pendingPre exists, the create silently becomes a mis-stamped history entry instead.
- switchView/createView read modelStoreApi.getState() directly, ignoring pendingStateRef — calling them inside an open transaction() operates on stale pre-transaction views and the transaction commit then overwrites their writes.
- pasteItems validates newView BEFORE rectangles/textBoxes/labels are layered on via per-item reducers — a pasted rectangle with a dangling color ref lands unvalidated; also those reducers run inside the transaction against pendingStateRef, so a throw there (getItemByIdOrThrow on a stale view) aborts commit after `applied` logic decided, leaving items pasted but connectors never routed.
- batchUpdate* writes bypass validateView entirely (documented as drag-only), but nothing enforces the 'caller must be inside beginDragTransaction' contract — a call outside a drag writes model+scene skipHistory with pendingPre unset: the move is real but invisible to undo.
- previewConnectorPaths uses flushSync inside mousemove and writes scene.connectors skipHistory against sceneStoreApi.getState() (not the transaction's pendingStateRef) — a preview firing while a transaction() is open writes to the store directly and gets overwritten at commit, or vice versa leaves preview paths in committed state.
- useSceneData.currentView fallback: unknown currentViewId silently returns views[0] (or an empty stub) — masks the dangling-uiState.view class of bug (undo of view ops, deleted-view load) instead of surfacing it; downstream code operating on 'currentView' may write to a view the user is not looking at.
- useModelItem WeakMap index is keyed by items array identity and assumes dense arrays — the deleteModelItem sparse-hole bug (area 2) makes `new Map(items.map(...))` throw for every subscriber at once.
- deleteSelectedItems anchor-splice pass re-reads the view after connector deletes but matches anchors by id across ALL connectors — combined with paste's non-regenerated anchor ids (area 4) a single CONNECTOR_ANCHOR ref splices the waypoint out of BOTH the original and its pasted clone.

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(canvas-interaction.md §5.4)** Group-drag members are seeded once at drag start; free-floating CONNECTOR_ANCHOR members must be seeded from their ref.tile or paths pinch. → *A new selection source (e.g. a future context-menu 'Select all in layer' or a paste-then-drag flow) that populates selectedIds without running collectDragInitialPositions' anchor-seed branch reproduces the historical Ctrl+A pinch — tests cover the Ctrl+A path only.*
- **(canvas-interaction.md §6.2 (drag transactions))** beginDragTransaction/commitDragTransaction must pair exactly once per gesture; a leaked bracket suppresses saveToHistoryBeforeChange for ALL subsequent edits, silently dropping undo history. → *Start a node drag, then lose the mouseup (release outside the window / alt-tab / browser context-menu steals the event): exit runs lazily only on the NEXT mouse event, so if the user's next action is keyboard-only (Delete, Ctrl+Z), the bracket may stay open and later edits produce no undo entries. connector.dragPerf.test.tsx tests the happy 40-tick path, never a lost mouseup.*
- **(canvas-interaction.md §8 (no rollbackDragTransaction))** Every mode exit safety-net COMMITS; node CSS-preview drags abort-to-origin only by accident. A mid-drag tool hotkey is an undocumented partial abort: nodes snap back, textbox/rect/anchor moves commit. → *Press 'r' mid multi-drag of nodes+textboxes: nodes revert, textboxes commit their translation → the group's relative layout silently corrupts, with ONE history entry that undo can't cleanly revert to the pre-drag state for the node members (they never wrote). No test exercises tool-hotkey-mid-drag.*
- **(ADR 0021 item 7 (D-8 fix) + D-9)** After undo/redo, resyncScene re-routes connectors with missing/empty paths — but only in the ACTIVE view. → *Paste connectors on Page 1 → switch to Page 2 before async routing completes → undo/redo: resyncScene scans only the active view, so Page 1's pasted connectors stay pathless (invisible) until a later edit touches them. useHistory tests exercise single-view scenarios only.*
- **(ADR 0023 §1 + §7 acceptance / clipboard)** Off-grid fields (offset/snap/collides) survive every persistence and duplication path; absent fields default to snapped/colliding. → *Ctrl+C/Ctrl+V (or context-menu Duplicate) of an unsnapped off-grid node: clipboard.ts/useCopyPaste reconstruct view items — if they omit offset/snap/collides, the paste silently re-snaps and re-enables collision. The ADR's round-trip test covers export→import, and ADR 0044 names clipboard as 'the real risk site' for iconScale — the same hole exists for the 0023 trio with no clipboard round-trip test.*
- **(ADR 0032 connector amendment §4 (nameSeeded marker))** The name→labels[] seed is idempotent via a nameSeeded marker stamped on every connector the pass touches; a name typed later is pure identity and never re-seeded. → *Paste a connector from the clipboard (or import a zip diagram) whose reconstruction drops the nameSeeded marker while keeping name: the next load re-seeds name into a midpoint label — duplicate label chips appear after every paste→save→reload cycle. Seed idempotency tests never route through clipboard/zip reconstruction.*
- **(features.md requiredPacks + ADR 0003)** Lean saves persist requiredPacks so importers auto-load the right icon packs before merging; icons render on first paint after re-import. → *Ctrl+C a Material-icon node in diagram A, Ctrl+V into diagram B which never loaded the Material pack: paste inserts the view item but B's requiredPacks derivation and icon catalog may not gain the pack/icon → save B, reload → tombstone. No test pastes across diagrams with disjoint loaded packs.*
- **(ADR 0022 addendum (arrow keys) + ADR 0006)** Arrow keys nudge a selected ITEM/RECTANGLE/TEXTBOX one tile per press as a single-undo transaction; with nothing selected they pan. → *Arrow-nudge a selected floating LABEL or an off-grid (offset) item: Labels are absent from the enumerated nudge types (the recurring wired-into-some-surfaces bug), and nudging an off-grid item by one integer tile while keeping its offset may collide-check against the wrong cell. No test nudges a Label or an offset item.*

## Known coverage gaps (from the baseline inventory)

- (Undo/redo / clipboard / hotkeys / modes) Undo of a DELETE that restores an item together with its attached connectors
- (Undo/redo / clipboard / hotkeys / modes) Undo of resize, rotate, z-order, or style operations
- (Undo/redo / clipboard / hotkeys / modes) Redo-stack invalidation after undo-then-new-action
- (Undo/redo / clipboard / hotkeys / modes) Paste POSITION semantics (only counts asserted, not where the paste lands)
- (Undo/redo / clipboard / hotkeys / modes) Copy/paste of a multi-item selection or across diagrams
- (Undo/redo / clipboard / hotkeys / modes) History depth cap / memory behavior on long sessions
- (Lib perf/refactor regression suite (__perf_refactor_regression__)) many contracts here are source-text greps rather than behavior (exportImageDialog.initialLoad, f2.rendererScope, interactionManager.depStability, saveTracking, viewTabs, i18n, toolMenu/quickIconSelector string bans) — they pin implementation text, not runtime behavior; renames could silently weaken them

## Hypotheses

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
