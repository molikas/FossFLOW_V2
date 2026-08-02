# ADR 0038 — WebGL2 Instanced GPU Render Substrate (T4)

**Status:** Accepted (shipped with the WebGL-fold productization, PR #63)
**Date:** 2026-07-08
**Supersedes:** ADR 0019 (Canvas2D node render layer) — as the *bulk substrate* only; see §7
**Related:** ADR 0020 (perf harness — amended same day, GPU draw-count anti-cheat), ADR 0015/0024 (label legibility/positioning — now computed in the vertex shader), ADR 0025 (image export — depends on `preserveDrawingBuffer`), ADR 0008 (surface vocabulary — the unsupported-browser *Screen*)
**Fidelity rules:** [docs/guidelines/canvas-rendering-guidelines.md](../guidelines/canvas-rendering-guidelines.md) — the GPU pitfalls-and-rules companion (premultiplied pipeline, atlas UV, geometry walkers, crisp-iso follow-up); clears the §Deferred items below as they close.

## Context

ADR 0019 made Canvas2D the bulk node-render substrate and explicitly named a
future **T4 = WebGL instanced** rung (ADR 0020 tier ladder) for sustaining
thousands of moving entities. That rung has now shipped: `glSpriteBatch`
(instanced, single-atlas WebGL2) renders nodes, labels, connector bodies and
rectangle bodies as **one `drawArraysInstanced` per layer per frame**, with the
tile→screen transform (isometric shear + label counter-scale) computed in the
vertex shader. Geometry uploads **once per scene change**; pan/zoom is one
uniform update. Result: navigation is **O(1) on the CPU at any N**.

Measured (real GPU, AC power, all-element-types pan — N nodes + ~N connectors
each with 3 labels + grouping rectangles + floating labels):

| N | before (all DOM/Canvas2D) | after (all GPU) |
|---|---|---|
| 1000 | 22.8 ms | **16.67 ms (60 fps)** |
| 2000 | 45.5 ms (653 ms long-tasks) | **16.67 ms** |
| 5000 | ~100 ms+ | **16.67 ms** |

Every "after" cell reports `noCPU-rebuild=true` + `longtask=0` (see §5).

This ADR records the load-bearing contracts of the substrate — the things a
future contributor will otherwise re-derive or violate.

## Decision

**1. WebGL2 is the sole bulk render substrate.** There is no Canvas2D/DOM
bulk fallback. A browser without a working WebGL2 batch is shown the
`WebGLUnsupportedScreen` gate (a *Screen* per ADR 0008), rendered by `Renderer`
when `isWebGL2Supported()` is false, rather than a silent blank canvas or a
slow DOM path. This is the Lucid-app model: WebGL2 is a hard requirement.
(The prior Canvas2D bulk fallback and the `__axoviewNoGpuFold` A/B knob were
removed as dead code in the same change.)

**2. DOM/GPU hybrid boundary.** The GPU draws the bulk; the DOM keeps only a
**sparse hybrid** — this is an interaction/editing layer, NOT a fallback, and it
coexists with the GPU permanently:
- selected node + drag set **+ the name-label-drag node** (`hybridNodes` → DOM
  `<Nodes>`), for F2 inline-rename, the drag preview, and the label-as-handle drag;
- selected connector (single `itemControls` **and** every multi-selected
  `selectedIds` connector — a lasso selects into `selectedIds`), degenerate
  1-tile connectors (dot cue), and unroutable connectors (error badge)
  (`connectorHybridIds` → DOM `<Connectors>`);
- the dragged rectangle (`rectHybridIds` → DOM `<Rectangles>`);
- **all** connector labels (`<ConnectorLabels>` over the full visible set — there
  is no GPU connector-label layer), and the inline-edited text box.

**3. Picking stays geometric.** All hit-testing is `getItemAtTile` over scene
data (`hitConnectors`/rectangles/nodes), never GPU readback. Removing a visible
element from the DOM must never change what is selectable.

**4. Export depends on `preserveDrawingBuffer: true`.** The GL context is
created with `preserveDrawingBuffer: true` so `dom-to-image-more` can capture the
drawn layer via `canvas.toDataURL()`/`drawImage` (ADR 0025). This costs some
frame throughput (the browser cannot fast-swap/discard the buffer) but is
required for image export to include GPU-painted content. Non-negotiable.

**5. No per-frame CPU geometry work (folded from `no-cpu-work-check.md`).**
`buildInstances` runs only on a scene/geometry change or an LOD-band crossing —
never during pan/zoom. The harness asserts this machine-checkably via each
canvas's `data-build-count` staying flat across a pan (`buildDelta === 0` in
`measurePan`). Any change that rebuilds geometry per frame is a regression.

**6. Fidelity trade — texture-atlas chip cache.** Node/label chips are
rasterised by Canvas2D (`itemRaster`) into a content-keyed atlas at
`CHIP_SUPERSAMPLE`×dpr, then sampled through mipmaps. Glyphs stay crisp to ~2×
zoom-in and clean (mip-minified) when zoomed out; beyond ~2× zoom-in they
soften — the one fidelity trade vs the old per-frame Canvas2D re-raster.
Effective dpr is **clamped at 2** for chip rasterisation (a 3× screen would
otherwise rasterise at 6× = 36× area). The node atlas is **8192²**, capped to
**4096²** (~67 MB vs ~268 MB) on high-DPR/mobile (`devicePixelRatio ≥ 2`), and
clamped to `MAX_TEXTURE_SIZE`. Backing-store dimensions are the caller's concern
(see the deferred viewport clamp, §Deferred).

## Deferred (recorded, not yet shipped)

These were scoped in the productization audit and deliberately deferred; each is
a follow-up, not a silent gap:

- **WebGL context-loss recovery — IMPLEMENTED 2026-07-08 (this PR).** All four GPU
  layers now `preventDefault` on `webglcontextlost` (so the browser is allowed to
  restore) and rebuild their `SpriteBatch` on `webglcontextrestored` — fresh
  atlas/program/VAO/VBO via a new `createSpriteBatch`, with `ConnectorsCanvas` also
  re-packing its captured arrow-sprite UV — through the shared
  [`webgl/contextLoss.ts`](../../packages/axoview-lib/src/webgl/contextLoss.ts)
  helper. Draw-only: scene/model state is untouched (picking is geometric per §3),
  so no user work is lost across a loss/restore cycle. **Not exercisable in CI**
  (jsdom has no WebGL2; the perf/e2e suites can't force a loss) — verify with a
  manual `WEBGL_lose_context` smoke. (The presumed `webgl/` ts-jest transform blocker
  turned out not to exist — pure `webgl/` files test fine under jsdom, 2026-07-08 — so
  a context-loss unit test is unblocked; it still needs a jsdom GL stub to simulate
  the loss/restore events.) The probe-vs-`createSpriteBatch`
  capability gap (below) still yields a *first-paint* blank on a browser that
  advertises WebGL2 but fails shader/link/atlas-alloc; that path now emits a
  `console.warn` per layer rather than being fully silent.
- **GPU connector/rectangle line-styles — IMPLEMENTED 2026-07-08 (this PR;
  pending visual verification).** `ConnectorsCanvas` now emits the full DOM
  matrix: `style` DASHED/DOTTED (dash-walked via the shared
  [`webgl/lineStyle.ts`](../../packages/axoview-lib/src/webgl/lineStyle.ts)) and
  `lineType` DOUBLE / DOUBLE_WITH_CIRCLE (two offset polylines + a mid-path ellipse
  ring), mirroring `<Connector>`'s strokeDashArray + offsetPaths geometry.
  `RectanglesCanvas` gained dashed/dotted borders the same way. **Width fidelity
  fix (same change):** all bulk stroke widths are now scaled to scene space by the
  projection's linear factor (measured from `getTilePosition`; the DOM's authored
  widths are unprojected tile-px scaled by `getProjectionCss`), so GPU strokes are
  no longer ~1.22× too thick in iso, and are consistent across connectors and
  rectangles. The connector arrow now draws with a `(1,1,1,1)` tint so its baked
  white outline survives (a black tint had blacked it out, hiding it on dark
  lines). Rounded rectangle corners remain approximated (sharp) on the bulk.
- **Premultiplied-alpha mip fringing — ACCEPTED 2026-07-08.** The atlas
  previously stored straight alpha on a black-transparent gutter, so mip minification
  pulled a dark grey ring into small sprites — read as a grey border around dotted-
  connector dots and "two circles + a black-bordered rectangle" on dashed connectors.
  Fixed with a full premultiplied pipeline: `premultipliedAlpha:true` context,
  `UNPACK_PREMULTIPLY_ALPHA_WEBGL`, `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)`, and a shader
  outputting `tex * vec4(v_tint.rgb*v_tint.a, v_tint.a)`. Owner-verified on dashed/
  dotted connectors. The broad-confirmation concern is **resolved by construction**:
  the pipeline is uniform across every sampled surface (one shader, one blend), the
  tint math reduces to the identity for opaque tints (chips, opaque icons) and to
  correct premultiplied compositing for translucent ones (halos, fill opacity), and
  image-export composites via the browser's native `toDataURL`/`drawImage` — which
  assume `premultipliedAlpha` (the WebGL default) and never do raw premult readback.
  Rules folded into [canvas-rendering-guidelines.md §1](../guidelines/canvas-rendering-guidelines.md).
- **Crisp iso line rendering — SHIPPED 2026-07-09; MSAA reverted.** Analytic
  edge-AA is now wired into the shared instanced shader: connector line bodies +
  rectangle borders emit `buildAaLineQuad` fat quads (shapeMode 1) and round
  caps/joins emit analytic discs (shapeMode 2), with the fragment computing an
  `fwidth()`-based ~1px coverage ramp on the true edge — crisp at every iso
  angle/zoom, no texture sampling, no MSAA. Packed into the previously-spare
  `i_misc.y/.z` per-instance floats (no instance-stride growth); the textured-sprite
  path (chips/icons/arrow/ring) is byte-identical. A brief `antialias:true` (MSAA)
  experiment was owner-verified as only a partial band-aid — it feathered iso
  *diagonals* but not the *axis-aligned* segments (already crisp) or the *sampled*
  cases (caps/dots) — and was reverted. Owner-verified. Full design + trade-offs vs
  SDF/MSAA in [canvas-rendering-guidelines.md §12](../guidelines/canvas-rendering-guidelines.md).
- **Connector arrow ground-plane parity — FIXED 2026-07-09.** The GPU bulk arrow
  built an orthonormal SCENE-space basis — a screen-facing *billboard* that did not
  carry the iso shear, so it failed to foreshorten like the DOM `<Connector>` arrow
  (authored in unprojected tile space, then run through the iso CSS matrix) and read
  as "deformed" beside it. Its quad basis is now the iso-projection of the last
  segment's *ground-plane* frame (pointing dir + perpendicular mapped through the
  projection's linear map `L`), so the GPU (unselected) and DOM (selected) arrows
  share one silhouette — a hybrid-boundary parity fix (§2). See
  [canvas-rendering-guidelines.md §13](../guidelines/canvas-rendering-guidelines.md).
- **Backing-store viewport clamp — DONE 2026-07-08.** `computeBackingStore`
  (`utils/renderTarget.ts`) now clamps `bw/bh = W·dpr` against the canvas caps and
  returns an effective dpr that feeds the whole render path (buffer size + `u_view`
  scale + device origin); wired into all four bulk layers. Uses the conservative
  cross-browser `DEFAULT_RENDER_CAPS` shared with export rather than a live
  `MAX_VIEWPORT_DIMS` round-trip. See [canvas-rendering-guidelines.md §9](../guidelines/canvas-rendering-guidelines.md).
- **WebGL unit tests — DONE 2026-07-08.** No ts-jest transform blocker existed for
  pure `webgl/` files (they run under jsdom); the atlas-UV inset math was extracted
  from the `createSpriteBatch` closure into the pure, exported `atlasUVRect` so it is
  testable without a GL context. `webgl/__tests__/` now covers the `lineStyle` walkers
  (incl. the finding-#4 non-advancement regression), `atlasUVRect`, and
  `buildAaLineQuad`; `renderTarget.test.ts` covers `computeBackingStore`.
- **Adaptive/lazy atlas + `sampler2DArray`** for unbounded distinct-chip scenes
  (current: graceful `atlasFull` degradation).

## Consequences

- Browsers without WebGL2 (a small minority; SwiftShader covers most GPU-less
  machines) get the gate Screen instead of a diagram. Accepted per the hard-
  requirement decision.
- ADR 0019's core claim ("Canvas2D is the default and sole bulk substrate") is
  now false; it is superseded here for the substrate decision. Its still-valid
  rules (the DOM-hybrid rationale, HTML-entity decode, the `data-all-icons-drawn`
  export gate) are retained — `NodesCanvas` still publishes them.
- The perf-harness anti-cheat now reads GPU draw-counts (`dataset.drawCount`), not
  DOM element counts (ADR 0020, amended).
- **GL context budget.** Each mounted `Renderer` opens four WebGL2 contexts (one
  per bulk layer); image-export mounts a *second* hidden `Renderer` (ADR 0025), so
  a session can hold ~8 live contexts against the browser's ~16 cap. The capability
  probe (`isWebGL2Supported`) now releases its own context immediately
  (`WEBGL_lose_context`, 2026-07-08) so it no longer leaks a persistent extra;
  tearing down the export Renderer's contexts on dialog close remains a follow-up.
  Reaching the cap force-loses the oldest context — now recovered by the
  context-loss handling above rather than blanking permanently.

## §8 — Cross-type render order (amendment, 2026-08-02)

**Context.** §2's four-canvas hybrid fixes cross-type paint order to mount order
in `Renderer.tsx` (`RectanglesCanvas → ConnectorsCanvas → NodesCanvas →
LabelsCanvas`, all at CSS `zIndex: 0` in ascending document order).
`resolveRenderOrder` is applied *inside* each canvas, so `layer.order` and
`zIndex` sort only within an entity type and the z-order controls are silently
inert across types (R3/GPU-13). Four separate WebGL2 contexts do not share a
depth buffer, so per-entity depth cannot order across them either — it is a
sub-decision *inside* a merged context, never an alternative to merging.

**Decision.** Merge the four bulk canvases into **one WebGL2 context** and order
it by **sorted draw**: the merged instance array is emitted in
`resolveRenderOrder` order and painted in that order. The depth buffer stays off
(`depth: false`, `gl.disable(DEPTH_TEST)`, as today).

**Ordering is one sort over all bulk entities**, keyed by
`resolveRenderOrder(layerOrder, zIndex, isoDepth)` with a **type rank**
(`rectangle < connector < node < label`) as the tiebreaker at equal keys. Mount
order carries no ordering meaning.

### The §4 measurements

Owner sign-off framed these as a gate on the **mechanism**, not on the merge. All
three ran; none contradicts sorted draw.

**1 — Draw-call run lengths under a global sort.** The decisive fact is
structural, not statistical: `SpriteBatch.render()` issues exactly **one**
`drawArraysInstanced` over the whole instance array — one program, one VAO, one
blend state, one atlas bind. Inside one batch there are no material boundaries
at all, so a global sort cannot fragment a draw call. §2(a)'s batching-regression
risk was reasoned from a multi-program renderer; this is not one.

Run lengths over the merged sort on the ALL-TYPES scene shape:

| N | instances | one atlas | separate atlases (fallback) |
|---|---|---|---|
| 1000 | 2 299 | **1 draw call** | 118 calls, median run 19 |
| 2000 | 4 581 | **1 draw call** | 44 calls, median run 76 |
| 5000 | 11 475 | **1 draw call** | 140 calls, median run 74 |

Even the fallback never approaches §4's "revisit below ~8 instances per run"
threshold.

**2 — Merged chip-atlas budget.** Measured live via `atlasStats()` on the
ALL-TYPES scene (`PERF_ATLAS`, `perf-results/atlas.md`); rows consumed by the
shelf packer, which is what decides whether a chip set fits:

| N | node atlas | label atlas | merged rows |
|---|---|---|---|
| 250 | 630 / 8192 (7.7%) | 226 / 4096 (5.5%) | 856 |
| 500 | 1 190 (14.5%) | 454 (11.1%) | 1 644 |
| 750 | 1 750 (21.4%) | 682 (16.7%) | 2 432 |
| 1000 | 2 310 (28.2%) | 834 (20.4%) | 3 144 |
| 1250 | 2 950 (36.0%) | 1 062 (25.9%) | **4 012** |
| 1500 | 150 (1.8%) | 1 290 (31.5%) | 1 440 |
| 2000 | 150 (1.8%) | 1 746 (42.6%) | 1 896 |
| 5000 | 150 (1.8%) | 4 028 (98.3%) **FULL** | **4 178** |

Two things this says that the brief did not anticipate:

- **Node-chip rows collapse between N=1250 and N=1500.** That is the label LOD
  band switching node name chips off at fit-to-view zoom, leaving the dot, the
  white texel and a handful of icons (5 slots). Floating Labels (ADR 0031) have
  no equivalent LOD, so label rows keep growing. The merged worst case is
  therefore **not** at max N — it is either side of the LOD boundary, and both
  peaks land near 4 000 rows.
- **The 4096 clamp is the binding constraint, and it is already binding today.**
  At the §6 high-DPR/mobile clamp a merged atlas does **not** hold N=5000
  (4 178 > 4 096) and sits at 98% at N=1250 — but the label atlas *on its own*
  already reports `atlasFull` at N=5000 at 4096, on a dpr=1 desktop. The merge
  does not create this ceiling; it removes the slack that hid it.

So the single-atlas assumption behind "1 draw call" holds on the 8192 desktop
clamp at every measured N (peak 51%), and does **not** hold at the 4096 clamp at
large N. That is why measurement 1's fallback column matters: it is the design's
actual degradation path, not a hypothetical.

**3 — One build per scene change.** `data-build-count` delta across a 10-step pan
is **0 on all four layers at every N measured**, and `PERF_ATLAS` asserts it
rather than reporting it. Every existing rebuild trigger is a discrete
scene/geometry event (props identity, store subscription, icon decode,
atlas-overflow retry, context restore); none is per-frame, so the union of the
four is still discrete and a merged single-pass build inherits the same cadence.

### Consequences

- **Batching:** one draw call for the whole bulk at any N and any interleaving
  where the merged content fits one atlas; otherwise one bind per material run,
  measured above. Down from four draw calls (one per canvas) either way.
- **The atlas is a per-material resource, not an assumption.** The merged design
  must not require that everything fits one texture, because at the 4096 clamp it
  does not. Sorted draw is correct under both; only the draw-call count moves.
- **The sort key had to be made uniform across types.** Each canvas only had to
  be internally consistent, so the iso-depth tier is fed inconsistently today:
  `NodesCanvas` passes `-tile.x - tile.y`, `LabelsCanvas` passes `0`, and
  `ConnectorsCanvas`/`RectanglesCanvas` do not sort at all — they walk model
  order, filtering hidden layers. Sorting those together with today's inputs
  would put every rectangle and label above every node at positive depth, a
  visible re-ordering of existing documents. The merged key gives every type one
  iso-depth convention, and the type-rank tiebreaker is what keeps a document
  with no explicit layering or z-order looking exactly as it does now.
- **Anti-cheat channel renamed.** `data-draw-count` becomes a TOTAL over all bulk
  entities and can no longer be compared against N. **`data-nodes-drawn == N`** is
  the honesty assertion from here on (ADR 0020, addendum 2026-08-02). Both are
  published on the un-merged `NodesCanvas` today, and the perf-harness assertion
  was repointed in the same change, so the harness never reads a dead attribute
  across the merge. §5's `data-build-count` assertion extends to the merged canvas
  unchanged.
- **Selection becomes order-preserving.** Selecting no longer lifts an element out
  of the document's paint order; only selection chrome (handles, outline) floats.
  This is a visible change from today's hybrid overlay, which lifts the whole
  element, so affected specs assert the sort and the full Playwright budget
  applies.
- `label-entity.spec.ts` asserts the sort, not DOM order; ADR 0031 §2 ("a floating
  Label paints above nodes") is restated as a sort-key property rather than a
  mount-order one.
- Image export composites one canvas (§4 unchanged, mechanism simplified), and
  `waitForIconsDrawn` follows the merged canvas's `data-all-icons-drawn`.
- **Connector labels stay DOM and stay out of the sort** (§2: there is no GPU
  connector-label layer). This leaves a documented inconsistency: a floating Label
  participates in cross-type depth, a connector label chip does not — chips float
  above everything, which matches the readable-labels intent. **Follow-up
  trigger:** pull connector chips into the sort if a user files a stacking defect
  involving them; it is cheaper once the merge exists (shared atlas, one material
  run). Grounded estimate at sign-off: in scope would have added ~30–40% to this
  change (path-keyed instances, raster-cache invalidation over OVL-02's fresh
  unification, a new hit-proxy layer) for a defect nobody has filed.
- **`atlasStats()`** is added to `SpriteBatch` as shared-substrate instrumentation
  (`webgl/atlasDiagnostics.ts`): read from the shelf cursor, published alongside
  `data-build-count`, gated on the debug surface, no per-frame cost.

**Superseded.** §2's enumeration of four bulk canvases; the GL-13 mount-order
hazard is closed by construction.

## §7 — Relationship to ADR 0019

ADR 0019 remains the record of *why* the bulk moved off DOM/SVG and of the
DOM-hybrid + export invariants. This ADR supersedes only its **substrate**
decision: Canvas2D is no longer a rung at all (the fallback was removed), and
WebGL2 is the sole bulk substrate. ADR 0019 is marked "Superseded by: ADR 0038
(bulk substrate only)".
