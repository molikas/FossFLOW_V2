# Axoview Canvas Rendering Guidelines

**Last updated:** 2026-07-09 (compositor overlay for stacked-canvas repaint — §14, PR #64; analytic edge-AA + arrow ground-plane parity — §12/§13, PR #63)
**Status:** Living reference. Update when the render substrate evolves.
**Audience:** Anyone (or any agent) touching the GPU bulk layers, the sprite atlas, line-style geometry, or image export.

This is the fidelity contract for Axoview's GPU render substrate — the sibling of [ux-principles.md](ux-principles.md). Where ux-principles governs the *design language* of the UI, this governs the *pixels inside the canvas region*: how the WebGL2 bulk layers stay visually identical to true vector output, and the pitfalls that cost us a real bug each.

WebGL2 is the **sole** bulk substrate ([ADR 0038](../adr/0038-webgl-instanced-render-substrate.md)) — there is no Canvas2D/DOM fallback. Everything the user sees at scale (nodes, labels, connectors, rectangles) is instanced textured quads drawn one `drawArraysInstanced` per layer, with the tile→screen transform computed in the vertex shader. That efficiency is why fidelity is subtle: a chip is a *cached texture*, not a per-frame re-raster, so sampling artifacts that a 2D canvas hid now show.

When in doubt, **mirror what already exists** in the reference implementations at the bottom, and remember the meta-rule (§11): **CI cannot see any of this** — every visual change needs a real-browser check.

Each numbered rule below is one hard-won finding: **symptom → root cause → rule.**

---

## 1. The atlas is a premultiplied-alpha pipeline — all four parts or none

**Symptom:** a dark grey ring around dotted-connector dots, and "two circles + a black-bordered rectangle" on dashed connectors. Every small sprite grew a dark fringe on its edges.

**Root cause:** the atlas stored *straight* alpha on a black, fully-transparent surround. Mip minification of a small sprite averages the coloured shape with black-transparent texels → a dark grey fringe on every edge.

**Rule:** rasterised sprites uploaded to a GPU atlas MUST use a **premultiplied** pipeline, end to end. All four pieces are load-bearing; any one missing re-introduces the fringe:

1. `premultipliedAlpha: true` on the context,
2. `gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)` before every upload,
3. `gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)` (premultiplied blend),
4. a fragment shader that outputs premultiplied colour: `tex * vec4(tint.rgb * tint.a, tint.a)`.

```glsl
// ✅ Correct — premultiplied output; reduces to identity for opaque tints,
//    composites correctly for translucent halos / fillOpacity.
outColor = tex * vec4(v_tint.rgb * v_tint.a, v_tint.a);

// ❌ Wrong — straight-alpha modulate on a black gutter → dark mip fringe.
outColor = tex * v_tint;
```

The tint math is exact: for an opaque tint (`a = 1`) it is the identity (chips, opaque icons unchanged); for a translucent tint it produces correct premultiplied compositing (halos, rectangle fill opacity). Image export is safe because `premultipliedAlpha: true` is the WebGL default that `toDataURL`/`dom-to-image-more` assume, and the export path composites via the browser's native `drawImage`/`toDataURL` — never raw `getImageData`/`readPixels` pixel math that would mis-read premultiplied data.

Reference: [`glSpriteBatch.ts`](../../packages/axoview-lib/src/webgl/glSpriteBatch.ts) (`FRAG_SRC`, context attrs, `blendFunc`).

---

## 2. Never draw at the texture edge — inset content and UVs by a texel

**Symptom:** a chip's 1px border was present on the top/left but missing on the right/bottom corner.

**Root cause:** two edge effects compounded — a border stroked exactly at the texture boundary was clipped by the canvas bounds, AND the atlas's half-texel UV inset trimmed it asymmetrically.

**Rule (two halves):**

- **Rasterisation:** inset drawn content ≥1px from the raster edge. Never stroke a border at the texture boundary.
- **Sampling:** use a half-texel UV inset so `LINEAR` sampling at a sub-rect edge samples strictly *inside* the slot, never reaching the neighbouring gutter (the classic atlas seam). Origin nudged +½ texel, span shrunk by a full texel — symmetric, so no edge is favoured.

```ts
// ✅ Correct — half-texel inset, symmetric (atlasUVRect)
u0 = (x + 0.5) / atlasSize;   uS = (w - 1) / atlasSize;

// ❌ Wrong — samples the gutter at the far edge
u0 = x / atlasSize;           uS = w / atlasSize;
```

The inset math is extracted as the pure, unit-tested [`atlasUVRect`](../../packages/axoview-lib/src/webgl/glSpriteBatch.ts); the ≥1px content inset lives in [`rasterizeNodeChip`](../../packages/axoview-lib/src/webgl/itemRaster.ts) and `drawLabelChip`.

---

## 3. A DOM overlay sized to a canvas-measured chip must be `content-box`

**Symptom:** the inline label editor collapsed to one character per line.

**Root cause:** the library's `GlobalStyles` sets `div { box-sizing: border-box }`. An inline editor sized `minWidth = chipInnerWidth` under border-box has that width eaten by its own padding + border → content area ≈ one character.

**Rule:** any DOM overlay whose size mirrors a **canvas-measured** dimension must pin `boxSizing: 'content-box'`. Canvas `measureText` is content-space; the global border-box reset silently shrinks anything that trusts it.

```tsx
// ✅ Correct — the measured width IS the content width
sx={{ boxSizing: 'content-box', minWidth: chipInnerWidth }}

// ❌ Wrong — global border-box eats the width into padding+border
sx={{ minWidth: chipInnerWidth }}
```

Reference: `LabelInlineEditor` in [`LabelHitLayer.tsx`](../../packages/axoview-lib/src/components/SceneLayers/Labels/LabelHitLayer.tsx).

---

## 4. Walk parametric geometry by integer index, never a float cursor

**Symptom:** `RangeError: Array buffer allocation failed` when applying a dashed/dotted border — a hard crash.

**Root cause:** the dash/dot walker advanced a float cursor by a variable step. Near a segment boundary the step rounded to ~0, and once the cursor was a few hundred px in, `cursor += tiny` was absorbed by float precision → the loop never advanced → the GPU staging `Float32Array` grew until it OOM'd.

**Rule:** walk parametric geometry by **integer index** (`k * spacing`), so it always advances; cap spans per segment as a backstop against a pathologically small period.

```ts
// ✅ Correct — integer index always advances (walkDots / walkDashes)
for (let k = kStart, n = 0; k * spacing <= segEnd; k++, n++) {
  if (n >= MAX_SPANS_PER_SEGMENT) break;
  emit(k * spacing - s);
}

// ❌ Wrong — float accumulation can stall → infinite loop → OOM
for (let cur = start; cur <= segEnd; cur += step) emit(cur);
```

Reference + unit tests: [`lineStyle.ts`](../../packages/axoview-lib/src/webgl/lineStyle.ts), [`lineStyle.test.ts`](../../packages/axoview-lib/src/webgl/__tests__/lineStyle.test.ts) (the "pathologically tiny spacing/period" cases pin this).

---

## 5. Authored widths are unprojected — scale every GPU stroke by the projection factor

**Symptom:** GPU strokes were ~1.22× too thick in isometric view (and inconsistent between connectors and rectangles).

**Root cause:** authored stroke widths are **unprojected tile-px** — the DOM scales them via `getProjectionCss`. The GPU drew them raw in **projected** scene space, skipping the ~0.816 iso factor.

**Rule:** scale every GPU stroke width by the projection's linear factor, measured once from a unit tile step:

```ts
// widthScale == the DOM's getProjectionCss scale — correct for iso AND 2D
const o0 = getTilePos({ tile: { x: 0, y: 0 } });
const o1 = getTilePos({ tile: { x: 1, y: 0 } });
const widthScale = Math.hypot(o1.x - o0.x, o1.y - o0.y) / UNPROJECTED_TILE_SIZE;
```

Measuring from `getTilePosition` (not a hard-coded iso constant) keeps connectors and rectangles consistent and correct if the projection ever changes. Reference: [`connectorEmitter`](../../packages/axoview-lib/src/webgl/scene/connectorEmitter.ts) + [`rectangleEmitter`](../../packages/axoview-lib/src/webgl/scene/rectangleEmitter.ts).

---

## 6. Sheared sprites soften — anisotropic filtering is a mitigation, not a cure

**Symptom:** every chip/line/dot looked fuzzy in isometric but crisp in 2D.

**Root cause:** in iso, each quad is a **sheared** parallelogram; isotropic mip/linear filtering blurs along the shear axis.

**Rule:** enable anisotropic filtering (`EXT_texture_filter_anisotropic`) on any atlas sampled through a non-axis-aligned transform — it sharpens sheared sampling materially. But **know it is a mitigation, not a cure**: the ceiling is fundamental to rasterised sprites. The crisp fix is geometry/SDF, not filtering (see §12).

Reference: `aniso` setup in [`glSpriteBatch.ts`](../../packages/axoview-lib/src/webgl/glSpriteBatch.ts).

---

## 7. Tint white for baked light outlines; arbitrary tint only for flat sprites

**Symptom:** connector arrowheads were invisible on dark lines.

**Root cause:** the arrow sprite bakes a white outline. A `(0,0,0,1)` tint multiplied that outline to black, erasing it on dark connectors.

**Rule:** a sprite that bakes a light outline (arrows, rings) must be tinted white `(1,1,1,1)` so its own colours survive. Only a **flat-colour** sprite (the `white` texel, the `dot`) may take an arbitrary tint.

```ts
// ✅ Correct — baked-outline sprite keeps its own colours
addSprite(..., arrowUV, 1, 1, 1, 1, 0);

// ❌ Wrong — a black tint zeroes the baked white outline
addSprite(..., arrowUV, 0, 0, 0, 1, 0);
```

Reference: arrow emission in [`connectorEmitter`](../../packages/axoview-lib/src/webgl/scene/connectorEmitter.ts).

---

## 8. Projection is a geometry-rebuild dependency — DOM hit-proxy and GPU paint share it

**Symptom:** a floating label became unselectable after switching 2D ↔ iso — the visible chip and its clickable hit-area separated.

**Root cause:** the geometry-rebuild effect omitted `strategy.projectionName`, so the GPU chip kept the *old* projection's position while the DOM hit-proxy moved to the new one.

**Rule:** any GPU layer whose geometry is tile→scene **projected** must list `strategy.projectionName` in its rebuild deps (mirror `NodesCanvas`). A DOM hit-proxy and its GPU paint must share **one** projection, or they drift apart — a hybrid-boundary invariant (ADR 0038 §2).

Reference: rebuild-effect deps in [`SceneCanvas`](../../packages/axoview-lib/src/components/SceneLayers/SceneCanvas.tsx) — one effect for the whole bulk since the ADR 0038 §8 merge.

---

## 9. Clamp the backing store, and feed the effective dpr through the whole render path

**Symptom (latent):** a very-high-DPI large viewport pushes `W · dpr` past the browser's max canvas dimension / area cap, and the browser hands back a blank or failed GL surface.

**Root cause:** the backing store `bw/bh = W·dpr × H·dpr` was uncapped.

**Rule:** clamp the backing store against the canvas caps and treat `dpr` as the export path treats its scale multiplier — reduce it to the largest value that fits, degrading *resolution* rather than blanking. Crucially, the **effective dpr feeds the entire render path** — the backing-store size AND the `zoom·dpr` view scale AND the device origin `(W/2 + scroll)·dpr` — or the scene and its buffer desync (the CSS canvas stays `W×H`, so a smaller buffer just upscales).

```ts
// ✅ Correct — one effective dpr, used everywhere downstream
const { width: bw, height: bh, dpr } = computeBackingStore(W, H, window.devicePixelRatio || 1);
const originXDev = (W / 2 + scroll.x) * dpr;
b.render(bw, bh, zoom * dpr, originXDev, originYDev, counterScale);

// ❌ Wrong — clamp bw/bh but leave zoom·dpr / origin on the raw dpr → desync
```

There must be exactly **one** backing-store computation per layer, and it must be the clamped one — don't leave an unclamped `round(W*dpr)` lying around for a future reader to wire up. Reference: [`computeBackingStore`](../../packages/axoview-lib/src/utils/renderTarget.ts), wired into all four bulk layers.

---

## 10. Rebuild geometry only on a scene change — never per frame

**Symptom (would-be regression):** frame time climbs with N during pan/zoom.

**Root cause:** doing per-node CPU work (`buildInstances`) inside the per-frame draw.

**Rule:** `buildInstances` runs only on a scene/geometry change or an LOD-band crossing. Pan/zoom is **one uniform write + one draw call** — no per-frame CPU loop over N. The harness pins this machine-checkably: `data-build-count` must stay flat across a pan (ADR 0038 §5). Any change that rebuilds geometry per frame is a regression, even if it looks correct.

Reference: `drawGLBatch` vs `buildInstances` split in every `*Canvas.tsx`; anti-cheat in the perf harness (ADR 0020, amended).

---

## 11. CI is pixel-blind — every visual change needs a real-browser check

**Symptom:** none of findings §1–§8 could be caught by the test suite.

**Root cause:** jsdom has no WebGL2, and headless Chrome falls back to SwiftShader (software) — pixels never render in CI. The perf anti-cheat can only gate **structure** (`dataset.drawCount` == committed count), not appearance.

**Rule:**

- Green CI is **not** visual confirmation. Every visual GPU change is handed to the owner for a real-browser screenshot check.
- Gate what *is* machine-checkable: pure geometry (walkers, UV math, backing-store clamp — all unit-tested), the no-per-frame-CPU invariant, and draw-count structure.
- When profiling, log `[perf] WebGL renderer:` and force a real GPU — SwiftShader numbers are meaningless.

```ts
// ✅ Correct — extract the pure math out of the GL closure so CI can test it
export const atlasUVRect = (x, y, w, h, atlasSize) => ({ /* … */ });

// ❌ Wrong — bury bug-prone math in createSpriteBatch, untestable without a GPU
```

---

## 12. Crisp iso lines/borders/caps — analytic edge-AA, not MSAA

**Symptom:** connector line bodies, rectangle borders and round caps were the least crisp thing in iso — solid-quad long edges stair-stepped and sampled dots softened, while a *selected* connector stayed crisp (it is the DOM `<Connector>` SVG). Enabling MSAA improved iso *diagonals* but left *axis-aligned* ("north-south") segments looking hard-and-inconsistent, and did nothing for the sampled caps.

**Root cause:** the context was `antialias:false` and a line body was a solid `white`-texel parallelogram whose long edges are real geometry edges — they alias once the iso shear turns every segment diagonal. MSAA multisamples only *geometry-edge coverage*: it feathers the diagonal quad edges but is a no-op on axis-aligned edges (already crisp — a screen-vertical iso segment has Δx=0, so it never stair-stepped) and on the *interior* of a sampled sprite (caps/dots are a texture fetch, not an edge). So MSAA is an uneven partial fix at a real fill-rate cost — the wrong tool (both confirmed by owner screenshots, 2026-07-09).

**Rule:** feather strokes/discs **analytically in the fragment shader** (the deck.gl / Mapbox technique), never with MSAA. Carry a distance-from-centre in scene units as a varying and threshold it against the true half-width with an `fwidth()`-based coverage ramp — a controlled ~1px feather at **any** zoom/shear, no texture, no multisampling. This is `antialias:false` + one data-driven shader branch, reusing the single instanced batch and its spare per-instance floats (no stride growth).

The **shipped** wiring:

- Geometry: [`buildAaLineQuad`](../../packages/axoview-lib/src/webgl/lineStyle.ts) fattens `segment()`'s parallelogram by `AA_FEATHER` scene units on each perpendicular side (so the ramp isn't clipped by the quad) and reports the true `halfWidth`; a disc grows its quad by the same feather.
- Per-instance carrier: `addSprite`'s `shapeMode` (0 textured / 1 line / 2 disc) and `halfWidth` pack into `i_misc.y/.z` — previously zero, so no stride growth and the textured path is byte-identical.
- Shader ([`glSpriteBatch`](../../packages/axoview-lib/src/webgl/glSpriteBatch.ts) VERT/FRAG):

```glsl
// vertex — scene-space distance-field coordinate from the quad centre.
//   i_misc = (counterScaleFlag, shapeMode, halfWidth, _)
//   disc needs both axes; line needs only the perpendicular (.y), so .x is zeroed.
float along = (i_misc.y > 1.5) ? (q.x - 0.5) * length(i_basis.xy) : 0.0;
float perp  =                    (q.y - 0.5) * length(i_basis.zw);
v_p = vec2(along, perp) * s;   v_hw = i_misc.z;   v_mode = i_misc.y;

// fragment — line = perpendicular distance, disc = radial; ~1px ramp via fwidth.
float d   = (v_mode > 1.5) ? length(v_p) : abs(v_p.y);
float aa  = fwidth(d);                                     // scene units per screen px
float cov = clamp((v_hw - d) / max(aa, 1e-6) + 0.5, 0.0, 1.0);
vec4 shape = vec4(v_tint.rgb * v_tint.a, v_tint.a) * cov;   // premultiplied (§1)
outColor = (v_mode > 0.5) ? shape : sprite;                // DATA select — texture()/fwidth() stay unconditional
```

Two load-bearing details: keep `texture()` and `fwidth()` **unconditional** (data-select the result, don't branch around them) so derivatives stay valid at 2×2 quads straddling mixed-mode instances; and keep `cov = 0.5` at `d = halfWidth` so the fat quad never changes the drawn thickness (width fidelity, §5). `AA_FEATHER` is a build-time scene constant — **not** zoom-scaled (that would rebuild geometry per frame, §10); a sub-pixel stroke at extreme zoom-out simply fades rather than clipping visibly.

**SDF textures** stay the escalation path only if we later need arbitrary vector *glyphs/shapes* — straight strokes and circular caps have closed-form distances, so they need no texture at all. **MSAA is rejected** as the line-AA mechanism; the context stays `antialias:false`.

---

## 13. Connector arrows live on the ground plane, not facing the screen

**Symptom:** the GPU (unselected) connector arrowhead looked "deformed" in iso — subtly wrong beside a selected connector's arrow.

**Root cause:** the GPU arrow built an **orthonormal scene-space basis** from the projected segment direction (`u = size·(ux,uy)`, `v = size·(-uy,ux)`) — a rigid *screen-facing billboard*. But the DOM `<Connector>` arrow is authored in **unprojected tile space** and run through the iso CSS `matrix()`, so it is *sheared onto the ground plane* and foreshortens with the rest of the scene. A rigid billboard among ground-plane shapes reads as deformed. (The report "as if iso projection applied" was polarity-inverted: the GPU arrow was the one *missing* the shear.)

**Rule:** a GPU sprite that must sit *in* the isometric scene (not overlay it) has to carry the projection's shear — build its quad basis by mapping the shape's **unprojected ground-plane frame** through the projection's linear map `L`, not from an orthonormal scene-space direction. Probe `L` once from unit tile steps (`L·(1,0)`, `L·(0,1)` off `getTilePosition`); in 2D `L` is a scaled identity, so the shape stays un-sheared there automatically. Upright billboards (chips/labels) are the deliberate exception — those *should* face the screen. The test: does the thing conceptually lie on the grid (connector arrow → yes, shear it) or float above it (label → no, billboard it)?

```ts
// ✅ Correct — ground-plane frame through L (arrow foreshortens like the DOM arrow)
const ux = (La * gx + Lc * gy) * size, uy = (Lb * gx + Ld * gy) * size; // L·g
const vx = (La * hx + Lc * hy) * size, vy = (Lb * hx + Ld * hy) * size; // L·h (h ⟂ g in TILE space)

// ❌ Wrong — orthonormal scene-space basis = a screen-facing billboard, no iso shear
const vx = -uy * size, vy = ux * size;
```

Reference: arrow emission in [`connectorEmitter`](../../packages/axoview-lib/src/webgl/scene/connectorEmitter.ts) (the `La/Lb/Lc/Ld` basis).

---

## 14. Stacked WebGL canvases need a full-area overlay so Chrome recomposites them

**Symptom:** on some GPUs/drivers a strip of the diagram rendered blank until a pan, and toggling an overlapping DOM element (the "session not saved" banner, the annotation panel, a dock) briefly repainted it, then a strip *exactly that element's size* went blank again. Image export was always correct, and opening the annotation panel made the strip vanish. Reproduced on one machine, not another.

**Root cause:** the four scene-layer WebGL canvases are painted into a shared compositor layer. When a sibling DOM overlay *above* a canvas toggled, Chrome invalidated only the overlay's rectangle and left the canvas **un-repainted** there — a stale blank strip the overlay's size — until a pan/resize forced a full recomposite. The drawing buffers were correct the whole time (hence export worked, and a forced repaint revealed the content), so this is a **paint/composite bug, not a render or cull bug** — which is why it was GPU/driver-dependent. A per-canvas `transform: translateZ(0)` layer promotion did **not** fix it.

**Rule:** keep a permanent, empty, pointer-transparent **full-area SVG overlay** mounted above the canvases ([`CanvasCompositorOverlay`](../../packages/axoview-lib/src/components/CanvasCompositorOverlay/CanvasCompositorOverlay.tsx), next to `AnnotationLayer`). Its presence forces Chrome to composite the whole canvas region as a unit, so a sibling's partial invalidation can no longer leave a stale strip. (This is why the bug vanished whenever `AnnotationLayer` — itself a full-area SVG at the same z-index — happened to be open.) The overlay must stay inert: `pointerEvents: none`, `aria-hidden`, draws nothing. A §11 case — CI can't see it; owner-confirmed in a real browser (Chrome, 1080p, dpr 1).

Reference: [`CanvasCompositorOverlay.tsx`](../../packages/axoview-lib/src/components/CanvasCompositorOverlay/CanvasCompositorOverlay.tsx); mounted in [`UiOverlay`](../../packages/axoview-lib/src/components/UiOverlay/UiOverlay.tsx).

---

## 15. Layer visibility/lock lives only in `useLayerContext` — every bulk canvas AND handle overlay must re-apply the filter

**Symptom:** hiding a layer left its rectangle painted on the canvas; and a connector on a hidden **+ locked** layer, selected from the Layers list, still showed draggable waypoint/endpoint handles floating over the hidden diagram.

**Root cause:** layer `visible`/`locked` are model state that only [`useLayerContext`](../../packages/axoview-lib/src/hooks/useLayerContext.ts) resolves into `visibleIds` / `lockedIds`. The filtered DOM layer (`<Rectangles>`) applied it — but the **WebGL bulk** (`RectanglesCanvas`) and the **DOM handle overlay** (`ConnectorAnchorOverlay`) are *separate* components that draw/expose the same entities and each iterated the raw scene list, so the filter wasn't inherited. `RectanglesCanvas` was the lone bulk canvas not consulting the context (`NodesCanvas` / `ConnectorsCanvas` / `LabelsCanvas` all did).

**Rule:** any component that **paints** an entity (every `*Canvas` bulk layer) or **exposes an interactive affordance** for it (selection handles, anchor overlays, transform/resize/rotate controls) must re-apply the layer filter itself — it is never inherited from the sibling that happens to filter. Paint layers skip on `visibleIds.size > 0 && !visibleIds.has(id)` (the `size === 0` escape hatch = no layers configured); affordance layers use the codebase-wide interactable invariant `!lockedIds.has(id) && (visibleIds.size === 0 || visibleIds.has(id))` (same predicate as `useInteractionManager` / `usePanHandlers`). A **locked** layer's element may still be *selected* (from the Layers list, to inspect / re-layer / unlock) — so render the selection ring but withhold every transform handle (draw.io / PowerPoint / Canva parity), never a live-editable selection. Add `visibleIds` (and `lockedIds` for affordances) to the geometry-rebuild deps so a visibility/lock toggle rebuilds.

Reference: the `buildDrawOrder` filter + rebuild deps in [`SceneCanvas`](../../packages/axoview-lib/src/components/SceneLayers/SceneCanvas.tsx); the overlay gate in [`ConnectorAnchorOverlay`](../../packages/axoview-lib/src/components/ConnectorAnchorOverlay/ConnectorAnchorOverlay.tsx); the handle gate in [`TransformControlsManager`](../../packages/axoview-lib/src/components/TransformControlsManager/TransformControlsManager.tsx) (`showHandles={!lockedIds.has(id)}`); invariant source in [`useInteractionManager`](../../packages/axoview-lib/src/interaction/useInteractionManager.ts).

---

## Deferred ADR 0038 items

Live status of the follow-ups scoped in [ADR 0038 §Deferred](../adr/0038-webgl-instanced-render-substrate.md), reconciled here as they close:

| Item | Status |
|---|---|
| Premultiplied-alpha mip fringing (§1) | **Accepted.** Owner-verified on dashed/dotted; the pipeline is uniform across all sampled surfaces (one shader, one blend), the tint math reduces to identity for opaque tints, and export composites via native `toDataURL` (no raw premult readback). No colour/export regression by construction. |
| Backing-store viewport clamp (§9) | **Done.** `computeBackingStore` wired into all four bulk layers; the effective dpr feeds the whole render path. |
| WebGL unit tests (line walkers + atlas UV) | **Done.** No ts-jest blocker existed for pure `webgl/` files; the atlas-UV math was extracted (`atlasUVRect`) out of the GL closure so it is testable. See `webgl/__tests__`. |
| Crisp iso lines/borders/caps — analytic edge-AA (§12) | **Done 2026-07-09.** Wired into the shared shader (shapeMode 1 line / 2 disc) via the spare `i_misc` floats; MSAA experiment reverted (`antialias:false`). Owner-verified. |
| Connector arrow ground-plane parity (§13) | **Done 2026-07-09.** Arrow basis rebuilt from the iso-projected ground-plane frame so GPU (unselected) and DOM (selected) arrows share one silhouette. Owner-verified. |
| Export Renderer context teardown on dialog close | **Deferred.** Still ~8 live GL contexts vs a ~16 cap; tearing down the hidden export Renderer's contexts on close is unchanged. Out of scope here (touches the export lifecycle, needs its own verification). |
| Rounded-rectangle corners on the bulk | **Deferred (out of scope).** Still approximated (sharp). Now that §12 analytic-AA has landed, an analytic rounded-rect border SDF is the tractable path — still out of scope here. |
| Adaptive/lazy atlas + `sampler2DArray` | **Deferred (out of scope).** Today's graceful `atlasFull` degradation stands; only unbounded distinct-chip scenes need this. |
| Context-loss recovery | **Done (prior PR).** `webgl/contextLoss.ts`; manual `WEBGL_lose_context` smoke still recommended. |

---

## Reference implementations

When building or debugging a GPU layer, **read these first**:

| Concern | Reference file |
|---|---|
| Atlas, blend, aniso, context attrs, premultiplied shader | [`glSpriteBatch.ts`](../../packages/axoview-lib/src/webgl/glSpriteBatch.ts) |
| Line-style walkers + analytic-AA prototype | [`lineStyle.ts`](../../packages/axoview-lib/src/webgl/lineStyle.ts) |
| Chip rasterisation (content inset, supersample) | [`itemRaster.ts`](../../packages/axoview-lib/src/webgl/itemRaster.ts) |
| Context-loss recovery | [`contextLoss.ts`](../../packages/axoview-lib/src/webgl/contextLoss.ts) |
| Backing-store / export scale clamp | [`renderTarget.ts`](../../packages/axoview-lib/src/utils/renderTarget.ts) |
| The canonical bulk layer (build vs draw split, projection deps, the merged sort) | [`SceneCanvas.tsx`](../../packages/axoview-lib/src/components/SceneLayers/SceneCanvas.tsx) |
| Projection-scaled widths + line-styles | [`connectorEmitter.ts`](../../packages/axoview-lib/src/webgl/scene/connectorEmitter.ts) |
| Unit-testable pure math (the CI-visible surface) | [`webgl/__tests__`](../../packages/axoview-lib/src/webgl/__tests__) · [`renderTarget.test.ts`](../../packages/axoview-lib/src/utils/__tests__/renderTarget.test.ts) |

---

## When this document is wrong

It's a snapshot of what the GPU fold taught us, not a law. If a rule here contradicts something the owner just verified in a real browser — the browser wins (§11). Update this doc afterwards as part of wrap-up so the finding isn't relearned. If you deliberately break a rule, leave a short note in [ADR 0038](../adr/0038-webgl-instanced-render-substrate.md) explaining why.
