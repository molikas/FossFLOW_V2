# ADR 0051 — Tiled Paths on Connectors (roads, rivers, walls)

**Status:** Proposed
**Date:** 2026-08-10
**Supersedes:** none
**Superseded by:** none
**Related:** [ADR 0050](0050-terrain-paint-layer.md) (the cell renderer this reuses — **read first**), [ADR 0048](0048-imported-image-asset-pipeline.md) (`kind: 'tile'`), [ADR 0004](0004-connector-name-and-details-panel.md) (connector model + details panel), [ADR 0030](0030-docked-style-controls-strip.md) (where connector style is edited), [ADR 0038](0038-webgl-instanced-render-substrate.md)

## Context

A village needs roads; a battle map needs rivers and walls. All three are the
same thing: **a tiled ribbon following a route between two points, that stays
attached when the endpoints move.**

Connectors already are exactly that minus the art. They carry `anchors[]` with a
routing algorithm, they re-route when their endpoints move, they belong to
layers, they are selectable, and they already render into the instanced batch via
[connectorEmitter.ts](../../packages/axoview-lib/src/webgl/scene/connectorEmitter.ts).
The only thing a connector cannot do is look like anything other than a line —
`style` is `SOLID | DOTTED | DASHED` and `lineType` is
`SINGLE | DOUBLE | DOUBLE_WITH_CIRCLE` (`connectorStyleOptions` /
`connectorLineTypeOptions` in [schemas/connector.ts](../../packages/axoview-lib/src/schemas/connector.ts)).

The naive approach — stamp a sprite repeatedly along the centreline, rotated to
the segment direction — **does not work in this engine.** Isometric icon art is
pre-sheared (that is what `isIsometric` means, and why [nodeEmitter.ts](../../packages/axoview-lib/src/webgl/scene/nodeEmitter.ts)
has a separate branch for it); rotating already-projected art produces art that
is projected twice. The usual alternative, a role-keyed tileset with
straight/corner/T pieces, needs six-plus authored pieces per path type in
isometric — an authoring burden that defeats the "paste in what you generated"
premise of this whole arc.

## Decision

**A tiled path is a terrain stroke whose cells are derived from a connector's
route.** It is not a new rendering mode; it reuses [ADR 0050](0050-terrain-paint-layer.md)
end to end.

### 1. The connector gains a tile, not a renderer

```ts
// connectorSchema additions, all optional → zero-migration
pathTileId?: string;      // a kind:'tile' asset — makes this a tiled path
pathWidth?: number;       // route-cell dilation, in cells (default 1)
hideLine?: boolean;       // suppress the stroked line (default true when tiled)
```

When `pathTileId` is set, the connector's route is rasterised to the set of grid
cells it passes through, dilated by `pathWidth`, and those cells are emitted by
the **terrain emitter** ([ADR 0050](0050-terrain-paint-layer.md) §2) — same
atlas, same instancing, same culling, same draw slot.

**This is the load-bearing choice.** Because cells are axis-aligned to the grid
and the tile art is placed exactly as it would be if hand-painted, there is **no
rotation and therefore no double projection**. One tile makes a working road.
Corners are corners because neighbouring cells are filled, not because a corner
piece was authored.

### 2. Derived, not baked — the path follows its endpoints

The cells are **recomputed from the route** whenever the route changes, exactly
as the line is today. Move a house and its road follows. The cells are a
*projection of connector state*, not a copy of it, and are therefore **not
persisted** — only `pathTileId` / `pathWidth` / the existing `anchors[]` are.

The rejected alternative was a one-shot bake into ADR 0050's hand-painted cell
map. It is simpler and it is wrong: the road would detach the first time
anything moved, which is the entire reason to piggyback on connectors instead of
just painting a road by hand.

### 3. Draw order and conflict with painted terrain

Derived path cells emit **after** hand-painted terrain and **before** every
entity — a road lies on top of grass and under the houses. Within the derived
set, connector z-order decides.

A cell covered by both painted terrain and a path shows the path. Nothing is
destroyed: hide or untile the connector and the painted ground is still there,
because the two live in different places (§2).

### 4. What a tiled connector suppresses

`hideLine` defaults true when `pathTileId` is set — otherwise a blue stroke runs
down the middle of the road. The arrowhead and the midpoint name label default
off for the same reason, but remain **available**: a labelled, arrowed road is a
legitimate thing to want, and a tiled path is still a connector with notes, a
name, and a details panel ([ADR 0004](0004-connector-name-and-details-panel.md)).

Selection, hit-testing, and transform stay on the **connector**, unchanged. The
tiles are its appearance, so — unlike ADR 0050's painted terrain — this
introduces **no new exception to [ADR 0006](0006-canvas-selection-contract.md)**.
Clicking a road selects the connector that draws it.

### 5. Where it is edited

The tile picker joins the connector's controls on the docked style strip
([ADR 0030](0030-docked-style-controls-strip.md)), beside `style` / `lineType` /
`width` — the strip is where connector appearance is already edited, and a path
tile is appearance.

> TODO: `style` (SOLID/DOTTED/DASHED) and `lineType` (SINGLE/DOUBLE/…) become
> meaningless while `hideLine` is true. Do they disable, hide, or stay live for
> the moment the user turns the line back on? Disabling is the honest default —
> a live control that does nothing is the "redundant affordance" trap — but
> confirm against the strip's existing disable conventions before building.

> TODO: `pathWidth` dilation on an isometric grid is not isotropic — one cell of
> dilation is 1.415 × 0.819 of a projected tile. Decide whether width is
> measured in cells (simple, slightly oval-looking) or compensated to look
> circular. Cells is the recommended v1.

## Consequences

**Positive:**

- Roads, rivers, and walls from **one** authored tile instead of a six-piece
  role-keyed tileset — which is what makes it usable with generated art.
- No rotation of pre-sheared isometric art, so no double-projection artefacts.
- Reuses ADR 0050's emitter, culling, chunking, and atlas packing outright; the
  net new code is route→cells rasterisation plus three schema fields.
- Paths stay attached to what they connect, which hand-painting can never do.
- No new selection-contract exception (§4).

**Negative / risks:**

- **Cell-quantised paths look blocky** compared to a smooth stroked curve. That
  is the aesthetic of the medium (it is how tile-based worlds look), but it is a
  real change in character for anyone who expected a smooth line.
- **Recompute cost on drag.** Re-rasterising a long route every pointer-move is
  the obvious perf trap; the route already recomputes, but rasterisation to
  cells is new work on the same path. Needs the same chunk-cache discipline as
  ADR 0050 §2 and must not disturb `data-build-count`.
- **Two ways to make ground.** Hand-painted terrain and derived paths can
  produce visually identical results by different means, which is a
  discoverability question the UI has to answer honestly (paint for regions,
  connect for routes).
- **Depends on ADR 0050 shipping first.** Alone, this ADR has no renderer.

## Implementation notes (non-binding)

- Route→cells is a supercover line walk (Amanatides–Woo style) per segment —
  it must include every cell the segment touches, not Bresenham's thin line, or
  diagonal roads come out perforated.
- Dilation is a cheap Chebyshev/Manhattan disc per centre cell; dedupe into a
  `Set` before emitting.
- Memoise the derived cell set per connector, keyed on the routed polyline plus
  `pathWidth`, so a pan or an unrelated edit does not re-rasterise.
- The derived set is a natural fit for the same chunk buckets ADR 0050 uses, so
  both feed one culling pass rather than two.

## Acceptance criteria

- **Unit test:** a diagonal route rasterises to a connected cell set with no
  gaps (supercover, not Bresenham).
- **Unit test:** `pathWidth: 3` dilates to the expected cell count around a
  straight run.
- **Unit test:** moving an endpoint node recomputes the cell set; the old cells
  are gone and the new ones present, with nothing persisted to `view.terrain`.
- **Unit test:** derived path cells emit after painted terrain and before nodes.
- **Unit test:** setting `pathTileId` defaults `hideLine` true; clearing it
  restores the stroked line unchanged.
- **Unit test:** clicking a tiled path selects the connector (no new selection
  exception).
- **Perf test:** dragging a node attached to a 200-cell path holds frame budget
  and does not inflate `data-build-count` beyond the existing scene-change rule.
- **Manual verification:** draw a road between two houses with one imported tile;
  it reads as a road, corners look like corners, and moving a house drags the
  road with it.
