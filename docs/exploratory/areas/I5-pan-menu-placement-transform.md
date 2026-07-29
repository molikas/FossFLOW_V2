# I5 — Pan/right-click, context menu, placement tools & transform handles

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `CTX-`

**Scope:** usePanHandlers: middle-drag and deferred right-drag pan (4px threshold), right-TAP → item/bulk/canvas context menu (ADR 0027), previous-mode save/restore with connector abort; Pan mode incl. EXPLORABLE_READONLY left-click-opens-popover; arm-then-drop placement tools (PlaceIcon/TextBox/Label) with off-grid residual placement; CanvasContextMenu (sole per-item command surface); TransformControlsManager selection chrome + resize handle geometry feeding the RECTANGLE/TEXTBOX/NODE transform modes; keyboard placement at viewport centre.

**Code:**
- `packages/axoview-lib/src/interaction/usePanHandlers.ts`
- `packages/axoview-lib/src/interaction/modes/Pan.ts`
- `packages/axoview-lib/src/interaction/modes/PlaceIcon.ts`
- `packages/axoview-lib/src/interaction/modes/TextBox.ts`
- `packages/axoview-lib/src/interaction/modes/Label.ts`
- `packages/axoview-lib/src/interaction/modes/Rectangle/DrawRectangle.ts`
- `packages/axoview-lib/src/interaction/modes/Rectangle/TransformRectangle.ts`
- `packages/axoview-lib/src/interaction/modes/TransformTextBox.ts`
- `packages/axoview-lib/src/interaction/modes/Node/TransformNode.ts`
- `packages/axoview-lib/src/components/CanvasContextMenu/CanvasContextMenu.tsx`
- `packages/axoview-lib/src/components/TransformControlsManager/TransformControlsManager.tsx`
- `packages/axoview-lib/src/components/TransformControlsManager/TransformControls.tsx`
- `packages/axoview-lib/src/components/TransformControlsManager/TransformAnchor.tsx`
- `packages/axoview-lib/src/components/DragAndDrop/DragAndDrop.tsx`
- `packages/axoview-lib/src/hooks/useKeyboardIconPlacement.ts`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Context menu scoping*, *Rectangles*, *Textboxes*; Unit: *Lib interaction modes + keyboard/pan handlers*. Then grep the suites directly.

## Seed seams (2026-07-29 mapping — starting points, not a ceiling)

- Placement mouseup gating: PlaceIcon/TextBox/Label all place when `!isRendererInteraction && moved` is false-false... i.e. `moved` alone suffices (PlaceIcon.ts:47-53, TextBox.ts:27-33, Label.ts:26-32). A MOUSE drag that starts on the Elements panel and releases over ANOTHER PANEL (still off-canvas) has moved past slop → places the element at the tile projected under that panel; only the touch 'palette' path does an over-canvas rect check.
- Right-tap target resolution reads uiState.mouse.position.tile (usePanHandlers.ts:275) which is only as fresh as the last RAF-flushed mousemove — a right-click without prior movement over the target (e.g. after keyboard pan) opens the menu for a stale tile; the mousedown path does re-seed via getMouse but only when handlePanMouseDown consumed it.
- restorePreviousMode reconstructs CLEAN modes only for a hardcoded list (usePanHandlers.ts:52-90) — any other saved mode type (TEXTBOX, LABEL, NODE.TRANSFORM, RECONNECT_ANCHOR, DRAG_ITEMS if a right-press lands mid-left-drag) falls to default CURSOR, silently dropping the tool; and restoreModeAfterRightClick has separate, subtly different coverage (TEXTBOX/LABEL cancel entirely there).
- Transform-handle activation relies on event ordering: TransformAnchor.onPointerDown (React, root-delegated) sets RECTANGLE.TRANSFORM/etc BEFORE the window pointerdown listener dispatches into the mode registry — entry() (beginDragTransaction) then runs on that same event; any environment where the window listener runs first (synthetic events, capture-phase interception) breaks the transaction bracket order.
- TransformRectangle/TransformTextBox mousemove are gated on hasMovedTile only and read the model per frame; TransformTextBox mixes orientation-dependent axis math (X vs Y run/row) with near-edge tile relocation (TransformTextBox.ts:54-92) — off-by-one on the near-edge branches (the +1/-1 corrections) is the classic seam, especially in orientation Y where 'width' maps to −y.
- NODE.TRANSFORM commit uses uiState.iconScaleDrag, not the mode (TransformNode.ts:40-52), and mouseup is NOT gated on isRendererInteraction while exit() double-commits as safety net — a release exactly on the anchor (where mouseup was gated in older code, per the comment) relies entirely on exit ordering; also its factor math divides by zoom at commit-time zoom, so wheel-zoom mid-resize jumps the scale.
- Context-menu scoping: onContextMenu swallows the OS menu when 'ourMenuOpen' regardless of target (useInteractionManager.ts:803-828) — while our menu is open, a native right-click in a TEXT INPUT (Cut/Copy/Paste menu) is also suppressed; conversely handleRightButtonUp consumes ANY stray right mouseup (previousModeTypeRef null → return true, usePanHandlers.ts:269) including ones that began off-canvas.
- endPan after right-drag restores the saved mode and nulls mouse.mousedown to stop the Cursor-lasso leak (usePanHandlers.ts:115-121) — but a MIDDLE-drag pan (method 'middle') always exits to CURSOR even when a tool (LASSO/CONNECTOR armed) was active before, dropping the user's tool without the right-drag path's restore.
- CanvasContextMenu commands capture `target` from the store at render and run against scene later (rename/addLabel via requestAnimationFrame + CustomEvent, CanvasContextMenu.tsx:141-194) — a one-frame race with panel mount/unmount; 'Add label' also does nearest-path-tile math against contextMenu.tile which for the touch long-press path is ts.downTile (raw tile, no ADR-0023 point correction).
- TransformControlsManager hides ALL chrome during DRAG_ITEMS and gates handles on lockedIds only — a group containing an item on a HIDDEN (not locked) layer still gets the group resize box; visibleIds is not consulted here unlike every gesture path.
- (mapper note) ADR 0022 fixes the pan model (middle-drag + right-drag only, no modifier-pan) and one hotkey scheme; ADR 0027 assigns right-TAP/long-press to the context menu. The menu is a portaled MUI Menu, so all scoping must tolerate the backdrop being the event target. usePanHandlers is mouse-only by contract — touch navigation belongs to the gesture machine area.

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(ADR 0006 §1 / canvas-interaction.md §7 I-3)** selectedIds.length === 1 ⇔ itemControls mirrors that item; length 0 or >1 ⇒ itemControls is null, and every selection path goes through setSelectedIds/setItemControls — never a new slice. → *Delete one item of a 2-item multi-selection via the context menu's bulk Delete: if the store drops the deleted ref but doesn't re-derive itemControls when length falls to 1, the panel target and F2/Delete dispatch point at nothing while selectedIds says one item. multiSelect.contract.test.ts only exercises setSelectedIds/toggleSelected directly, not post-delete re-derivation.*
- **(ADR 0006 §3 / canvas-interaction.md §7 I-1)** selectedIds can only ever contain interactable refs — locked/hidden-layer items are excluded from every selection path (Ctrl+A, lasso, click, context menu). → *Select 5 items, then toggle their layer to hidden (or locked) in the LayersPanel while the selection is live: nothing re-validates selectedIds on a layer-state change, so Delete or a group drag then mutates now-hidden/locked items. All guards test the acquisition paths, not selection invalidation on layer toggle.*
- **(canvas-interaction.md §6.1 (CSS-only drag preview, 5-part contract))** During a node drag the model is never written; live position lives only in --ff-drag-dx/dy vars and scene.connectors[].path via exactly ONE previewConnectorPaths call per frame wrapped in flushSync. → *Any new per-frame feature during drag (alignment guides, auto-pan at canvas edge, live distance readout) that issues a second scene.connectors[].path write per frame reintroduces wire flicker. The doc itself says the two-writer race has NO automated test — visual-only.*
- **(canvas-interaction.md §8 + ADR 0022 addendum)** Escape dispatch order is panel-clear → selection-clear → connector-abort (§4.5), while ADR 0022 says Esc returns to Select 'after first aborting an in-progress connector' — only CONNECTOR has a true Escape-abort. → *With a multi-selection active AND an in-flight connector (possible: draw connector while selection persists), one Escape may clear the selection instead of aborting the connector, or vice versa — the two documents state contradictory priority orders, and no test pins Escape behavior with both states simultaneously live.*
- **(canvas-interaction.md §6.6 (RAF throttle))** Move reducers run at most once per animation frame regardless of device event rate; down/up flush immediately. → *A new pointer path (pen with pointerrawupdate, or a touch handler added outside useRAFThrottle) drives Connector.mousemove at device rate → the per-frame model clone (§6.5 GC cliff) arrives in seconds instead of ~50s. The doc explicitly lists 'pointermove actually throttled under load' as an untested guard gap.*
- **(canvas-interaction.md §5.9 checklist item 1 + rendering §15)** Render/hit gates must filter by `layers.length === 0 || visibleIds.has(id)` — NOT `visibleIds.size === 0` (which empties when every item's layer is hidden, showing all). → *Hide ALL layers in the Layers panel: any layer using the `visibleIds.size === 0` escape-hatch predicate suddenly renders everything (paint layers use exactly `visibleIds.size > 0 && !visibleIds.has(id)`). No test hides every layer at once — all layer-visibility tests toggle one layer with others visible.*
- **(rendering guidelines §15)** Every component that paints an entity or exposes an interactive affordance re-applies the layer visible/locked filter itself — it is never inherited; locked-layer items may be selected but get a ring with NO transform handles. → *The label hit-proxies (LabelHitLayer/NodeLabelHitLayer) and the new ADR 0044 ScreenBoxTransformControls/size-readout pill are affordance layers added after the §15 sweep — if any iterates the raw scene list, a hidden layer's label chip stays grabbable (invisible drag) or a locked node still shows resize handles. The §15 fix audited RectanglesCanvas + ConnectorAnchorOverlay + TransformControlsManager; nothing prevents the next overlay from skipping the filter.*
- **(rendering guidelines §10 + ADR 0038 §5)** buildInstances runs only on scene/geometry change or LOD crossing; pan/zoom is one uniform write + one draw call, and data-build-count must stay flat across a pan. → *Adding visibleIds/lockedIds to a canvas's rebuild deps (per §15) with an unstable Set identity recreated on every store tick → geometry rebuilds per frame during pan. The anti-cheat only runs in the perf harness (PR-time, small-N), so an identity-instability regression on a rarely-run path ships green.*
- **(ADR 0022 §1/§3 + as-built note)** Single left-click is select-only; the details panel opens ONLY on double-click; right-tap opens the context menu, never the panel. → *The ADR's own as-built note admits no details-interaction.spec was ever created — double-click-opens-panel and name-drag-across-panel-keeps-it-open have zero e2e coverage. A refactor of resolveClickSelection that re-mirrors itemControls into an auto-open (the pre-0022 behavior) would ship green through the whole suite.*
- **(ADR 0022 §4 / ADR 0034 §1 (commit contracts))** Inline editors commit on left-click-away and cancel on right-click-away/Escape; clicks inside the strip or any MUI portal overlay must NOT end a text-box edit session. → *The click-away allowlist is selector-based (.MuiPopper-root etc.): a new overlay (the ADR 0039 color-picker popover, a future emoji picker) rendered with a different portal class ends the edit session mid-formatting, committing a half-styled box. useInlineRename.test covers canvas click-away; no test clicks each strip popover type during a live text-box session.*
- **(ADR 0034 §4 + testing.md S1-brick guard)** No dead writes: every strip write must be schema-legal at the write site — a strip range wider than a schema cap bricks saved diagrams at safeParse on reload (the connector-label 24→40 lesson). → *ADR 0044 group icon-resize: a uniform factor multiplies each member's startScale preserving ratios — a member already at 2.5× times factor 1.3 commits 3.25, outside the schema's hard [0.1,3] → the whole diagram fails safeParse on next load. TransformNode.test covers the single-node clamp; nothing asserts per-member clamping under group factor multiplication (and per-member clamping would itself violate 'relative sizes preserved').*
- **(ADR 0032 amendment (label ?? name fallback + seed))** Render source = label ?? name; seedNodeLabel copies name→label at LOAD so renaming identity name in Layers never moves canvas text. → *Create a node in-session (QuickAdd: name='Untitled', no label), then rename it in the Layers panel WITHOUT reloading: the seed only runs at load, the fallback renders name — so the canvas text moves with the identity rename, reproducing the exact #1 cross-persona confusion the amendment fixed, but only for never-reloaded nodes. Seed tests are load-path only.*
- **(canvas-interaction.md §5.9 checklist item 5 (Label preview channel))** Canvas-drawn elements publish a live drag preview channel (labelMove/labelMoves) that must be cleared on BOTH mouseup (after commit) and exit (escaped drag). → *Abort a group drag containing Labels via a mid-drag tool hotkey (DragItems.exit path): if clearLabelMoves runs only in the mouseup handler, the stale labelMoves map keeps painting Labels at the aborted offset while the model has them at origin — 'the element jumps when I next touch it'. DragItems.modes.test covers the commit path; the escaped-drag clear is the checklist's own warned gap.*
- **(ADR 0027 §4 + as-built note)** The context menu is the SOLE per-item command surface; no command is reachable only via a removed gesture; the catalogue keeps item-type parity (unsnap/collision/Add note for every eligible type). → *The ADR's as-built note admits there is NO unit test for CanvasContextMenu and only 'Unsnap from grid' is e2e-exercised. A new element type or a menu refactor that drops 'Disable collision' or 'Add note' for one type orphans that command entirely (its old surfaces are deleted) and every suite stays green.*
- **(ADR 0022 addendum (arrow keys) + ADR 0006)** Arrow keys nudge a selected ITEM/RECTANGLE/TEXTBOX one tile per press as a single-undo transaction; with nothing selected they pan. → *Arrow-nudge a selected floating LABEL or an off-grid (offset) item: Labels are absent from the enumerated nudge types (the recurring wired-into-some-surfaces bug), and nudging an off-grid item by one integer tile while keeping its offset may collide-check against the wrong cell. No test nudges a Label or an offset item.*

## Known coverage gaps (from the baseline inventory)

- (Rectangles) Rectangle fill/border/color styling
- (Rectangles) LEFT/BOTTOM edges and the other three corner handles
- (Rectangles) TOP edge resize in 2D projection
- (Rectangles) Inverted drag (resize past zero / crossing the opposite edge)
- (Rectangles) Rectangle copy/paste/duplicate
- (Rectangles) Undo of a rectangle resize or rotate
- (Rectangles) Zero-size / single-tile rectangle draw commit-vs-discard
- (Textboxes) Bold/italic/underline inline formatting controls
- (Textboxes) Font family/size/color on a textbox
- (Textboxes) Undo/redo during or immediately after a text edit session
- (Textboxes) Clicking a committed link inside a textbox (edit mode vs view mode behavior)
- (Textboxes) Very long content overflow/clipping behavior
- (Textboxes) Textbox copy/paste as an entity
- (Context menu scoping) Menu ITEM contents per element type (beyond zIndex, Unsnap, Delete paths tested elsewhere)
- (Context menu scoping) Menu dismissal on scroll/zoom/click-away
- (Context menu scoping) Context menu near viewport edges (flip/clamp)
- (Lib interaction modes + keyboard/pan handlers) packages/axoview-lib/src/interaction/useInteractionManager.ts — only static source-grep checks (dep arrays, F2 scope) plus keyboard dispatch; no direct behavioral tests of the event plumbing/mode routing itself

## Hypotheses

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
