# ADR 0023 — Off-Grid Positioning & Per-Item Collision

**Status:** Accepted (shipped 2026-06-21 with the UX-CANVAS wave — off-grid placement + per-item collision; PLAN.md `[x]`. Status corrected 2026-07-15: it had sat `Proposed` since shipping.)
**Date:** 2026-06-18
**Supersedes:** none
**Superseded by:** none

## Context

Two requests need positions that are not locked to the integer tile grid:

- **#12** — Enable/disable snap-to-grid.
- **#20** — Per-element "unsnap" via context menu, then move the item freely between tiles "to save space."

Today **every** position is an integer tile coordinate: items/textboxes carry `tile: Coords`, rectangles `from`/`to: Coords`, and the mouse→tile conversion rounds (`getMouse`). Snap, the derived `TileIndex` collision/occupancy ([ADR 0021](0021-paste-algorithmic-perf-and-spatial-index.md)), connector routing (pathfinding on tiles), and the spatial index all assume integers. "Free movement" is therefore a data-model question, not a UI toggle.

The user's resolved design (2026-06-18): **per-item pixel offset** (not fractional tile coords across the whole engine), and an unsnapped item should **skip collision entirely** — collision becomes a per-object opt-out, the primary use being to cherry-pick a few items and nudge them between tiles without being pushed.

## Decision

### 1. Additive data model — the integer tile stays the base

Add optional, backward-compatible fields (absent = today's behavior, byte-for-byte):

```ts
// view item / rectangle / textbox
offset?: { x: number; y: number };  // unprojected px relative to the tile anchor
snap?: boolean;                      // default true; false = drag commits the px offset, not a rounded tile
collides?: boolean;                  // default true; false = excluded from TileIndex (neither obstacle nor mover)
```

- An **unsnapped** item (`snap: false`) implies `collides: false` unless the user re-enables collision (the "nudge between tiles to save space" case).
- Stored offset is **unprojected px** so it is projection-independent (iso ↔ 2D). The renderer applies it as a final translate after projection.
- Zod `modelItem` schema extends with these optionals; lean-save omits defaults.

> ⚠ **"unprojected px" above is wrong** — corrected by the 2026-07-23 addendum §A.
> The residual is **SceneLayer px (post-projection)**. The accepted text is left
> as shipped; read the addendum before writing any code against `offset`.

### 2. One snap chokepoint

All drag/paste/placement position resolution goes through a single helper, `resolvePlacement(tile, offset, snap, globalSnap)`. The rest of the engine — routing, `TileIndex`, spatial queries, the canvas render base — keeps reading the **integer tile**; only the renderer and this chokepoint read `offset`. This bounds the blast radius.

**As-built caveat (v3.7.0):** the *drag* path does not actually call `resolvePlacement` — [`DragItems.ts`](../../packages/axoview-lib/src/interaction/modes/DragItems.ts) re-implements the snap predicate inline as `isOffGrid` (`(snap ?? true) && globalSnap`). Behaviour matches today, but this is exactly the "single chokepoint is load-bearing or the two desync" risk the Consequences below flag; the drag duplication should be folded back through `resolvePlacement`.

### 3. Global toggle + per-item override

- A persisted `uiState.snapToGrid` global toggle (default on) sets the default for new placements/drags (#12).
- Per-item overrides — **"Unsnap from grid" / "Snap to grid"** and **"Disable collision" / "Enable collision"** (#20) — live in the **canvas context menu** ([ADR 0027](0027-canvas-context-menu.md)). That menu is a new surface built for this purpose: there is **no** context-menu component today, so #20 has no home until ADR 0027 ships. The global toggle also surfaces in the empty-canvas context menu.

### 4. Collision is per-item

When `collides === false`, paste/drag/rigid-stamp skip the tile-hash occupancy test for that item and the `TileIndex` does not index it (neither pushes others nor is pushed). Colliding items behave exactly as today.

**2026-06-21 (UX re-test addendum):** Two clarifications from the journey-test runs (ADR 0028). **Snap UX:** the per-item "Snap/Unsnap from grid" override is shown in the context menu **only when the global snap toggle is on** — with global snap off a per-item snap override is meaningless, so it is hidden; the global toggle itself renders a checked state when on. (Per-item collision overrides are unaffected.) **Round-trip:** the off-grid fields (`offset`/`snap`/`collides`) survive a full export→import cycle for nodes, rectangles and text boxes, and for both new diagrams and pre-existing ones — items lacking the fields default to snapped/colliding, and a saved `snap:false` is preserved. The export serialises the full `views` and the loader parses them via `modelSchema` without stripping; locked by a round-trip test.

### 2026-07-23 addendum — rendered-geometry hardening

Written after the off-grid seven-bug cluster (commit `8ee54861`) and the hardening
pass that followed. The accepted text above is left as shipped; this addendum
corrects and extends it.

**A. Terminology correction — `offset` is SceneLayer px, not "unprojected px".**
§1 and Consequences call the stored `offset` "unprojected px". That is wrong, and
it is the kind of wrong that produces bugs: it invites consumers to project the
offset, or to convert it back into tiles. The residual is committed by
`DragItems` as `preciseDelta = screenDelta / zoom` and applied as a translate
**after** the projection — i.e. it lives in **SceneLayer px (post-projection)**,
the same space `getTilePosition`, `screenToCanvasPoint` and a SceneLayer child's
`style.left/top` all use. It is still projection-*independent* in the sense §1
cared about (the same numeric residual is applied in ISOMETRIC and 2D), which is
what made the original phrasing feel right. The coordinate spaces are now defined
in exactly one place: the header of
[`utils/renderedGeometry.ts`](../../packages/axoview-lib/src/utils/renderedGeometry.ts).

**B. One rendered-geometry source, and never round an offset into a tile.**
§2's "one snap chokepoint" bounded *writes*. It said nothing about *reads*, so
every renderer, chrome and hit-test site hand-rolled `getTilePosition(tile) +
offset` — and seven of them forgot. Composition now lives in
`utils/renderedGeometry.ts` (`getRenderedTilePosition`, `getRenderedOffset`,
`getRenderedTileFootprint`, `getRenderedAreaCorners`, `footprintContainsPoint`),
and a source-scan contract test fails CI on a new hand-rolled composition.

The proven-wrong alternative, recorded so it is not retried: making the tile
spatial index offset-aware by re-keying items on `round(tile +
fromCanvasPoint(offset))`. The offset is *sub-tile*; any integer-tile
representation discards up to half a tile (real captured case: offset `(-75,-3)`
quantised to a diagonal one-tile shift, putting the hit centre ~38 px from the
drawn node). **All off-grid hit-testing compares px against rendered
footprints** — `getItemAtTile` takes the cursor's SceneLayer `point` for exactly
this reason. The tile index survives untouched for what it is good at (raw
tile → id, connector endpoints).

**C. Cost model (why no footprint spatial index).** Pixel hit-testing is O(N)
over items and runs only on gesture paths — hover once per tile crossing, click
once, drag-over once per move — never in a render loop. ADR 0021's `TileIndex` is
unchanged. Revisit only on measured evidence from the ADR 0020 perf harness.

**D. The WebGL path is held to the DOM path by construction.** Bug #3 (a rect
snapping back to its grid cell on drop) lived in the gap between the DOM
`<Rectangle>` and the ADR 0038 WebGL bulk. Both now derive their vertices from
`getRenderedAreaCorners`, and the invariant suite asserts cross-path equality
rather than reading pixels (jsdom has no GL context).

**E. The as-built caveat in §2 is closed.** `DragItems` no longer re-implements
the snap predicate: it is exported from the chokepoint module itself as
`isSnappedPlacement(snap, globalSnap)`, and `resolvePlacement` and `DragItems`
are its only callers. The predicate rather than a `resolvePlacement()` call from
the drag loop, deliberately: the drag needs the decision *before* it has a
candidate residual (it picks the CSS preview from it), calling through per item
per frame would allocate in the hot path ADR 0020's harness guards, and
`resolvePlacement`'s zero-residual collapse would change what a drag commits.
Behaviour is unchanged; the duplication is gone.

**F. Label hit-proxies share one pointer contract.** `LabelHitLayer` and
`NodeLabelHitLayer` are siblings over two paint layers and had drifted: the node
layer let a right-click fall through so the window handler resolved the (empty)
tile above the node and opened the CANVAS menu, while a floating label opened its
item menu. The mechanics now live in `utils/labelPointerContract.ts` — the proxy
always swallows the press, and therefore must own the context menu — and node
labels open their node's item menu. This is a deliberate behaviour change, one of
two in the hardening pass (the other is footprint-accurate text box / rectangle
hit-testing, §B).

**G. New acceptance surface.** The original acceptance criteria assert the *data
model* (tile stays integer, offset is committed) — which is why all seven bugs
were invisible to them. The acceptance surface for off-grid geometry is now
`utils/__tests__/renderedGeometry.invariant.test.tsx` (render == chrome == hit
zone, parametrized over element kind × offset corpus × canvas mode) plus the
sub-tile e2e specs. See [testing.md](../guidelines/testing.md).

### 2026-07-31 addendum — the residual is re-projected on an iso↔2D switch (PROJ-07)

**Corrects §1's "offset in unprojected px works in both projections"**, which the
2026-07-23 addendum had already narrowed (the residual is a POST-projection
SceneLayer-px value, not an unprojected one) without following the correction
through to the projection SWITCH.

**The defect (R1/PROJ-07, ruled 2026-07-30).** Because `offset` lives in the
screen plane, it does not survive a change of projection. A real drag committed a
residual of `(58, 0)` px: inside the ISO tile diamond (58 / 70.75 = 0.82) and
*outside* the 2D tile square (58 > 50). The iso→2D switch carried it
byte-identical with the tile unchanged, so an item drawn inside its own cell in
ISO was drawn mostly over the **neighbouring** cell in 2D — where tile-based
collision (§4, which keys off the integer tile) will happily let a second item
sit. Nothing in this ADR specified projection-switch semantics, which is why the
campaign raised it as a product question rather than filing it.

**The rule.** On an iso↔2D switch, every off-grid residual in the active view is
re-projected as `toScreen_new(fromCanvasPoint_old(offset))` —
[`reprojectOffset`](../../packages/axoview-lib/src/utils/coordinateTransforms.ts),
applied by [`useCanvasModeToggle`](../../packages/axoview-lib/src/hooks/useCanvasModeToggle.ts).
This is the same principle and the same map the viewport centre already uses
(`getCanvasModeSwitchScroll`), so the item keeps its *logical* sub-tile position.
Both maps are linear and an exact inverse pair, so ISO→2D→ISO restores the
original values and repeated toggling cannot drift.

**Two consequences, stated because neither is obvious:**

- **A projection toggle is now a model edit** when any entity in the view is
  off-grid — it dirties the document and rides autosave. That is unavoidable
  once the residual is projection-dependent AND must persist: writing nothing
  would leave the saved file holding ISO residuals that a later 2D load renders
  at the wrong sub-tile position. An all-snapped diagram writes nothing at all
  (untouched views are returned by reference, so the store is never called).
- **Viewers are exempt.** The rewrite runs only in `EDITABLE`. This is a
  deliberate collision with the ruling above, resolved the way the two rank:
  VIEW-08 (ruled the same day) says a viewer's projection toggle may neither
  dirty nor save the diagram, and a viewer silently editing someone else's
  document is worse than a sub-tile imprecision on a read-only rendering.

### 2026-07-31 addendum — one projection ratio (PROJ-06)

`renderedGeometry`'s area-quad matrix was four 3-decimal literals (0.707 /
0.409), moved verbatim from `RectanglesCanvas` when the module was extracted,
deliberately, so the extraction changed no rendered pixel. The exact ratio
`getTilePosition` uses is half of `TILE_PROJECTION_MULTIPLIERS` — ±(0.7075,
0.4095) — so an area quad drifted `hypot(0.05, 0.05)` px per tile of extent
against a node drawn on the same tile: 1.41 px at 20 tiles, 2.83 px at 40. It
never flipped a one-tile hit test and it shrinks with fit-to-view zoom, which is
why it survived. Owner ruling 2026-07-30: a frozen-wrong constant is drift, not a
contract — take the one-time pixel movement. The constants are now DERIVED from
`TILE_PROJECTION_MULTIPLIERS`, so the two paths have one source.

## Consequences

**Positive:** minimal blast radius — the integer-tile invariant the whole engine relies on is preserved; per-item granularity matches the cherry-pick workflow; offset in unprojected px works in both projections.

**Negative / risks:** a second positioning source (tile + offset) — the single chokepoint is load-bearing or the two desync. A connector anchored to an offset/unsnapped node must resolve to the **rendered (offset)** endpoint, not the bare tile (routing subtlety). Export (PNG/SVG) and both projections must apply the offset.

## Implementation notes (non-binding)

- Renderer applies `offset` after the `CoordinateTransformStrategy` projection.
- Context-menu entries via the canvas context menu (`CanvasContextMenu`, built by [ADR 0027](0027-canvas-context-menu.md) — there is **no** generic `ContextMenu` component; this corrects the "existing `ContextMenu`" phrasing, which contradicted §3's "no context-menu component today"); global toggle in `uiStateStore` persisted settings (mirror `canvasMode`).
- Connector endpoint resolution reads the node's rendered position (tile + offset).

## Acceptance criteria

- **Unit:** `resolvePlacement` snaps when `snap`/`globalSnap` true, preserves px when false; save→load round-trips `offset`/`snap`/`collides`; lean-save omits defaults.
- **e2e (new `snap-grid.spec`):** global snap off → drag lands off-grid; context-menu unsnap one item → it moves freely between tiles while neighbours still snap; an unsnapped item overlaps another without pushing it; state persists across reload.
- **Perf (ADR 0020):** dragging an offset item stays within the drag noise band (offset read is O(1)); `TileIndex` build cost for colliding items unchanged.
