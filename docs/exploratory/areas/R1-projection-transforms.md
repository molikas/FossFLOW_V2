# R1 — Projection & coordinate transforms (iso/2D/screen, off-grid)

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `PROJ-`

**Scope:** The two CoordinateTransformStrategy objects (isometricStrategy, cartesian2DStrategy) define tile->SceneLayer-px (toScreen), the inverses (fromCanvasPoint, fromScreen), and grid assets. CanvasModeContext binds them into getTilePosition/screenToTile/getProjectionCss for every consumer. renderedGeometry.ts is the single source of truth for composing the ADR-0023 off-grid `offset` (a post-projection SceneLayer-px residual) onto the integer tile: getRenderedTilePosition, getRenderedAreaCorners, footprintContainsPoint. useIsoProjection turns a tile range into CSS (position + iso matrix, or 2D with the Y-orientation rotate branch). getCanvasModeSwitchScroll preserves the viewport-centre tile across an iso<->2D switch.

**Code:**
- `packages/axoview-lib/src/utils/coordinateTransforms.ts`
- `packages/axoview-lib/src/contexts/CanvasModeContext.tsx`
- `packages/axoview-lib/src/hooks/useIsoProjection.ts`
- `packages/axoview-lib/src/utils/renderedGeometry.ts`
- `packages/axoview-lib/src/utils/isoMath.ts`
- `docs/adr/0023-off-grid-positioning-and-collision.md`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Canvas projection modes / rendering / viewport*, *Drag / collision / off-grid / snap*; Unit: *Lib geometry, coordinates, hit-testing & spatial utils*. Then grep the suites directly.

## Seed seams (2026-07-29 mapping — starting points, not a ceiling)

- isometricStrategy.fromScreen's y formula floors a composite `-Math.floor((projY + scaledH/2)/scaledH + projX/scaledW)` while x floors a different composite — the toScreen->fromScreen round-trip is asymmetric near tile boundaries; any hit-test or cull that assumes exact inversion at diamond edges can be off by one tile.
- renderedGeometry.ts hardcodes the iso matrix at 3-decimal precision (ISO_A=0.707, ISO_B=-0.409; same in NodesCanvas' ISO const) while getTilePosition uses the exact halfW=PROJECTED_TILE_SIZE.width/2 ratio — documented drift ~0.05px per tile of extent, so large rect/text-box corners slowly diverge from tile-projected node positions.
- `offset` is a SceneLayer-px residual applied AFTER projection (plain vector add in both modes); any consumer that rounds it into a tile or applies it pre-projection re-creates the 2026-07 bug cluster — renderedGeometry.contract.test.ts guards hand-rolled `getTilePosition(tile) + offset` compositions, but new code paths that never compose the offset at all (omission) are not caught by that grep-style contract.
- applyOriginOffset half-sizes differ per mode (iso halfW≈70.75/halfH≈40.95 vs 2D 50/50) — code that caches an origin-adjusted position across a canvas-mode switch, or mixes origin 'LEFT'/'TOP' constants between modes, misplaces by tens of px.
- useIsoProjection's 2D Y-orientation branch (`translateX(pxSize.height) rotate(90deg)`) is a special-cased transform with no iso-matrix equivalent — text boxes with orientation Y are the only consumer; selection bounds vs rendered content can mismatch if the branch and TransformControls disagree.
- getCanvasModeSwitchScroll round-trips a fractional tile through fromCanvasPoint/toScreen; the `if (!zoom)` degenerate guard returns the raw scroll — a zoom of 0/NaN sneaking in elsewhere silently skips re-projection.
- -0 handling is scattered (`+ 0`, `|| 0` in 2D toScreen/fromScreen) — new inverse-transform code that omits it produces -0 tile coords that fail strict-equality tile comparisons.
- (mapper note) screenToCanvasPoint/cursorCanvasPoint bridge raw mouse px to the off-grid space; hit-testing (hitDetection.ts) and placement (resolvePlacement.ts) consume them — bugs here surface as selection/placement misses rather than visual errors.

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(canvas-interaction.md §5.2 (computeNodeUpdates))** Node-group drag collision is all-or-nothing — any colliding target means NO node moves that frame; preview always holds the last non-colliding position, and that exact position commits on mouseup. → *Mixed group (nodes + rectangle) dragged into a collision: nodes freeze at the last valid preview but textbox/rectangle/anchor members are explicitly not collision-gated and keep translating — on mouseup the group's rigid relative offsets are torn apart. DragItems tests assert the node all-or-nothing rule in isolation, never mixed-type group rigidity across a blocked frame.*
- **(ADR 0023 §1 + §7 acceptance / clipboard)** Off-grid fields (offset/snap/collides) survive every persistence and duplication path; absent fields default to snapped/colliding. → *Ctrl+C/Ctrl+V (or context-menu Duplicate) of an unsnapped off-grid node: clipboard.ts/useCopyPaste reconstruct view items — if they omit offset/snap/collides, the paste silently re-snaps and re-enables collision. The ADR's round-trip test covers export→import, and ADR 0044 names clipboard as 'the real risk site' for iconScale — the same hole exists for the 0023 trio with no clipboard round-trip test.*
- **(ADR 0023 addendum B + renderedGeometry.contract.test.ts)** No file outside utils/renderedGeometry.ts may hand-roll tile+offset composition; an offset must never be rounded into a tile. → *The contract test greps three specific regex patterns (offset?.x ?? 0, base.x + it.offset.x, ${it.offset.x}px). A new composition written as `const {x: ox = 0} = item.offset ?? {}; left = px.x + ox` evades all three regexes while violating the invariant — the regex gate rots silently as coding style shifts.*
- **(ADR 0023 Consequences + addendum D)** A connector anchored to an offset/unsnapped node must resolve to the RENDERED (offset) endpoint on both the WebGL bulk path and the DOM selected path. → *Select a connector attached to an off-grid node: the sparse DOM <Connector> (selection halo) and the WebGL ConnectorsCanvas body must agree on the endpoint. If one resolves via bare tile and the other via rendered position, selecting/deselecting makes the wire visibly jump at the node. The invariant suite asserts DOM/WebGL equality for rectangle vertices, not connector endpoints at offset nodes.*
- **(testing.md ADR 0023 additions (snap-grid.spec freeze test))** Turning global snap ON does not re-snap existing off-grid items. → *A future load-time normalization or 'cleanup' migration that drops offset when snap is globally on — the e2e freeze test covers the toggle in-session, but a load-path normalization (e.g. in useInitialDataManager, where seeds already run) would re-snap on reload and no reload-with-global-snap-on test exists.*
- **(rendering guidelines §8)** Any GPU layer whose geometry is projected must list strategy.projectionName in its rebuild deps; a DOM hit-proxy and its GPU paint must share one projection. → *Switch iso→2D in VIEW mode using the new viewer projection toggle (PR #84): if any of the four bulk canvases (or a future one) omits projectionName from deps, its paint stays in the old projection while hit-proxies move — the exact Labels bug, now reachable from a brand-new code path (PreviewCanvasModeToggle) that no e2e drives through all four layers.*
- **(technical-review-2026-07-29 finding #5 (useCanvasModeToggle))** Exactly ONE useCanvasModeToggle consumer may be live at a time — two mounted simultaneously each apply the scroll correction, double-jumping the viewport. → *A future surface (mobile chrome, export dialog's hidden Axoview instance, or the present-chrome toggle rendered alongside ToolMenu in some mode combination) mounts a second consumer: every projection switch jumps the viewport by 2× the correction. The invariant is comment-only; the review names it as the same unenforced-invariant class as the 0023 offset cluster, with the contract-test remedy still unwritten.*
- **(ADR 0044 §4 (iconScale resolution order))** Every render reader resolves viewItem.iconScale ?? icon.scale ?? 1 — DOM icon paths, WebGL NodesCanvas, selection-ring extent, and image export must agree. → *A reader outside the four audited ones — the hover outline box, NodeLabelHitLayer's chip stalk anchor, or the ADR 0012 popover's side-anchor offset — computes extent from icon.scale only: a per-node-resized icon shows a ring/label/popover anchored to the wrong extent. Unit tests cover the mode math and schema round-trip; a missed reader is visual-only and CI is pixel-blind (§11).*
- **(ADR 0044 §6 + ADR 0023 addendum (hit-testing))** Icon resize is visual-only — the node keeps a single-tile footprint for collision/hit/anchoring; meanwhile off-grid hit-testing compares px against RENDERED footprints. → *An enlarged (2.5×) off-grid node: getItemAtTile's px footprint test and the tile-footprint rule pull in opposite directions — if hover/selection chrome traces the scaled extent (ADR 0044 third pass) but click hit-testing stays tile-sized, the user can hover-highlight a spot they cannot click. The renderedGeometry invariant suite's corpus predates iconScale and doesn't parametrize over it.*
- **(canvas-interaction.md §5.9 checklist item 5 (Label preview channel))** Canvas-drawn elements publish a live drag preview channel (labelMove/labelMoves) that must be cleared on BOTH mouseup (after commit) and exit (escaped drag). → *Abort a group drag containing Labels via a mid-drag tool hotkey (DragItems.exit path): if clearLabelMoves runs only in the mouseup handler, the stale labelMoves map keeps painting Labels at the aborted offset while the model has them at origin — 'the element jumps when I next touch it'. DragItems.modes.test covers the commit path; the escaped-drag clear is the checklist's own warned gap.*
- **(ADR 0022 addendum (arrow keys) + ADR 0006)** Arrow keys nudge a selected ITEM/RECTANGLE/TEXTBOX one tile per press as a single-undo transaction; with nothing selected they pan. → *Arrow-nudge a selected floating LABEL or an off-grid (offset) item: Labels are absent from the enumerated nudge types (the recurring wired-into-some-surfaces bug), and nudging an off-grid item by one integer tile while keeping its offset may collide-check against the wrong cell. No test nudges a Label or an offset item.*
- **(features.md (viewer-controlled projection, PR #84))** canvasMode in view-only mode is viewer-local UI state persisted only to that viewer's localStorage — switching projection can neither dirty nor save the diagram. → *A viewer switches to 2D on the /display route; the localStorage key is shared with the editor — the OWNER later opens the editor in the same browser and their diagram opens in 2D with a recentered scroll they never chose, and if any editor-side code treats canvasMode as model-adjacent (e.g. included in a future save payload or dirty-diff), a pure viewer action dirties the document. Tests assert non-dirty in view mode only, not the shared-key bleed into edit mode.*

## Known coverage gaps (from the baseline inventory)

- (Drag / collision / off-grid / snap) Escape mid-node-drag cancels and restores the origin position
- (Drag / collision / off-grid / snap) Multi-select drop where only SOME target tiles are occupied (partial collision)
- (Drag / collision / off-grid / snap) Collision semantics between a node and an off-grid/unsnapped neighbour during drag
- (Drag / collision / off-grid / snap) Drag at extreme zoom-out / near canvas edge
- (Drag / collision / off-grid / snap) An explicit 're-snap this item' action
- (Canvas projection modes / rendering / viewport) Mouse-wheel zoom anchoring at the cursor position
- (Canvas projection modes / rendering / viewport) Zoom clamp bounds via buttons/wheel (only touch pinch asserts [0.1,1])
- (Canvas projection modes / rendering / viewport) Fit-to-view exact framing (all items visible) — only 'value changed' asserted
- (Canvas projection modes / rendering / viewport) Projection mode persistence across reload
- (Canvas projection modes / rendering / viewport) 2D label stalk rendering parity
- (Lib geometry, coordinates, hit-testing & spatial utils) packages/axoview-lib/src/utils/pathfinder.ts — zero tests (connector path routing algorithm)
- (Lib geometry, coordinates, hit-testing & spatial utils) packages/axoview-lib/src/utils/hitDetection.ts — zero direct tests (only exercised indirectly through renderer.test getItemAtTile)
- (Lib geometry, coordinates, hit-testing & spatial utils) packages/axoview-lib/src/utils/coordsUtils.ts, sizeUtils.ts, selectableRefs.ts, labelChip.ts, connectorLabels.ts, renderProbe.ts, tooltipWithShortcut.ts — zero tests

## Hypotheses

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
