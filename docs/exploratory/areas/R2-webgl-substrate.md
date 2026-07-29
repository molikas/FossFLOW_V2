# R2 — WebGL sprite-batch substrate (atlas, shaders, context loss)

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `GL-`

**Scope:** createSpriteBatch is the shared WebGL2 instanced renderer: one mipmapped shelf-packed atlas (content-keyed putCanvas/putImage, reserved dot+white texels, half-texel UV inset via atlasUVRect), 20-float per-instance staging, and a vertex shader that maps tile-space anchors + local basis vectors through u_view=(zoom*dpr, originDev) — pan/zoom is one uniform write + one drawArraysInstanced. shapeMode 1/2 does analytic edge-AA (fwidth distance-field) for lines/discs; premultiplied-alpha pipeline throughout. itemRaster rasterises node/label chips via Canvas2D at CHIP_SUPERSAMPLE*min(dpr,2). lineStyle walks dash/dot patterns by integer index (float-cursor stall fix) and builds AA-feathered stroke quads. contextLoss preventDefaults webglcontextlost so restore can fire; each layer rebuilds its batch on restore. isWebGL2Supported is the memoised one-shot gate for the whole substrate.

**Code:**
- `packages/axoview-lib/src/webgl/glSpriteBatch.ts`
- `packages/axoview-lib/src/webgl/itemRaster.ts`
- `packages/axoview-lib/src/webgl/lineStyle.ts`
- `packages/axoview-lib/src/webgl/contextLoss.ts`
- `packages/axoview-lib/src/webgl/__tests__/atlasUV.test.ts`
- `docs/adr/0038-webgl-instanced-render-substrate.md`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Canvas projection modes / rendering / viewport*; Unit: *Lib WebGL rendering*. Then grep the suites directly.

## Seed seams (2026-07-29 mapping — starting points, not a ceiling)

- atlasFull semantics: an overflowing chip is silently SKIPPED for the current build (packSlot returns null) and the atlas only compacts on the NEXT beginInstances — if nothing dirties geometry afterwards, the missing chips persist on screen indefinitely; nothing schedules a follow-up rebuild when atlasFull is set.
- ConnectorsCanvas captures arrowUV/ringUV ONCE at effect setup (outside buildInstances); resetAtlas clears uvCache and resumes the shelf cursor just past dot+white — after any compaction of the 512 atlas the arrow/ring texels are overwritten while the captured UVRects still point at them (they are re-packed only on context RESTORE, not on compaction).
- isWebGL2Supported is memoised forever and is strictly weaker than createSpriteBatch (no shader compile / atlas alloc) — a browser that passes the probe but fails batch creation gets a console.warn and a permanently blank layer with no user-visible signal.
- Context budget: each Renderer opens 4 WebGL2 contexts and image-export mounts a second Renderer (8 live) against the browser's ~16-context cap; eviction force-loses the OLDEST context — recovery depends entirely on the webglcontextrestored path, and if createSpriteBatch returns null inside onRestored the layer goes blank with no retry loop.
- putImage caches by key (icon URL) with no version — an icon whose content changes under the same URL keeps the stale atlas texture until context loss or eviction of the whole batch.
- Premultiplied invariants: UNPACK_PREMULTIPLY_ALPHA_WEBGL + shader tint premultiply + ONE/ONE_MINUS_SRC_ALPHA must all agree; any new upload path or blend change reintroduces the grey-fringe artifact the comments document.
- walkDots/walkDashes cap at MAX_SPANS_PER_SEGMENT=20000 — a pathologically small dash period silently truncates the pattern mid-segment; the kStart epsilons (1e-6) can double-emit or skip a dot exactly at a vertex arc-length.
- itemRaster's single module-level scratch canvas is shared by NodesCanvas AND LabelsCanvas — safe only while putCanvas uploads synchronously; any future async/deferred upload corrupts one layer's chip with another's pixels.
- (mapper note) Everything here is pixel-blind to CI (jsdom has no WebGL2); the unit tests cover only atlasUVRect and lineStyle math. Bugs in this area manifest as visual artifacts only on real GPUs.

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(ADR 0023 Consequences + addendum D)** A connector anchored to an offset/unsnapped node must resolve to the RENDERED (offset) endpoint on both the WebGL bulk path and the DOM selected path. → *Select a connector attached to an off-grid node: the sparse DOM <Connector> (selection halo) and the WebGL ConnectorsCanvas body must agree on the endpoint. If one resolves via bare tile and the other via rendered position, selecting/deselecting makes the wire visibly jump at the node. The invariant suite asserts DOM/WebGL equality for rectangle vertices, not connector endpoints at offset nodes.*
- **(ADR 0044 §4 (iconScale resolution order))** Every render reader resolves viewItem.iconScale ?? icon.scale ?? 1 — DOM icon paths, WebGL NodesCanvas, selection-ring extent, and image export must agree. → *A reader outside the four audited ones — the hover outline box, NodeLabelHitLayer's chip stalk anchor, or the ADR 0012 popover's side-anchor offset — computes extent from icon.scale only: a per-node-resized icon shows a ring/label/popover anchored to the wrong extent. Unit tests cover the mode math and schema round-trip; a missed reader is visual-only and CI is pixel-blind (§11).*
- **(ADR 0031 §2 + ADR 0038 fold)** A floating Label renders ABOVE nodes (cross-layer z-order was the reason Labels became a first-class entity). → *The z-order is now encoded in the mount order of sibling WebGL canvases in Renderer.tsx — a refactor that reorders canvas mounting (or an overlay inserted between them, like CanvasCompositorOverlay tweaks) silently puts labels back under nodes. Tests assert model zIndex fields; nothing asserts the paint stacking of LabelsCanvas over NodesCanvas.*

## Known coverage gaps (from the baseline inventory)

- (Canvas projection modes / rendering / viewport) Mouse-wheel zoom anchoring at the cursor position
- (Canvas projection modes / rendering / viewport) Zoom clamp bounds via buttons/wheel (only touch pinch asserts [0.1,1])
- (Canvas projection modes / rendering / viewport) Fit-to-view exact framing (all items visible) — only 'value changed' asserted
- (Canvas projection modes / rendering / viewport) Projection mode persistence across reload
- (Canvas projection modes / rendering / viewport) 2D label stalk rendering parity
- (Lib WebGL rendering) packages/axoview-lib/src/webgl/glSpriteBatch.ts — zero tests (batching/draw-call assembly)
- (Lib WebGL rendering) packages/axoview-lib/src/webgl/itemRaster.ts — zero tests (icon rasterization to atlas)
- (Lib WebGL rendering) packages/axoview-lib/src/webgl/contextLoss.ts — zero tests (context-loss recovery)

## Hypotheses

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
