# R3 — Bulk GPU scene layers (build/invalidation, style parity, LOD)

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `GPU-`

**Scope:** Four memoised canvas components own one sprite batch each. buildInstances (O(N), scene-change only) resolves painter's order (resolveRenderOrder: layer order, zIndex, -x-y), rasterises/packs chips and icons, and emits instances; drawGLBatch (per frame) recomputes counterScale + backing store and issues one draw. Invalidation is dual-path: zustand subscribers (scroll/zoom -> drawNow synchronously in the pan rAF; content flags -> geomDirty) plus React effects on props/context (nodes, layers, visibleIds, strategy.projectionName, theme). NodesCanvas additionally gates labels by LOD (zoom >= 0.25 unless readableLabels), manages the icon decode() gate (black-atlas-tile prevention), and skips hybrid-promoted nodes. ConnectorsCanvas/RectanglesCanvas probe the projection's linear map per build (widthScale, L matrix) to scale authored unprojected widths and iso-shear the arrow; RectanglesCanvas insets fills by halfStroke against the analytic-AA border. computeBackingStore clamps dpr so W*dpr fits canvas caps, feeding BOTH buffer size and u_view.

**Code:**
- `packages/axoview-lib/src/components/SceneLayers/Nodes/NodesCanvas.tsx`
- `packages/axoview-lib/src/components/SceneLayers/Labels/LabelsCanvas.tsx`
- `packages/axoview-lib/src/components/SceneLayers/Connectors/ConnectorsCanvas.tsx`
- `packages/axoview-lib/src/components/SceneLayers/Rectangles/RectanglesCanvas.tsx`
- `packages/axoview-lib/src/utils/labelChip.ts`
- `packages/axoview-lib/src/utils/renderOrder.ts`
- `packages/axoview-lib/src/utils/renderTarget.ts`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Canvas projection modes / rendering / viewport*; Unit: *Lib WebGL rendering*, *Lib UI components*. Then grep the suites directly.

## Seed seams (2026-07-29 mapping — starting points, not a ceiling)

- The geomDirty invalidation matrix differs per layer: NodesCanvas watches readableLabels/previewHideLabels/exportHideLabels/editorMode + model items/icons; LabelsCanvas watches labelMove/labelMoves/inlineEditLabelId; Connectors watches sceneStore.connectors + model.colors; Rectangles watches only model.colors via subscription (rect geometry arrives via props). Any new store field that changes drawn output but is missing from the right subscriber leaves a stale GPU frame until an unrelated change rebuilds — the classic bug shape here.
- Icon pipeline: img.decode() rejection falls back to `img.onload = markReady` — for a URL that is already complete but broken (naturalWidth 0) neither fires, so the icon never draws and canvas.dataset.allIconsDrawn stays 'false' forever (blocks the export readiness gate); also getImage caches the Image by URL before decode succeeds, so a transient network failure is never retried.
- LOD gaps: node name chips vanish below zoom 0.25 (LABEL_LOD_ZOOM) while NodeLabelHitLayer removes its hit divs below zoom 0.4 (HIT_MIN_ZOOM) — between 0.25 and 0.4 labels are visible but their drag hit-targets exist, below 0.25 with readableLabels ON chips still draw but hit divs are gone: draw/hit visibility is decided in two files with different thresholds.
- Cross-layer z-order is fixed by DOM stacking (RectanglesCanvas < Grid < ConnectorsCanvas < TextBoxes < NodesCanvas < LabelsCanvas < ConnectorLabels); per-element zIndex sorts only WITHIN a canvas — a zIndex intended to lift a connector above a node can never work, and Grid lines intentionally paint OVER rectangle fills (surprising to a fresh reader; changing child order in Renderer silently reshuffles the scene).
- widthScale / the L matrix are probed from getTilePos unit steps at BUILD time — correctness after an iso<->2D switch depends on each layer's React effect deps re-dirtying geometry (ConnectorsCanvas keys on getTilePosition identity, Nodes/Labels/Rectangles on strategy.projectionName); the LabelsCanvas comment records exactly this bug class (GPU chips stranded at the old projection while DOM hit proxies move).
- computeBackingStore's contract: the clamped dpr MUST feed both the buffer size and u_view scale/origin — chip SUPERSAMPLE still uses raw min(devicePixelRatio,2), so on 3x screens chips are rasterised at 2x but rendered on a (possibly clamped) higher-dpr buffer: soft-but-accepted; a future edit mixing the two dprs desyncs scene and buffer (browser upscales, everything blurs/offsets).
- GPU node chip text is measured (measureNodeLabel innerW = min(250-2padX, nameW)) but fillText draws the FULL name clipped hard at the texture edge — the DOM Label path ellipsizes/hides overflow; long names render differently between the bulk (GPU) and the selected (DOM) node.
- buildCount / drawCount / allIconsDrawn dataset attributes are the perf-harness anti-cheat contract (must stay FLAT during pan) — an innocent-looking call to buildInstances from a per-frame path passes all visual checks but breaks the no-per-frame-CPU invariant the e2e harness asserts.
- Rounded rectangle corners are approximated as sharp on the GPU bulk (noted in RectanglesCanvas header) — a deliberate parity gap between the bulk and the dragged DOM rect.
- (mapper note) All four layers use the same skeleton (refs mirroring props, scheduleDraw/drawNow, contextLost flag). Because the pattern is copy-adapted, a fix applied to one layer routinely misses the others — compare all four when hunting.

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(ADR 0006 §3 / canvas-interaction.md §7 I-1)** selectedIds can only ever contain interactable refs — locked/hidden-layer items are excluded from every selection path (Ctrl+A, lasso, click, context menu). → *Select 5 items, then toggle their layer to hidden (or locked) in the LayersPanel while the selection is live: nothing re-validates selectedIds on a layer-state change, so Delete or a group drag then mutates now-hidden/locked items. All guards test the acquisition paths, not selection invalidation on layer toggle.*
- **(rendering guidelines §10 + ADR 0038 §5)** buildInstances runs only on scene/geometry change or LOD crossing; pan/zoom is one uniform write + one draw call, and data-build-count must stay flat across a pan. → *Adding visibleIds/lockedIds to a canvas's rebuild deps (per §15) with an unstable Set identity recreated on every store tick → geometry rebuilds per frame during pan. The anti-cheat only runs in the perf harness (PR-time, small-N), so an identity-instability regression on a rarely-run path ships green.*
- **(ADR 0034 §1 + Lucid-parity pass (empty-box lifecycle))** An edit session that ends still-empty deletes the text box — commit-empty and cancel-on-never-committed alike; no invisible zero-width ghost may remain. → *End a session whose content is Quill's structural residue (`<p><br></p>`, or whitespace-only after &nbsp; normalization): if the emptiness check compares raw HTML rather than stripped text, an invisible ghost box survives, is lasso-selectable, and counts in Ctrl+A. Tests cover the plain-empty case, not the structural-residue cases.*
- **(ADR 0036 §2 + known_issues (root-folder detection))** ADR 0036 promises the provider detects a deleted/trashed Drive root folder; as-built, isAvailable() only checks auth and the cached root id is never revalidated. → *Trash the app folder in Drive's own UI mid-session: autosaves keep 200-OK patching files in the trash for the rest of the session; loss surfaces only at next full listing. The cheap fix (invalidate on zero-listing or 404) is catalogued but unimplemented — any test asserting 'save succeeded ⇒ durable' is false here.*
- **(ADR 0027 §4 + as-built note)** The context menu is the SOLE per-item command surface; no command is reachable only via a removed gesture; the catalogue keeps item-type parity (unsnap/collision/Add note for every eligible type). → *The ADR's as-built note admits there is NO unit test for CanvasContextMenu and only 'Unsnap from grid' is e2e-exercised. A new element type or a menu refactor that drops 'Disable collision' or 'Add note' for one type orphans that command entirely (its old surfaces are deleted) and every suite stays green.*
- **(ADR 0012 + known_issues (passive badges))** View-mode clickability: a node is clickable when it has link, headerLink, description, or notes; the info popover shows for any content-bearing item with parity across node/connector/rectangle/text box; items with no content show nothing. → *Floating Labels (added after ADR 0012) carry headerLink — if the view-mode popover/click path never gained a LABEL branch, a linked Label is dead in present mode (hover shows pointing-finger via one path but click opens nothing). The parity tests enumerate the original four types; nothing asserts the fifth.*

## Known coverage gaps (from the baseline inventory)

- (Canvas projection modes / rendering / viewport) Mouse-wheel zoom anchoring at the cursor position
- (Canvas projection modes / rendering / viewport) Zoom clamp bounds via buttons/wheel (only touch pinch asserts [0.1,1])
- (Canvas projection modes / rendering / viewport) Fit-to-view exact framing (all items visible) — only 'value changed' asserted
- (Canvas projection modes / rendering / viewport) Projection mode persistence across reload
- (Canvas projection modes / rendering / viewport) 2D label stalk rendering parity
- (Lib WebGL rendering) packages/axoview-lib/src/webgl/glSpriteBatch.ts — zero tests (batching/draw-call assembly)
- (Lib WebGL rendering) packages/axoview-lib/src/webgl/itemRaster.ts — zero tests (icon rasterization to atlas)
- (Lib WebGL rendering) packages/axoview-lib/src/webgl/contextLoss.ts — zero tests (context-loss recovery)
- (Lib UI components) zero-test lib components: Renderer/Renderer.tsx, SceneLayer, Grid (formula tested only via perf grep-free math), AnnotationLayer/AnnotationLayer.tsx, AnnotationPalette, CanvasContextMenu, ConnectorAnchorOverlay, ConnectorSettings, LayersPanel, ZoomControls, SettingsDialog, ZoomSettings, HotkeySettings, IconPackSettings, HelpDialog, LeftDock, BottomDock, RightSidebar.tsx, DragAndDrop, ModeHint, PreviewLayerSwitcher, PreviewCanvasModeToggle, TopBarStyleControls, ElementLinkCard, CanvasCompositorOverlay, DOMErrorBoundary, Cursor, Lasso/FreehandLasso overlays, Svg, UiElement
- (Lib UI components) ItemControls panels (NodeSettings/ConnectorSettings/RectangleSettings/TextBoxSettings etc.) have only the two-section parity test — no per-control behavior tests
- (Lib UI components) ExportImageDialog behavior beyond waitForIconsDrawn is covered only by static source-grep tests (initialLoad/memo)

## Hypotheses

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
