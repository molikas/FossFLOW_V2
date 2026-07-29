# E1 — History & undo/redo engine (dual-store patches)

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `HIST-`

**Scope:** modelStore owns the document (version/title/description/colors/icons/items/views) plus a 50-entry immer-patch undo stack; sceneStore owns derived render caches (scene.connectors[id].path(+unroutable), scene.textBoxes[id].size) plus its own independent 50-entry stack. Every history entry is stamped with a module-global logical-action sequence (historySequence.ts, D-7); useHistory steps only the stack(s) whose top entry carries max(undo)/min(redo) seq, then resyncScene re-routes connectors whose path is empty via SYNC_SCENE written skipHistory. Mutations: actions.set(partial, skipHistory) computes patches against a pendingPre snapshot captured by saveToHistory(); freezePendingPre/unfreezePendingPre implement live-drag one-entry commits.

**Code:**
- `packages/axoview-lib/src/stores/modelStore.tsx`
- `packages/axoview-lib/src/stores/sceneStore.tsx`
- `packages/axoview-lib/src/stores/historySequence.ts`
- `packages/axoview-lib/src/hooks/useHistory.ts`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Undo/redo / clipboard / hotkeys / modes*; Unit: *Lib store reducers + zustand stores*, *Lib hooks*, *Lib perf/refactor regression suite (__perf_refactor_regression__)*. Then grep the suites directly.

## Seed seams (2026-07-29 mapping — starting points, not a ceiling)

- Orphaned pendingPre: saveToHistoryBeforeChange() runs, then the reducer throws (e.g. updateViewItem's validateView throw) so no set() follows — pendingPre stays non-null. The NEXT skipHistory=true write (changeView's SYNC_SCENE, resyncScene, computePathsAsync batch) consumes it and pushes a bogus history entry stamped with a stale seq; undo then reverts a diff the user never made.
- No-op set swallows the snapshot: modelStore.tsx line ~193 / sceneStore.tsx line ~184 — when patches.length===0 the guard returns early but pendingPre was ALREADY nulled. In a coordinated sequence (coordinator saveToHistory → op1 set(skip=true) that happens to be a net no-op → op2 set(skip=true) with real changes), op2 finds pendingPre null and applies with NO history entry — the real change becomes un-undoable.
- Seq is read at set() time, not pinned at allocation: commitDragTransaction stamps currentHistorySequence() (the live global counter). Any allocateHistorySequence() between beginDragTransaction and commit — e.g. a keyboard-shortcut action mid-drag, or a second mounted Axoview instance (counter is module-global across provider pairs) — mis-stamps the entry, so useHistory's max/min pairing pops model and scene halves of one action separately (the invisible-connector class of bug).
- Asymmetric stack trimming: MAX_HISTORY_SIZE=50 per store, trimmed independently (newPast.shift()). After >50 model-only actions the model stack drops the entry whose seq still pairs with an old scene entry; deep undo then steps the scene without its model half → model/scene divergence.
- resyncScene writes scene skipHistory after undo/redo, mutating the object shape that queued redo patches were computed against; immer applyPatches with 'add'/'remove' ops against the resynced connectors map can mis-apply or throw, and redo can resurrect paths inconsistent with the resynced state.
- useHistory.transaction and useSceneActions.transaction are two DIFFERENT machineries with per-hook-instance refs. A useHistory.transaction wrapping scene CRUD does not suppress useSceneActions' saveToHistoryBeforeChange (separate transactionInProgress ref) — each op overwrites pendingPre and allocates a fresh seq, splitting the 'atomic' group into N entries. Same per-instance hazard for dragInProgress: beginDragTransaction in one component does not guard batch updates issued through another component's useSceneActions instance.
- Undo history is global but scene cache + uiState.view are per-active-view: undoing an action made in view A while view B is active applies model patches to view A's data, but resyncScene only repairs the ACTIVE view's scene; undoing a CREATE_VIEW/DELETE_VIEW never restores uiState.view (not in any history), leaving view pointing at a nonexistent id (useSceneData silently falls back to views[0]).
- (mapper note) modelStore comments record prior bug classes here (MQA #5 no-op-set clobbering redo, D-7 dual-stack drift, D-8 provisional paste paths) — this seam has a track record.

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(canvas-interaction.md §6.2 (drag transactions))** beginDragTransaction/commitDragTransaction must pair exactly once per gesture; a leaked bracket suppresses saveToHistoryBeforeChange for ALL subsequent edits, silently dropping undo history. → *Start a node drag, then lose the mouseup (release outside the window / alt-tab / browser context-menu steals the event): exit runs lazily only on the NEXT mouse event, so if the user's next action is keyboard-only (Delete, Ctrl+Z), the bracket may stay open and later edits produce no undo entries. connector.dragPerf.test.tsx tests the happy 40-tick path, never a lost mouseup.*
- **(canvas-interaction.md §8 (no rollbackDragTransaction))** Every mode exit safety-net COMMITS; node CSS-preview drags abort-to-origin only by accident. A mid-drag tool hotkey is an undocumented partial abort: nodes snap back, textbox/rect/anchor moves commit. → *Press 'r' mid multi-drag of nodes+textboxes: nodes revert, textboxes commit their translation → the group's relative layout silently corrupts, with ONE history entry that undo can't cleanly revert to the pre-drag state for the node members (they never wrote). No test exercises tool-hotkey-mid-drag.*
- **(canvas-interaction.md §8.1 + known_issues D-9)** One keystroke reverts exactly one logical action across both history stacks (sequence stamping); scene history is global but the scene store holds only the current view. → *Edit on Page 1, switch to Page 2, Ctrl+Z: the scene patch applies to Page 2's scene (phantom/stale scene.connectors[id]) while the model undo reverts Page 1 — documented open (D-9) with NO e2e repro committed. Any new page-switch path (e.g. cross-diagram link navigation within a file) widens the window.*
- **(ADR 0021 item 7 (D-8 fix) + D-9)** After undo/redo, resyncScene re-routes connectors with missing/empty paths — but only in the ACTIVE view. → *Paste connectors on Page 1 → switch to Page 2 before async routing completes → undo/redo: resyncScene scans only the active view, so Page 1's pasted connectors stay pathless (invisible) until a later edit touches them. useHistory tests exercise single-view scenarios only.*
- **(ADR 0022 addendum (arrow keys) + ADR 0006)** Arrow keys nudge a selected ITEM/RECTANGLE/TEXTBOX one tile per press as a single-undo transaction; with nothing selected they pan. → *Arrow-nudge a selected floating LABEL or an off-grid (offset) item: Labels are absent from the enumerated nudge types (the recurring wired-into-some-surfaces bug), and nudging an off-grid item by one integer tile while keeping its offset may collide-check against the wrong cell. No test nudges a Label or an offset item.*

## Known coverage gaps (from the baseline inventory)

- (Undo/redo / clipboard / hotkeys / modes) Undo of a DELETE that restores an item together with its attached connectors
- (Undo/redo / clipboard / hotkeys / modes) Undo of resize, rotate, z-order, or style operations
- (Undo/redo / clipboard / hotkeys / modes) Redo-stack invalidation after undo-then-new-action
- (Undo/redo / clipboard / hotkeys / modes) Paste POSITION semantics (only counts asserted, not where the paste lands)
- (Undo/redo / clipboard / hotkeys / modes) Copy/paste of a multi-item selection or across diagrams
- (Undo/redo / clipboard / hotkeys / modes) History depth cap / memory behavior on long sessions
- (Lib store reducers + zustand stores) packages/axoview-lib/src/stores/historySequence.ts — zero direct tests
- (Lib store reducers + zustand stores) packages/axoview-lib/src/stores/localeStore.tsx — zero tests (translation lookup/namespace fallback)
- (Lib store reducers + zustand stores) packages/axoview-lib/src/stores/uiStateStore.tsx — only indirectly tested via multiSelect.contract; most UI-state actions untested directly
- (Lib hooks) zero-test hooks in packages/axoview-lib/src/hooks/: useDiagramUtils.ts (fit-to-screen), useDirtyTracker.ts, useConnector.ts, useSceneActions.ts, useSceneData.ts, useModelItem.ts, useViewItem.ts, useView.ts, useRectangle.ts, useTextBox.ts, useTextBoxProps.ts, useLabel.ts, useLayerActions.ts, useLayerContext.ts, useIcon.tsx, useIconCategories.ts, useIconFiltering.ts, useImageAspect.ts, useKeyboardIconPlacement.ts, useCanvasModeToggle.ts, useColor.ts
- (Lib hooks) useScene.ts is covered only via __perf_refactor_regression__ list-shape/reference-stability tests; pasteItems/action surface has no direct unit tests outside paste.bulkPerf
- (Lib perf/refactor regression suite (__perf_refactor_regression__)) many contracts here are source-text greps rather than behavior (exportImageDialog.initialLoad, f2.rendererScope, interactionManager.depStability, saveTracking, viewTabs, i18n, toolMenu/quickIconSelector string bans) — they pin implementation text, not runtime behavior; renames could silently weaken them

## Hypotheses

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
