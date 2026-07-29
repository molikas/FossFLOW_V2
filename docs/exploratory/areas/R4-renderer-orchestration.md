# R4 — Renderer orchestration (culling, hybrid promotion, fit-to-view)

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `RND-`

**Scope:** Renderer.tsx is the composition root: computes coarse tile bounds from the 4 viewport corners (screenToTile + 4-tile padding), throttles re-culling during continuous gestures (250/180/120ms windows) via a store subscriber that setStates coarseBounds, and derives visibleItems/visibleConnectors/visibleLabels with useStableList ref-reuse so memoised layers bail. It decides the DOM/GPU hybrid split: selected node, drag set, label-drag node, icon-resize targets -> DOM <Nodes> (skipNodes for the canvas); selected/lasso'd/degenerate/unroutable connectors -> DOM <Connectors>; dragged rects -> DOM <Rectangles>; inline-edited text box promoted above the interactions box. It also applies deferred fit-to-view synchronously in useLayoutEffect (getBoundingClientRect before first paint) and gates everything behind isWebGL2Supported. SceneLayer applies translate(scroll) scale(zoom) about the renderer centre via a store subscription (no React on pan) — the CSS mirror of the GL u_view transform.

**Code:**
- `packages/axoview-lib/src/components/Renderer/Renderer.tsx`
- `packages/axoview-lib/src/components/Renderer/WebGLUnsupportedScreen.tsx`
- `packages/axoview-lib/src/components/SceneLayer/SceneLayer.tsx`
- `packages/axoview-lib/src/components/SceneLayers/Nodes/Nodes.tsx`
- `packages/axoview-lib/src/components/SceneLayers/Connectors/Connectors.tsx`
- `packages/axoview-lib/src/components/SceneLayers/TextBoxes/TextBoxes.tsx`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Canvas projection modes / rendering / viewport*, *Performance*; Unit: *Lib UI components*. Then grep the suites directly.

## Seed seams (2026-07-29 mapping — starting points, not a ceiling)

- Culling keys on item.tile / label.tile only — the ADR-0023 `offset` is ignored, so an item whose px residual pushes it visually into the viewport while its tile sits beyond the 4-tile padding is culled while on-screen (offsets are normally sub-tile, but nothing clamps them).
- Connector culling uses hitConnectors' path.rectangle AABB then maps back to raw connectors by id — a connector present in `connectors` but missing from `hitConnectors` (or with a stale path after an edit) silently disappears from both DOM and GPU sets.
- coarseBounds is recomputed ONLY inside the store subscriber (scroll/zoom/rendererSize writes) — on a canvasMode switch the effect re-subscribes with the new screenToTile but never recomputes bounds itself; correctness relies on the mode-switch action also writing scroll. If it doesn't (or writes an identical ref), culling runs with the OLD projection's tile bounds.
- The gesture throttle (PAN_GESTURE_GAP_MS/PAN_BOUNDS_THROTTLE_MS/PAN_SETTLE_MS) means mid-fling the visible set lags up to ~180ms — pop-in beyond the 4-tile padding at high fling speed on large monitors; the trailing settle flush depends on the `pending` closure surviving to the timeout.
- Hybrid promotion is a two-sided contract: Renderer must EXCLUDE promoted ids from the canvas set AND include them in the DOM overlay, while NodesCanvas flushes skipNodes synchronously (useLayoutEffect drawNow) — any timing gap draws a node twice (ghosting) or zero times (flash). Same duality for connectors: ConnectorsCanvas independently re-derives the skip (unroutable / tiles.length<2 from sceneStore) while Renderer derives connectorHybridIds from hitConnectors — two sources that must agree.
- Promotion keys are comma-joined id strings (draggingKey, resizingNodesKey, selectedConnectorKey) chosen for primitive-selector stability — an id containing a comma, or a mode that moves items without a matching promotion path (new transform tool), silently falls back to per-frame canvas staleness.
- Rectangles and text boxes are NOT viewport-culled at all (whole arrays passed down) — fine today, but a scale assumption that differs from nodes/connectors/labels.
- pendingFitToView useLayoutEffect: falls back from getBoundingClientRect to store rendererSize; if both are 0 it returns and waits for a rendererSize write — a container that never resizes (display:none mount) leaves pendingFitToView stuck true.
- SceneLayer's CSS transform and the GL u_view are two implementations of the same mapping (translate+scale about center vs zoom*tile+W/2+scroll) — sub-pixel rounding differences between DOM-promoted and GPU-bulk copies of the same element are visible as a 1px jump on selection/deselection.
- (mapper note) The long Renderer comments are load-bearing history (why culling is throttled, why each promotion exists). useStableList's element-wise ref reuse is what keeps the connector layers from re-rendering per pan frame — breaking referential stability upstream (useScene) cascades into per-frame GPU rebuilds.

## Known coverage gaps (from the baseline inventory)

- (Canvas projection modes / rendering / viewport) Mouse-wheel zoom anchoring at the cursor position
- (Canvas projection modes / rendering / viewport) Zoom clamp bounds via buttons/wheel (only touch pinch asserts [0.1,1])
- (Canvas projection modes / rendering / viewport) Fit-to-view exact framing (all items visible) — only 'value changed' asserted
- (Canvas projection modes / rendering / viewport) Projection mode persistence across reload
- (Canvas projection modes / rendering / viewport) 2D label stalk rendering parity
- (Performance) Perf thresholds that FAIL the suite on regression
- (Performance) Zoom/pan frame-rate measurement
- (Performance) Large-diagram load time
- (Lib UI components) zero-test lib components: Renderer/Renderer.tsx, SceneLayer, Grid (formula tested only via perf grep-free math), AnnotationLayer/AnnotationLayer.tsx, AnnotationPalette, CanvasContextMenu, ConnectorAnchorOverlay, ConnectorSettings, LayersPanel, ZoomControls, SettingsDialog, ZoomSettings, HotkeySettings, IconPackSettings, HelpDialog, LeftDock, BottomDock, RightSidebar.tsx, DragAndDrop, ModeHint, PreviewLayerSwitcher, PreviewCanvasModeToggle, TopBarStyleControls, ElementLinkCard, CanvasCompositorOverlay, DOMErrorBoundary, Cursor, Lasso/FreehandLasso overlays, Svg, UiElement
- (Lib UI components) ItemControls panels (NodeSettings/ConnectorSettings/RectangleSettings/TextBoxSettings etc.) have only the two-section parity test — no per-control behavior tests
- (Lib UI components) ExportImageDialog behavior beyond waitForIconsDrawn is covered only by static source-grep tests (initialLoad/memo)

## Hypotheses

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
