# ADR 0019 — Canvas2D Node Render Layer (default substrate)

**Status:** Superseded in part (bulk substrate) — 2026-07-08
**Date:** 2026-06-15
**Supersedes:** none
**Superseded by:** ADR 0038 (WebGL2 instanced substrate), *bulk substrate
decision only*. The Canvas2D bulk renderer this ADR chose was removed on
2026-07-08 when WebGL2 became the sole substrate — there is no longer a Canvas2D
fallback. The still-valid rules below (the DOM-hybrid rationale, the HTML-entity
decode, and the `data-all-icons-drawn` export gate) are retained and unchanged.

## Context

The DOM/SVG + React per-node renderer does not scale. Production telemetry
(the T0 "Measured baseline", recorded in the since-retired perf charter — see git history; the durable protocol is [ADR 0020](0020-engine-perf-harness-and-measurement-protocol.md)): ~25 nodes usable,
already below 30fps by ~40, unusable by ~75–90, multi-second main-thread freezes at
200+; heap ≈ 0.5 MB/node and fps ∝ 1/N — the signature of per-node React reconcile +
emotion styling + DOM/SVG paint (~14 DOM elements × N). Viewport culling
(`visibleItems`) is already in place but does nothing in the stress case (bulk
paste / import / diagram-open, where all N nodes are on-screen).

The T1 micro-optimizations that kept the DOM substrate — Iter 3 "wholesale
de-emotion" and Iter 6 granular store subscriptions
([decision-log](../../perf-results/decision-log.md)) — produced modest, slope-
unchanged gains. The CPU profile (cpuprofile-spawn-1000)
attributes the spawn freeze to intrinsically per-node DOM cost (~403 ms MUI `sx`
pipeline, ~364 ms label scroll-reset at N=1000). There is no way to keep ~14×N DOM
elements and make 1,000 nodes fast — the substrate must change. This is the **T2**
rung of the tier ladder ([ADR 0020](0020-engine-perf-harness-and-measurement-protocol.md)).

The render rewrite is a charter **RED gate** (architectural overhaul); it was signed
off, spiked, and measured before this decision:

- **Iter 7** rejected a connector-first Canvas2D layer with evidence (0 ms spawn prize).
- **Iter 8** PoC: a draw-only `<canvas>` node layer (icon-bitmap cache + static label
  text) beat the DOM node renderer on spawn by **−41% @1000 settle (283→167 ms),
  −58% longest, −50% @2000 (sub-linear)**, held drag flat at 60 fps, and — decisively —
  **beat the DOM labels-off floor (167 < 175 ms)**, proving the win is canvas-vs-DOM,
  not dropped fidelity.
- **Iter 9** production hybrid: the full correctness gate passes **13/13 flag-ON** with
  the spawn win preserved exactly.

Evidence detail: t2-design.md FINDINGs (Iter 8, 9).

## Decision

**Canvas2D becomes the default and sole *bulk* node-render substrate.**
`NodesCanvas` (retired 2026-08-02 — the four bulk canvases merged into [`SceneCanvas`](../../packages/axoview-lib/src/components/SceneLayers/SceneCanvas.tsx) under ADR 0038 §8)
— an imperative, store-subscribed `<canvas>` (icon-bitmap cache, iso projection
matrix, tile cull, painter-order sort, the readable-labels counter-scale ported to
`ctx` transforms) — replaces the per-node React DOM subtree for all N nodes.

**The per-node DOM `<Node>` is retained, but only for the *actively-manipulated*
nodes** — the single selected node (`itemControls`) ∪ the drag set (`mode.items`
while `DRAG_ITEMS`) ∪ the label-drag target (`labelDragId`, Track P/T6 — added after
this ADR; `Renderer.tsx` `hybridIds` unions all three today). The
[`Renderer`](../../packages/axoview-lib/src/components/Renderer/Renderer.tsx) lifts
those into a sparse DOM overlay (`hybridNodes`) and `NodesCanvas` skips them
(`skipNodes`). This is load-bearing, not legacy: the DOM `<Node>` is what provides the
F2 inline-rename `contentEditable`, the `--axoview-label-scale` counter-scale wrapper,
and the `--ff-drag` compositor drag preview (`DragItems` mutates `[data-drag-id]`).
The set is empty during bulk spawn, so the substrate win is unaffected.

**The feature flag is removed.** The `axoview-canvas-nodes` localStorage flag,
`readCanvasNodesFlag`, the `PERF_CANVAS` / `AXOVIEW_CANVAS_NODES` plumbing, and the
bulk DOM mapping component
[`Nodes`](../../packages/axoview-lib/src/components/SceneLayers/Nodes/Nodes.tsx) are
deleted — canvas is unconditional. There is no all-DOM fallback for the bulk path;
`Node.tsx` survives solely as the hybrid overlay. Correctness is held by the e2e
gate running against canvas unconditionally, and the spawn anti-cheat switches from a
DOM-shell count (reads 0/N in canvas mode) to a **canvas draw count**.

**2026-06-21 (UX re-test addendum):** Two correctness signals were added to the canvas
layer from the journey-test runs (ADR 0028). **(A1)** Text drawn to the canvas — node
names/labels — is **HTML-decoded** (`&nbsp;`, `&amp;`, `&lt;`,
numeric entities → chars) before `ctx.fillText`, via one shared
[`htmlToPlainText`](../../packages/axoview-lib/src/utils/htmlToPlainText.ts) util (a
decode-only variant keeps the verbatim name, e.g. `List<T>`). *(The on-canvas rich-description caption this originally also covered was retired by [ADR 0032](0032-node-name-caption-label-model.md) / commit `894cb3b`; the canvas now draws name/label text only. The decode rule itself is unchanged.)* The DOM/popover path
already decoded via the browser; the canvas path did not, so Quill's literal `&nbsp;`
reached the bitmap. **(A2)** `NodesCanvas.draw()` publishes a `data-all-icons-drawn`
dataset flag (alongside the draw count) once a frame paints with every icon bitmap
decoded — the image-export capture waits on it (see
[ADR 0025](0025-image-export-robustness-and-presets.md)).

## Consequences

**Positive:**
- ~50× static-scale unlock (T2 SSB target 2,000; measured sub-linear to 2,000), the
  single largest usability gain for any non-trivial diagram.
- One `<canvas>` + O(visible) draw calls replaces ~14×N reconciled DOM elements; pan/
  zoom and bulk writes are rAF-coalesced imperative redraws, no React reconcile.
- The hybrid gives the editor's interactive cases (rename, readable-labels, drag
  preview) the DOM path *for free* on the one node that needs it.

**Negative / risks:**
- Imperative canvas draw has no React-devtools visibility for nodes; correctness is
  carried entirely by the e2e gate + the draw-count anti-cheat, not the component tree.
- The hybrid couples the render path to selection/drag state (two `uiState` selectors
  on `Renderer`). Sparse and spawn-neutral, but a new coupling to maintain.
- No bulk all-DOM fallback once the flag is removed — a field regression in canvas
  rendering has no runtime escape hatch (mitigated by the gate; rollback is a revert).
- **A moving simulation (T3) invalidates the hybrid's "static-except-selection"
  assumption** (when every entity moves each tick, "DOM for the moving one" collapses).
  T3 redraws O(visible) every tick on canvas; sustaining 2,000+ moving entities is
  expected to need a **WebGL instanced** substrate (T4) — see
  [ADR 0020](0020-engine-perf-harness-and-measurement-protocol.md) tier ladder. This
  ADR is the static-render rung, not the simulation rung.

## Implementation notes (non-binding)

- `NodesCanvas` owns its transform (`setTransform(zoom·dpr, …)` mirroring the
  `<SceneLayer>` CSS) so 1px text/strokes stay crisp; non-iso icons in ISO mode get the
  fixed iso matrix. Redraws are rAF-coalesced on `uiStateStore` (scroll/zoom/size/
  readableLabels), `modelStore` (items/icons), and the `nodes`/`skipNodes` props.
- Before the flag is removed, two fidelity gaps must reach parity (each a same-session
  A/B + the correctness gate per [ADR 0020](0020-engine-perf-harness-and-measurement-protocol.md)):
  (1) description text + notes/link badges drawn on the canvas; (2) the connector
  polyline draw folded into the same canvas — *after* the harness routes connectors on
  spawn (Iter-7 caveat), or the connector draw is measured as free.
- The draw-count anti-cheat: `NodesCanvas` exposes the count of nodes drawn per frame
  (e.g. a `data-` attribute / debug global) so the harness can assert `drawn == visible`
  the way it asserted `[data-drag-id]` count == N for the DOM path.
- `Node.tsx` is retained and must not be deleted; mark the retired bulk `Nodes.tsx`
  removal in the same commit that flips the default.

## Acceptance criteria

- The e2e correctness gate (`drag-collision`, `undo-redo-*`, `multi-select-drag`,
  `z-order`, `rectangle-overlap-zorder`, `css-preview-mid-drag`, `rename`,
  `readable-labels`) passes **13/13 with canvas as the only node path** (no flag).
- The perf harness confirms the spawn win holds (settle @1000 ≈ 167 ms, ≫ noise better
  than the retired DOM path's 283 ms), drag stays at 60 fps, KR3 idle guardrail PASS.
- Visual parity confirmed including descriptions, notes/link badges, and connectors.
- A canvas draw-count anti-cheat replaces the DOM-shell spawn count in the harness.

## Implementation addendum — 2026-06-15 (Iter 10–11, the flip shipped)

The decision shipped on `perf/engine` (Iters 10–11). Two refinements vs the prose
above, recorded here rather than rewriting the decision:

- **`Nodes.tsx` is retained, not deleted.** The decision said "the bulk DOM mapping
  component `Nodes` is deleted." In practice the hybrid **overlay** still needs a
  node-list→`<Node>` mapper with the correct render-order sort, and `Nodes.tsx`
  already does exactly that. It is therefore **narrowed to the sparse overlay** (fed
  only the selected ∪ drag-set, 0–few nodes, never N) rather than removed —
  reimplementing its sort inline in `Renderer` would add risk for no benefit. The
  intent of the decision (no bulk DOM node render; no dual-path flag) is fully met:
  `NodesCanvas` is the unconditional bulk renderer and the flag is gone.
- **Anti-cheat shipped** as `data-draw-count` on the `<canvas>`; the harness asserts
  it `== N` at fit-to-view (verified `rendered=1000/1000`).

**Deferred, documented gaps (closed in follow-ups, not silently dropped):**
- **Notes/link badges** are not yet drawn on the canvas. They still render when a node
  is selected/dragged (the DOM overlay). Pixel-accurate placement on the iso-skewed
  icon needs a screenshot-driven pass — tracked in `known_issues.md`.
- **Connectors** remain on the existing DOM/SVG layer. Iter-7 proved they carry no
  spawn prize and are rAF-batched on real paste; folding them onto the canvas is
  unmeasured scope (would first need the harness to route connectors on spawn) and is
  **not** a prerequisite for the node-substrate win.

**Verification at flip (Iter 11):** e2e correctness gate 13/13 with canvas as the only
path (no flag); lib unit suite 1110 passed; perf spawn settle @1000 = 166.7 ms (−41%
vs the DOM baseline 283 at comparable calibration), `rendered=1000/1000`.
