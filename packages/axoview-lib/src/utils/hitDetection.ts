// Hit detection: find which scene item (if any) sits at a given isometric tile.
// Kept separate from isoMath.ts so the WeakMap spatial index is isolated and testable.

import { CanvasMode, Coords, Size, ItemReference, TextBox } from 'src/types';
import {
  getBoundingBox,
  isWithinBounds,
  connectorPathTileToGlobal,
  getTextBoxEndTile
} from 'src/utils/isoMath';
import {
  getStrategy,
  makeTilePositionFn
} from 'src/utils/coordinateTransforms';
import {
  footprintContainsPoint,
  getRenderedAreaFootprint,
  getRenderedTileFootprint
} from 'src/utils/renderedGeometry';
import {
  resolveRenderOrder,
  compareSceneDrawOrder,
  SceneDrawOrder
} from 'src/utils/renderOrder';

// Explicit scene shape — avoids importing the full useScene hook type here.
export interface HitTestScene {
  // `offset` (ADR 0023, SceneLayer px — see renderedGeometry.ts for the
  // coordinate spaces) is optional: present on off-grid items so hit-testing can
  // resolve them under their rendered position.
  // `zIndex` (PROJ-10) puts the hit test in the same paint order the canvas
  // draws in. Optional because most callers pass a partial scene; absent reads
  // as 0, which is the renderer's own default.
  // `layerId` (PROJ-10 residual) resolves against `layers` below.
  items: Array<{
    id: string;
    tile: Coords;
    offset?: Coords;
    zIndex?: number;
    layerId?: string;
  }>;
  textBoxes: Array<TextBox & { size: Size }>;
  hitConnectors: Array<{
    id: string;
    path?: { tiles: Coords[]; rectangle: { from: Coords } };
    layerId?: string;
  }>;
  rectangles: Array<{
    id: string;
    from: Coords;
    to: Coords;
    zIndex?: number;
    offset?: Coords;
    layerId?: string;
  }>;
  // PROJ-10's residual (closed 2026-08-08). The LAYER tier of the paint order —
  // `Layer.order` for the current view, the same array `SceneCanvas` sorts by.
  // Optional: a caller that omits it resolves every entity at `layerOrder: 0`,
  // which is exactly right for a document with no layers and keeps the partial
  // scenes the unit suites build working unchanged.
  layers?: Array<{ id: string; order: number }>;
}

type LayerOrderOf = (layerId: string | undefined) => number;

const UNLAYERED: LayerOrderOf = () => 0;

// Same lookup `SceneCanvas` builds, and cached the same way the tile index is:
// per unique `layers` array reference, so a pointer event does not rebuild it.
const layerOrderCache = new WeakMap<
  NonNullable<HitTestScene['layers']>,
  LayerOrderOf
>();

const getLayerOrderOf = (layers: HitTestScene['layers']): LayerOrderOf => {
  if (!layers || layers.length === 0) return UNLAYERED;
  const cached = layerOrderCache.get(layers);
  if (cached) return cached;
  const orderByLayerId = new Map(layers.map((l) => [l.id, l.order]));
  const fn: LayerOrderOf = (layerId) =>
    (layerId ? orderByLayerId.get(layerId) : undefined) ?? 0;
  layerOrderCache.set(layers, fn);
  return fn;
};

// WeakMap-based spatial index: one Map<"x,y", id> per unique scene.items array reference.
// Building the index is O(N) once; lookups are O(1). GC'd when items array is replaced.
//
// The index is built in PAINT order, so it depends on `layers` as well as on
// `items` — a layer reorder produces a new `layers` array while leaving `items`
// untouched, so the cached entry records which one it was built from and rebuilds
// when that changes. (`SceneCanvas`'s own sort cache keys on both for the same
// reason.)
type HitItem = HitTestScene['items'][number];

const itemTileIndexCache = new WeakMap<
  HitTestScene['items'],
  { layers: HitTestScene['layers']; index: Map<string, HitItem> }
>();

const getItemTileIndex = (
  items: HitTestScene['items'],
  layers: HitTestScene['layers'],
  layerOrderOf: LayerOrderOf
): Map<string, HitItem> => {
  const cached = itemTileIndexCache.get(items);
  if (cached && cached.layers === layers) return cached.index;
  // PROJ-10: built in PAINT order, so the last write for a shared tile is the
  // entity actually drawn on top. It used to build in array order, which made
  // the raw-tile path disagree with the canvas the same way the pixel path did
  // — and with the two consulted from different call sites, they could
  // disagree with each OTHER as well.
  //
  // Values are the ITEM, not its id: the cross-type ranking below needs the
  // hit's own layer/zIndex/tile, and looking those back up by id would put an
  // O(N) scan on a path whose whole point is the O(1) Map lookup.
  const index = new Map(
    itemsInPaintOrder(items, layerOrderOf).map((item) => [
      `${item.tile.x},${item.tile.y}`,
      item
    ])
  );
  itemTileIndexCache.set(items, { layers, index });
  return index;
};

// Items in PAINT order, bottom-first — the order `SceneCanvas` draws them in.
//
// R1/PROJ-10: the hit test used to scan `scene.items` backwards and return the
// last ARRAY entry, while the canvas paints in
// `resolveRenderOrder(layerOrder, zIndex, isoDepth)` order. Two items sharing a
// tile (reachable with `collides: false`) therefore disagreed: the one with
// `zIndex: 5` was drawn on top and the click selected the `zIndex: 0` one
// underneath, and swapping the array order flipped the verdict. Sibling drift
// inside one function — the RECTANGLE branch below already re-sorts into paint
// order for exactly this reason.
//
// The LAYER tier is resolved here too, from `scene.layers` (PROJ-10's residual,
// closed 2026-08-08 by the program final sweep). It used to be hard-coded to 0
// because this module was handed a flat scene with no `layers` array, which made
// the ordering an APPROXIMATION of the paint order rather than the paint order —
// a visually top rectangle on a high-`order` layer lost the click to a
// lower-layer one that won the `zIndex` tie.
const itemsInPaintOrder = (
  items: HitTestScene['items'],
  layerOrderOf: LayerOrderOf
) =>
  [...items].sort(
    (a, b) =>
      resolveRenderOrder(
        layerOrderOf(a.layerId),
        a.zIndex ?? 0,
        -a.tile.x - a.tile.y
      ) -
      resolveRenderOrder(
        layerOrderOf(b.layerId),
        b.zIndex ?? 0,
        -b.tile.x - b.tile.y
      )
  );

// Pixel-accurate ITEM hit test (ADR 0023). An off-grid item renders at its tile
// projection + a px offset, and that offset is SUB-TILE — snapping the cursor to
// an integer tile and comparing tile keys throws away up to half a tile, so
// hovering the visible item lands on a neighbour. Instead we test the cursor's
// SceneLayer point directly against each item's RENDERED footprint (the iso
// diamond / 2D square from `renderedGeometry`). Topmost wins — scanned from the
// top of the PAINT order down (PROJ-10), not from the end of the array.
//
// O(N log N) per call, but only on gesture paths that pass a `point` (hover
// fires once per tile crossing, click once, drag-over once per move) — never the
// render loop.
const itemAtPoint = (
  items: HitTestScene['items'],
  point: Coords,
  canvasMode: CanvasMode,
  layerOrderOf: LayerOrderOf
): HitItem | null => {
  const getTilePosition = makeTilePositionFn(getStrategy(canvasMode));
  const painted = itemsInPaintOrder(items, layerOrderOf);
  for (let i = painted.length - 1; i >= 0; i -= 1) {
    const it = painted[i];
    const footprint = getRenderedTileFootprint(it, getTilePosition, canvasMode);
    if (footprintContainsPoint(footprint, point)) return it;
  }
  return null;
};

// Could any connector or rectangle out-rank this ITEM hit, ignoring geometry?
//
// A "no" lets a click on a node keep the O(1) answer it had before the cross-type
// ranking existed, which is the hot path (hover fires once per tile crossing).
// The check is arithmetic over the two arrays — no footprints, no allocation.
//
// Only the KEY needs comparing, not the full comparator: at an equal key the
// tiebreaker is `SCENE_TYPE_RANK`, and `node` (2) already outranks both
// `connector` (1) and `rectangle` (0). So a strictly greater key is the only way
// either of them wins.
const canOutrankItem = (
  scene: HitTestScene,
  itemUnit: SceneDrawOrder,
  layerOrderOf: LayerOrderOf
): boolean => {
  const itemKey = resolveRenderOrder(itemUnit.layerOrder, itemUnit.zIndex, 0);
  for (const c of scene.hitConnectors) {
    if (resolveRenderOrder(layerOrderOf(c.layerId), 0, 0) > itemKey) return true;
  }
  for (const r of scene.rectangles) {
    if (
      resolveRenderOrder(layerOrderOf(r.layerId), r.zIndex ?? 0, 0) > itemKey
    ) {
      return true;
    }
  }
  return false;
};

export const getItemAtTile = ({
  tile,
  scene,
  canvasMode,
  point,
  connectorMatch = 'halo'
}: {
  tile: Coords;
  scene: HitTestScene;
  // ADR 0023: canvas mode for the projection used by the pixel-accurate ITEM
  // hit test. Paired with `point`; omit both to keep the raw-tile behaviour used
  // by paths that don't grab an item's body (connector/pan/placement).
  canvasMode?: 'ISOMETRIC' | '2D';
  // ADR 0023: the cursor in canvas/SceneLayer space (screenToCanvasPoint). When
  // given with `canvasMode`, ITEM hit-testing is pixel-accurate against each
  // item's rendered footprint, so an off-grid item is grabbed where it's DRAWN,
  // not at its grid cell. Omitted = raw integer-tile lookup.
  point?: Coords;
  // Connector hit tolerance (#5). 'halo' (default) keeps the ±1 Chebyshev
  // neighbourhood — needed for hover and reconnect/waypoint grabbing on a thin
  // line. 'exact' requires the query tile to BE a path tile — used for
  // click-SELECTION so clicking an empty tile beside a connector clears the
  // selection instead of grabbing the connector (owner #5). #54 already
  // dropped the halo around node-anchored endpoints; this narrows the rest of
  // the segment for the select gesture only.
  connectorMatch?: 'halo' | 'exact';
}): ItemReference | null => {
  const layerOrderOf = getLayerOrderOf(scene.layers);
  // Raw tile → id, still needed for the node-anchored connector-endpoint check
  // below (an endpoint sits on the node's RAW tile, offset or not).
  const tileIndex = getItemTileIndex(scene.items, scene.layers, layerOrderOf);
  // ITEM hit: pixel-accurate against rendered footprints when we have the cursor
  // point + mode (grabs an off-grid item where it's drawn); else the raw tile
  // index (SPATIAL-1: O(1) Map lookup, the item returned directly).
  const hitItem =
    (point && canvasMode
      ? itemAtPoint(scene.items, point, canvasMode, layerOrderOf)
      : tileIndex.get(`${tile.x},${tile.y}`)) ?? null;

  // PROJ-10 residual — CROSS-TYPE resolution. An ITEM hit used to return here,
  // which was right while the four bulk canvases stacked by type at fixed CSS
  // z-indices. The GPU-13 merge draws all of them from one
  // `compareSceneDrawOrder` sort, so layer and z-index now cross an entity type:
  // a rectangle on a higher layer really is painted over the node. The branches
  // below still each find their own topmost hit — only the choice BETWEEN them
  // moved, and it moved onto the renderer's own comparator.
  //
  // At equal layer and z-index the comparator's TYPE RANK reproduces this
  // function's historical precedence exactly (node > connector > rectangle), so
  // an unlayered document with no z-order set behaves as it always has.
  const itemUnit: (SceneDrawOrder & { id: string }) | null = hitItem && {
    id: hitItem.id,
    kind: 'node',
    layerOrder: layerOrderOf(hitItem.layerId),
    zIndex: hitItem.zIndex ?? 0,
    isoDepth: -hitItem.tile.x - hitItem.tile.y
  };

  // The other bulk branches are only worth evaluating when one of them could
  // actually outrank the item — otherwise a click on a node keeps its O(1)
  // answer. This is an arithmetic ceiling over the two arrays, no geometry.
  if (itemUnit && !canOutrankItem(scene, itemUnit, layerOrderOf)) {
    return { type: 'ITEM', id: itemUnit.id };
  }

  // ADR 0023: the tile-range shapes (text box, rectangle) are drawn at their
  // projected tile range PLUS a px offset. Test the cursor point against the
  // shape's RENDERED quad — the very corners the renderers draw — rather than
  // rounding the point back into the shape's un-offset tile frame. Rounding was
  // the fix's first shape and it leaves up to half a tile of slop at every edge:
  // a shape nudged by a residual stayed grabbable at the cell it had left, and
  // missed part of its own drawn body.
  //
  // Callers without a point/mode (connector, pan, placement paths) keep the raw
  // integer-tile range test — behaviour unchanged.
  const areaGetTilePosition =
    point && canvasMode ? makeTilePositionFn(getStrategy(canvasMode)) : null;

  const areaContainsCursor = (
    from: Coords,
    to: Coords,
    offset: Coords | undefined,
    tileBounds: Coords[]
  ): boolean => {
    if (!areaGetTilePosition || !point || !canvasMode) {
      return isWithinBounds(tile, tileBounds);
    }
    return footprintContainsPoint(
      getRenderedAreaFootprint(
        from,
        to,
        offset,
        areaGetTilePosition,
        canvasMode
      ),
      point
    );
  };

  // A text box claims its whole tile footprint and outranks connectors (clicking
  // inside the box selects it). Floating Labels are NOT tile-hit-tested — they
  // are a separate entity hit via the pixel-accurate LabelHitLayer DOM proxy
  // (ADR 0031 §4), so a connector passing UNDER a label chip stays selectable
  // here everywhere the chip isn't.
  //
  // TEXT BOXES ARE DELIBERATELY OUTSIDE the cross-type ranking above. They are
  // not in the merged canvas's sort at all — `Renderer` mounts them in a DOM
  // `SceneLayer` above `SceneCanvas` (wave 5 recorded them, with connector label
  // chips, as the out-of-sort set and gave that its own follow-up trigger). So a
  // text box paints above every bulk entity regardless of layer or z-index, and
  // ranking it by a layer order the renderer does not consult would INTRODUCE a
  // divergence rather than close one. Its position in this chain is unchanged.
  const textBox = itemUnit
    ? undefined
    : scene.textBoxes.find((tb) => {
        const textBoxTo = getTextBoxEndTile(tb, tb.size);
        const textBoxEnd = {
          x: Math.ceil(textBoxTo.x),
          y:
            tb.orientation === 'X'
              ? Math.ceil(textBoxTo.y)
              : Math.floor(textBoxTo.y)
        };
        return areaContainsCursor(
          tb.tile,
          textBoxEnd,
          tb.offset,
          getBoundingBox([tb.tile, textBoxEnd])
        );
      });

  if (textBox) return { type: 'TEXTBOX', id: textBox.id };

  const connector = scene.hitConnectors.find((con) => {
    if (!con.path?.tiles) return false;
    const pathTiles = con.path.tiles;
    const origin = con.path.rectangle.from;

    // B5: connector lines render ~1-2px wide, so exact tile equality made them
    // near-impossible to click. Accept any query tile within Chebyshev-1 (the
    // 8-neighbourhood, max(|dx|,|dy|) <= 1) of a path tile.
    //
    // Exception — a NODE-anchored endpoint sits ON the node's tile, so that ±1
    // halo ballooned the connector's hit region into the whole ring of empty
    // tiles AROUND a connected node: a left-click just beside the node selected
    // the connector (and opened its context menu) instead of clearing the
    // selection / switching to pointer (reported confusion). When the query tile
    // is in the 8-neighbourhood of a node-anchored endpoint, drop the tolerance
    // and require an EXACT path-tile match: the visible line still selects, the
    // node remains its own hit target, and the empty tiles beside it are free
    // again. Free-floating (tile) endpoints keep the halo — their thin loose end
    // needs it. Endpoints are pathTiles[0] / pathTiles[last]; "node-anchored" ==
    // that global tile is occupied by an item (tileIndex hit).
    let nearNodeEndpoint = false;
    for (let k = 0; k < 2 && !nearNodeEndpoint; k += 1) {
      const endTile = k === 0 ? pathTiles[0] : pathTiles[pathTiles.length - 1];
      const g = connectorPathTileToGlobal(endTile, origin);
      if (
        tileIndex.has(`${g.x},${g.y}`) &&
        Math.abs(g.x - tile.x) <= 1 &&
        Math.abs(g.y - tile.y) <= 1
      ) {
        nearNodeEndpoint = true;
      }
    }

    // Computed inline (no per-tile allocation) — this runs per pointer event.
    return pathTiles.some((pathTile) => {
      const globalPathTile = connectorPathTileToGlobal(pathTile, origin);
      const dx = Math.abs(globalPathTile.x - tile.x);
      const dy = Math.abs(globalPathTile.y - tile.y);
      if (dx === 0 && dy === 0) return true;
      // Click-selection (#5): exact path-tile only — empty neighbours don't grab.
      if (connectorMatch === 'exact') return false;
      if (nearNodeEndpoint) return false;
      return dx <= 1 && dy <= 1;
    });
  });

  // Rectangles paint in the SAME order Rectangles.tsx uses: reversed insertion,
  // then a stable sort by (layer order, zIndex) ascending — so the LAST element
  // is the one drawn on top. A click on overlapping rectangles must select that
  // visually-topmost one (honouring layer and zIndex, matching what the user
  // sees), not the first match in insertion order. Scan the paint order from the
  // top down. The layer term is PROJ-10's residual: it is the tier that carries
  // the entry's own repro shape, two rectangles on different layers.
  const rectPaintOrder = [...scene.rectangles]
    .reverse()
    .sort(
      (a, b) =>
        resolveRenderOrder(layerOrderOf(a.layerId), a.zIndex ?? 0, 0) -
        resolveRenderOrder(layerOrderOf(b.layerId), b.zIndex ?? 0, 0)
    );
  let rectangle: (typeof rectPaintOrder)[number] | undefined;
  for (let i = rectPaintOrder.length - 1; i >= 0; i -= 1) {
    const r = rectPaintOrder[i];
    if (areaContainsCursor(r.from, r.to, r.offset, [r.from, r.to])) {
      rectangle = r;
      break;
    }
  }

  // One winner per bulk branch; the merged canvas's own comparator picks between
  // them. `compareSceneDrawOrder` returns <0 when `a` paints first, so the LAST
  // survivor of the reduce is the topmost.
  const candidates: Array<SceneDrawOrder & { ref: ItemReference }> = [];
  if (itemUnit) {
    candidates.push({ ...itemUnit, ref: { type: 'ITEM', id: itemUnit.id } });
  }
  if (connector) {
    candidates.push({
      kind: 'connector',
      layerOrder: layerOrderOf(connector.layerId),
      // Connectors carry no z-index — `canZOrder` offers the z-order commands to
      // ITEM / LABEL / RECTANGLE only and the schema has no field. Same constant
      // `SceneCanvas` feeds the sort.
      zIndex: 0,
      isoDepth: 0,
      ref: { type: 'CONNECTOR', id: connector.id }
    });
  }
  if (rectangle) {
    candidates.push({
      kind: 'rectangle',
      layerOrder: layerOrderOf(rectangle.layerId),
      zIndex: rectangle.zIndex ?? 0,
      isoDepth: 0,
      ref: { type: 'RECTANGLE', id: rectangle.id }
    });
  }
  if (candidates.length === 0) return null;

  return candidates.reduce((top, c) =>
    compareSceneDrawOrder(top, c) <= 0 ? c : top
  ).ref;
};
