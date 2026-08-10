# ADR 0050 — Terrain Paint Layer (freeform tiled backgrounds)

**Status:** Proposed (open decisions closed 2026-08-10 — serialisation §1, culling §2, multi-cell §4, against Tiled/Godot/Unity practice)
**Date:** 2026-08-10
**Supersedes:** none
**Superseded by:** none
**Related:** [ADR 0048](0048-imported-image-asset-pipeline.md) (`kind: 'tile'` assets), [ADR 0049](0049-asset-store-and-reference-model.md) (where tilesets live), [ADR 0038](0038-webgl-instanced-render-substrate.md) (the instanced batch this draws into), [ADR 0006](0006-canvas-selection-contract.md) (selection — **partially contradicted, see §5**), [ADR 0022](0022-canvas-pointer-interaction-model.md) (pointer modes), [ADR 0023](0023-off-grid-positioning-and-collision.md) (off-grid — terrain is exempt), [ADR 0027](0027-canvas-context-menu.md), [ADR 0013](0013-preview-mode-layer-switcher.md) (layers)

## Context

Users want a **background**, not another node. The immediate evidence is a
meadow tile imported as an icon and dropped on the grid: it renders as a node,
so covering ground means placing dozens of nodes that are individually
selectable, individually draggable, and carry labels, notes, and connector
anchors that nobody wants on a patch of grass.

The nearest existing entity is `Rectangle` — it sits under the nodes and has a
fill. But a rectangle is **only ever a rectangle**. A coastline, a river bank,
a forest edge, or a village path is a connected freeform region, and
approximating one with overlapping rectangles is both miserable to author and
expensive to render.

This is the concept gap that separates "diagram tool" from "small-world sketch
tool." The rendering substrate already does the hard part: [ADR 0038](0038-webgl-instanced-render-substrate.md)
packs every icon into one atlas and draws the scene as instanced quads, so
**painting ten thousand ground cells is the same draw call as drawing ten** —
one instance each, one atlas, one `drawArraysInstanced`. The engine can afford
this; the model has no way to express it.

## Decision

Introduce **terrain**: a per-view, per-layer sparse map of grid cells to tile
assets, painted with brush tools, drawn beneath every other entity, and **not
part of the selection model**.

### 1. Model shape — a sparse cell map, not a list of entities

```ts
interface TerrainChunk {
  x: number; y: number;                        // chunk origin, in cells
  data: number[];                              // CHUNK²  palette indices; 0 = empty
}
interface TerrainLayer {
  id: string;
  layerId?: string;                            // the layer it belongs to
  tiles: string[];                             // palette: index -> asset ref
  chunks: TerrainChunk[];
}
// view.terrain?: TerrainLayer[]
```

A cell field, not an entity array, because a painted cell has **no identity
worth preserving**: no name, no notes, no connectors, no z-order among its
peers, and no independent existence — it is a property of a grid coordinate.
Modelling each cell as an entity would put ten thousand ids through the
selection store, the layers panel, undo, and `validateModel` for no gain.

Terrain is **strictly on-grid** — [ADR 0023](0023-off-grid-positioning-and-collision.md)'s
off-grid offsets do not apply, and that is what keeps the coordinate space integral.

**Palette + chunk records, not a `Record<"x,y", ref>` map.** The naive map was
costed at ~150 KB per 100×100 region, which was **~4× optimistic**: once cell
values are `axo-asset:sha256-…` references
([ADR 0049](0049-asset-store-and-reference-model.md) §1) the same region is
~600 KB. A per-layer **tile palette** with small-integer cells removes the
repetition, and Tiled-style chunk records (`{x, y, data}`, `0` = empty) are the
natural container because **the runtime is chunked anyway** for culling (§2) —
one structure serves both. General-purpose compression stays a separate,
explicit, later step.

**Reserve high bits in the cell value** for future flip / rotate / variant flags
(universal practice in tile formats). Free now; a migration if deferred.

### 2. Rendering — a new emitter into the existing batch

A `terrainEmitter.ts` joins the existing emitters
([nodeEmitter](../../packages/axoview-lib/src/webgl/scene/nodeEmitter.ts),
[rectangleEmitter](../../packages/axoview-lib/src/webgl/scene/rectangleEmitter.ts),
[connectorEmitter](../../packages/axoview-lib/src/webgl/scene/connectorEmitter.ts),
[labelEmitter](../../packages/axoview-lib/src/webgl/scene/labelEmitter.ts)) and
emits **first**, so terrain is unconditionally the bottom of the draw order.

Tiles pack into the same atlas via the same `putIcon` path, so a tileset costs
one atlas slot per distinct tile regardless of how many cells use it.

**Viewport culling is mandatory here, unlike the other emitters.** A scene with
20 nodes rebuilds cheaply; a scene with 40 000 painted cells does not. The
emitter walks only the cells intersecting the visible tile range, which turns
build cost from *painted area* into *screen area*.

**Culling is done by chunking — there is no harness exemption.** Terrain is
divided into fixed **16×16 cell chunks** (the Tiled / Godot / Minecraft norm),
each with a cached instance buffer rebuilt **only** when that chunk is edited or
becomes visible for the first time. A pan over already-warm chunks rebuilds
nothing.

This preserves [ADR 0020](0020-engine-perf-harness-and-measurement-protocol.md)'s
`data-build-count` invariant rather than weakening it; the assertion is
restated as **"flat during pan/zoom over warm chunks."** Granting an exemption
was the rejected alternative — that check has already caught real regressions,
and a feature that pressures it is exactly when it earns its keep.

### 3. Painting — a tool mode, not a drag-and-drop

Terrain is edited through an armed tool, mirroring the existing annotation
tools' shape ([ADR 0014](0014-ephemeral-annotation-overlay.md)) and obeying
[ADR 0022](0022-canvas-pointer-interaction-model.md):

- **Brush** — paint cells under the pointer, radius 1…N.
- **Rectangle fill** — drag a range, fill it.
- **Flood fill** — fill the connected region of like-valued cells (bounded by a
  cell budget so an unbounded canvas cannot hang the tab).
- **Eraser** — delete cells.
- **Pick** — adopt the tile under the pointer as the active brush.

While a terrain tool is armed the canvas chrome locks exactly as it does for
the draw tools today (the precedent is commit `899aa7e8`, "lock canvas chrome
while a draw tool is armed").

**One stroke is one undo entry.** A pointer-down → move → up sequence coalesces
into a single history entry holding the before/after of the touched cells only.
Per-cell history entries would make undo useless and blow the history budget.

### 4. Tiles come from the asset pipeline

A terrain brush is loaded with an asset whose `kind === 'tile'`
([ADR 0048](0048-imported-image-asset-pipeline.md) §7). The `kind` split is
what keeps this honest: a node icon is not offered as a brush, and a tile is
not offered in the node dock.

Tiles must be **seamless**, which is a property of the art, not something we can
enforce. [ADR 0048](0048-imported-image-asset-pipeline.md)'s corner-seeded matte
is actively wrong for a tile that legitimately fills its own frame — hence that
ADR's open question about per-`kind` matte defaults. The tile preview in the
import dialog **shows the tile repeated 3×3** so a seam is visible before import,
not after painting.

**Multi-cell art is sliced at import, not modelled.** The terrain model stays
**strictly 1×1**. An asset whose `tileFootprint` exceeds one cell is cut into
unit tiles by the importer ([ADR 0048](0048-imported-image-asset-pipeline.md)),
and the brush becomes a **multi-tile stamp** that lays those units down together
(Tiled's stamp-brush model).

This is what keeps painting, undo, culling, and serialisation completely
untouched by multi-cell art — the complexity lands once, in the importer, rather
than in every consumer of the cell field. Autotiling and per-cell
rotation/variant UI are deferred, with the value bits already reserved (§1).

### 5. Terrain is not selectable — and this qualifies ADR 0006

[ADR 0006](0006-canvas-selection-contract.md) governs a contract in which canvas
entities are selectable, hit-testable, and reachable from the layers panel and
the item-controls deck. **Terrain cells are none of these.** They are not
click-selected, do not join a lasso, have no transform handles, and do not
appear in the item deck.

This is a deliberate, named exception rather than an oversight:

- A painted cell has no identity to select (§1).
- The mirroring obligations — two-way panel↔canvas sync
  ([ux-principles §4.1](../guidelines/ux-principles.md)) and item-type parity (§5) —
  are obligations about **entities**. Terrain is a *field*, the same category as
  the grid itself, and parity with entities would be a category error.

What terrain **does** participate in:

- **Layers** — a terrain layer carries `layerId`, so visibility and lock behave
  as they do for everything else. A locked layer's terrain is not paintable.
- **Undo/redo** — per §3.
- **Image export** — it draws, therefore it exports.
- **The context menu** ([ADR 0027](0027-canvas-context-menu.md)) — right-clicking
  terrain with no entity under the pointer offers terrain actions (pick tile,
  erase region) rather than the empty-canvas menu.

## Consequences

**Positive:**

- The engine becomes medium-agnostic — an architecture diagram, a process map,
  and a village sketch are the same scene graph with different art. This is the
  point of the whole arc.
- Ten thousand ground cells cost one draw call, because [ADR 0038](0038-webgl-instanced-render-substrate.md)
  already did the work.
- Nodes stop being abused as scenery, which keeps selection, the layers panel,
  and connector anchoring meaningful.

**Negative / risks:**

- **A new entity category touching many surfaces**: schema + `validateModel`,
  the layers panel, undo, the context menu, image export, project ZIP, paste,
  and the tool/mode state machine.
- **Chunk cache invalidation is the perf-critical path** (§2). The invariant is
  preserved by construction, but a stale or over-eager invalidation reintroduces
  per-frame rebuilds — this is the single most likely place for this feature to
  cause a regression, and the `data-build-count` assertion is what catches it.
- **Model size** grows with painted area, not entity count — a new scaling axis
  the format has never had. The palette + chunk encoding (§1) bounds it, but
  does not remove it.
- **Two indirections between a cell and its art** (cell value → palette index →
  asset ref). Cheap at runtime; one more thing to keep coherent when a palette
  entry is removed.
- **A selection-contract exception exists now.** Documented here, but a future
  reader who finds terrain unselectable will reasonably suspect a bug;
  [ADR 0006](0006-canvas-selection-contract.md) needs a pointer to this section.
- Seamlessness is on the user. Bad tiles look bad, and we can only preview it.

## Implementation notes (non-binding)

- Chunk size for §2's cached blocks wants to be a power of two (16×16 or 32×32
  cells) so chunk lookup is a shift.
- The flood fill is the same scanline queue as [ADR 0048](0048-imported-image-asset-pipeline.md)'s
  matte, over cells instead of pixels — extract it once.
- Paint strokes should write into a scratch overlay and commit on pointer-up, so
  the model store takes one write per stroke rather than one per cell.
- `Record<string, string>` beats `Map` here only because it is JSON-native; the
  runtime may keep a `Map` and serialise on save.

## Acceptance criteria

- **Unit test:** painting a 3-cell stroke produces exactly one history entry;
  undo restores all three cells and redo re-paints them.
- **Unit test:** flood fill stops at the cell budget and reports rather than
  hanging.
- **Unit test:** the emitter walks only cells within the visible tile range — a
  40 000-cell terrain with 200 cells on screen emits ~200 instances.
- **Unit test:** terrain emits before nodes, rectangles, connectors, and labels
  in the merged draw order.
- **Unit test:** a hidden or locked layer's terrain neither draws nor accepts paint.
- **Unit test:** terrain cells never enter `uiState.selectedIds`, including under
  a lasso that covers them.
- **Perf test:** `data-build-count` stays **flat during a pan/zoom over warm
  chunks**; a chunk becoming visible for the first time, or being edited,
  increments it exactly once.
- **Unit test:** a 16×16 chunk round-trips through the palette encoding
  unchanged, and `0` decodes to empty rather than to palette entry 0.
- **Unit test:** a `tileFootprint` 2×2 asset imports as four unit tiles and
  paints as one stamp; the model contains no multi-cell entry.
- **Unit test:** reserved cell-value bits survive a save/load round trip
  untouched (forward-compat for flip/rotate/variant).
- **Manual verification:** paint a freeform meadow with a coastline edge; it
  reads as ground, not as a grid of nodes, and exports identically to what is on
  screen.
