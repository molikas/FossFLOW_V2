# Wave-5 design brief — GPU-13: cross-type z-depth

**Status:** SIGNED OFF 2026-08-02 — see "Owner sign-off" at the end of this file.
Implementation may begin, measurement-first per §4. The ADR 0038 §8 amendment is
written (dated) after the measurement selects the ordering mechanism, before code.

**Ruling being served (DECISIONS.md, 2026-07-30):** *build real cross-type
depth* — the owner chose the full mechanism over the cheaper alternative of
scoping the z-order controls to say they only work within a type.

---

## 1. What is actually broken

`resolveRenderOrder(layerOrder, zIndex, isoDepth)` is a correct global ordering
function, and after wave 4 all four bulk layers that sort at all use it. But it
is applied **inside each canvas**, and the four canvases are four separate WebGL
contexts stacked by mount order in `Renderer.tsx`:

```
RectanglesCanvas  →  ConnectorsCanvas  →  NodesCanvas  →  LabelsCanvas
   (bottom)                                                 (top)
```

All four compute to the same CSS `zIndex` and sit in ascending document order,
so cross-type paint order is **fixed by that mount order and nothing else**. A
rectangle can never paint above a node no matter what its `zIndex` or its
layer's `order` says. Bring-to-front on a connector does nothing relative to
nodes. The controls are not wrong about their own layer; they are silently inert
across layers.

Two things make this more than cosmetic:

- **The layer feature promises otherwise.** Layers are presented as a stacking
  mechanism ("move this group in front of that one"), and wave 4 made
  `layer.order` genuinely dominate `zIndex` *within* a canvas. A user who puts a
  rectangle on the top layer and a node on the bottom one now gets the opposite
  of what every other tier of the same function delivers.
- **`resolveRenderOrder`'s LAYER_BUCKET is already global.** The value space is
  designed for a single sort. Four independent applications of a global
  comparator is the actual defect: the function is fine, the *composition* is
  missing.

Adjacent, already-fixed, and worth not re-opening: RND-13/RND-15 (the DOM hybrid
overlay paints above every canvas while an element is selected) were fixed in
wave 3 by making the overlays agree with the canvas beneath them. **Any option
below must keep that agreement** — see §5.

## 2. The two options the ruling names

### Option A — one canvas

Collapse the four bulk canvases into a single WebGL2 context that draws every
entity type, sorted once by `resolveRenderOrder`.

**How it would work.** One `SpriteBatch` per *material* (chip-atlas quads, line
geometry, arrow sprites) but one **draw order**: `buildInstances` emits a single
instance array sorted by the resolved key, and the draw loop walks it in order,
switching program/VAO at material boundaries.

**What it costs the four bulk canvases:**

| Canvas | Cost |
| --- | --- |
| `NodesCanvas` | Loses its dedicated atlas sizing (§6 of ADR 0038 caps the *node* atlas at 8192²/4096²); a shared atlas must budget for label chips too, or keep separate textures and bind per material run. |
| `LabelsCanvas` | Same atlas question. Also loses the "mounts immediately after NodesCanvas" invariant that ADR 0031 §2 relies on — the invariant survives only as a sort-key property, so `label-entity.spec.ts` must be re-expressed against the sort rather than against DOM order. |
| `ConnectorsCanvas` | Biggest change: it is the only layer with non-quad geometry (dash-walked polylines, DOUBLE offset paths, mid-path ellipse rings, captured arrow-sprite UVs) and the only one whose context-loss restore re-packs a sprite. Interleaving it into a global sort means its draws can no longer be one contiguous batch. |
| `RectanglesCanvas` | Cheapest — quads with a solid/stroke program; slots into a shared batch with little friction. |

**Risks.** (a) **Batching regression.** Today each canvas issues roughly one draw
call per material for its whole set. A global sort interleaves materials, so a
diagram that alternates types by depth degenerates toward one draw call per
*run*. Needs a run-length measurement on real diagrams before committing. (b)
**ADR 0038 §5** ("no per-frame CPU geometry work") must hold: the sort belongs in
`buildInstances`, keyed on the same scene/geometry-change trigger, never per
frame. The `data-build-count` harness assertion is the existing guard and must be
extended to the merged canvas. (c) `preserveDrawingBuffer: true` (§4,
non-negotiable, export depends on it) becomes a property of one context instead
of four — that is a simplification, and it also means image export stops
compositing four canvases, which is a *win* worth stating in the amendment.

### Option B — per-entity depth

Keep the four canvases and give every fragment a real depth value: enable the
depth buffer, write `gl_FragDepth` (or a vertex-stage `z`) from
`resolveRenderOrder` normalised into `[0,1]`, and let the GPU resolve order
across contexts.

**This does not work across contexts, and that is the decisive fact.** Four
separate WebGL2 contexts do not share a depth buffer; they are four independent
framebuffers composited by the browser as DOM elements. Depth testing inside
`ConnectorsCanvas` cannot make a connector occlude a node drawn in a *different*
canvas. Option B is therefore only meaningful *after* the contexts are merged —
at which point it is a sub-decision of Option A (depth-buffer ordering vs
sorted-draw ordering within the single context), not an alternative to it.

**As a sub-decision it has real merit** and should be revisited once merged:
depth testing removes the need for a strict global sort (so batching by material
is preserved), at the cost of losing correct alpha blending for overlapping
translucent geometry — which Axoview does have (selection tints, connector
opacity). The usual answer is opaque-with-depth then translucent-sorted, which
is a two-pass renderer.

## 3. Recommendation

**Option A (single canvas), with the depth buffer explicitly deferred as a
follow-up optimisation inside it.**

Reasons, in order of weight:

1. **Option B cannot deliver the ruling on its own.** Cross-context depth is not
   a thing. Presenting the two as parallel choices is the framing the campaign
   note inherited; the honest statement is "merge the contexts, then choose an
   ordering mechanism inside".
2. **The sort key already exists and is already global.** `resolveRenderOrder`
   with its LAYER_BUCKET/ZINDEX_BUCKET space was written for exactly one sort
   over everything. Option A is the composition it was designed for.
3. **It removes a whole class of ordering bug rather than one instance.** The
   mount-order coupling is what produced GL-13 (a re-order silently puts labels
   under nodes), RND-13/15 (the hybrid overlay's stacking), and GPU-13. After
   the merge, paint order has exactly one source of truth.
4. **Export gets simpler**, and export is the one place ADR 0038 marks
   non-negotiable.

The cost to be honest about: **ConnectorsCanvas is the hard part**, and the
batching risk in §2(a) is real and unmeasured. Recommend the design pass open
with that measurement, because a bad answer there changes the recommendation.

## 4. What I would want measured before writing code

- Draw-call run lengths under a global sort on the three largest fixture
  diagrams — if the median run collapses below ~8 instances, revisit.
- Atlas budget for a merged node+label chip atlas at the §6 clamps.
- Whether `buildInstances` can produce the merged instance array within the
  existing scene-change trigger without a second pass (ADR 0038 §5).

## 5. Invariants any option must preserve

- **ADR 0038 §3 — picking stays geometric.** Nothing here may make hit-testing
  depend on draw order or GPU readback. `hitDetection.ts` already sorts by
  `resolveRenderOrder`; after this change the renderer and the picker would agree
  by construction, which is worth asserting in a gate.
- **ADR 0038 §4 — `preserveDrawingBuffer: true`.**
- **ADR 0038 §5 — no per-frame CPU geometry work** (`data-build-count` flat
  across a pan).
- **ADR 0031 §2 — a floating Label paints above nodes.** Currently guaranteed by
  mount order; must become a sort-key guarantee, with `label-entity.spec.ts`
  re-expressed accordingly.
- **Wave 3's RND-13/15 fix — the DOM overlays agree with the canvas beneath.**
  The hybrid overlay is above the canvas by construction; its *internal* order
  must keep matching the merged sort.

## 6. ADR 0038 amendment — skeleton

> **§8 — Cross-type render order (amendment, DATE)**
>
> **Context.** §2's four-canvas hybrid fixes cross-type paint order to mount
> order in `Renderer.tsx`. `resolveRenderOrder` is applied per canvas, so
> `layer.order` and `zIndex` sort only within an entity type; the z-order
> controls are inert across types (R3/GPU-13).
>
> **Decision.** _(one paragraph: the chosen mechanism)_
>
> **Ordering is one sort over all bulk entities**, keyed by
> `resolveRenderOrder(layerOrder, zIndex, isoDepth)`; mount order carries no
> ordering meaning. _(If depth-buffer ordering is chosen inside the single
> context, state the two-pass opaque/translucent rule here.)_
>
> **Consequences.**
> - _(batching: measured run-length result and the accepted trade)_
> - _(atlas: merged budget vs the §6 clamps)_
> - `label-entity.spec.ts` asserts the sort, not DOM order; ADR 0031 §2 is
>   restated as a sort-key property.
> - Image export composites one canvas (§4 unchanged, mechanism simplified).
> - §5's `data-build-count` assertion extends to the merged canvas.
>
> **Superseded.** §2's enumeration of four bulk canvases; the GL-13 mount-order
> hazard is closed by construction.

## 7. Open questions for the owner

1. **Scope of "cross-type".** Does this include the DOM hybrid overlay — should a
   *selected* rectangle be able to paint above an unselected node, or does
   selection keep lifting an element unconditionally? Wave 3 made the overlays
   agree with the canvas; this decides whether that agreement is order-preserving
   or selection-preserving.
2. **Connector labels.** ADR 0038 §2 says there is no GPU connector-label layer —
   they are all DOM. They are therefore outside the merged sort. Acceptable, or
   in scope?
3. **Is the batching measurement a gate on the decision** (my recommendation), or
   should the design proceed on Option A and treat batching as an
   implementation-time problem?

---

## Owner sign-off (2026-08-02)

**Option A approved, measurement-first** — with one reframe of §2(a)/§7 Q3: the
measurement is a gate on the **mechanism, not the merge**. A bad run-length
result selects depth-buffer two-pass ordering (opaque-with-depth, then
translucent sorted) *inside* the merged context; it never un-merges the
canvases. Run the §4 measurements first; their outcome fills the amendment's
Decision paragraph.

**§7 Q1 — selection is order-preserving.** Selecting never changes the
document's paint order; only selection chrome (handles, outline) floats. This is
the Figma/Illustrator/draw.io norm and the reading consistent with wave 3's
overlay-agreement fix. Note it changes today's visible behaviour (the hybrid
overlay currently lifts the whole element) — specs assert the sort, and the full
Playwright budget applies.

**§7 Q2 — connector labels are out of scope.** Grounded cost/impact was
reviewed: in-scope ≈ +30–40% project scope (path-keyed instances, raster-cache
invalidation over OVL-02's fresh unification, a new hit-proxy layer) for a
defect nobody has filed; out-of-scope keeps chips floating above everything,
which matches the readable-labels intent. The amendment must document the
resulting inconsistency (floating Labels participate in cross-type depth,
connector chips do not) **with a named follow-up trigger**: pull chips into the
sort if a user-filed stacking defect involves them — cheaper after the merge
exists (shared atlas + material runs).
