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
import { resolveRenderOrder } from 'src/utils/renderOrder';

// Explicit scene shape — avoids importing the full useScene hook type here.
export interface HitTestScene {
  // `offset` (ADR 0023, SceneLayer px — see renderedGeometry.ts for the
  // coordinate spaces) is optional: present on off-grid items so hit-testing can
  // resolve them under their rendered position.
  // `zIndex` (PROJ-10) puts the hit test in the same paint order the canvas
  // draws in. Optional because most callers pass a partial scene; absent reads
  // as 0, which is the renderer's own default.
  items: Array<{ id: string; tile: Coords; offset?: Coords; zIndex?: number }>;
  textBoxes: Array<TextBox & { size: Size }>;
  hitConnectors: Array<{
    id: string;
    path?: { tiles: Coords[]; rectangle: { from: Coords } };
  }>;
  rectangles: Array<{
    id: string;
    from: Coords;
    to: Coords;
    zIndex?: number;
    offset?: Coords;
  }>;
}

// WeakMap-based spatial index: one Map<"x,y", id> per unique scene.items array reference.
// Building the index is O(N) once; lookups are O(1). GC'd when items array is replaced.
const itemTileIndexCache = new WeakMap<
  HitTestScene['items'],
  Map<string, string>
>();

const getItemTileIndex = (
  items: HitTestScene['items']
): Map<string, string> => {
  if (!itemTileIndexCache.has(items)) {
    // PROJ-10: built in PAINT order, so the last write for a shared tile is the
    // entity actually drawn on top. It used to build in array order, which made
    // the raw-tile path disagree with the canvas the same way the pixel path did
    // — and with the two consulted from different call sites, they could
    // disagree with each OTHER as well.
    itemTileIndexCache.set(
      items,
      new Map(
        itemsInPaintOrder(items).map((item) => [
          `${item.tile.x},${item.tile.y}`,
          item.id
        ])
      )
    );
  }
  return itemTileIndexCache.get(items)!;
};

// Items in PAINT order, bottom-first — the order `NodesCanvas` draws them in.
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
// `layerOrder` is 0 for every item here: this module is handed a flat scene with
// no `layers` array, so the layer BUCKET cannot be resolved. That is not a gap
// in practice — hidden-layer entities are excluded from interaction by
// `isItemInteractable` upstream, and two items on different visible layers do
// not share a tile without also colliding — but it is why this is a paint-order
// approximation rather than the paint order itself, and it is stated here so a
// future reader does not assume the layer bucket is being honoured.
const itemsInPaintOrder = (items: HitTestScene['items']) =>
  [...items].sort(
    (a, b) =>
      resolveRenderOrder(0, a.zIndex ?? 0, -a.tile.x - a.tile.y) -
      resolveRenderOrder(0, b.zIndex ?? 0, -b.tile.x - b.tile.y)
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
  canvasMode: CanvasMode
): string | null => {
  const getTilePosition = makeTilePositionFn(getStrategy(canvasMode));
  const painted = itemsInPaintOrder(items);
  for (let i = painted.length - 1; i >= 0; i -= 1) {
    const it = painted[i];
    const footprint = getRenderedTileFootprint(it, getTilePosition, canvasMode);
    if (footprintContainsPoint(footprint, point)) return it.id;
  }
  return null;
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
  // Raw tile → id, still needed for the node-anchored connector-endpoint check
  // below (an endpoint sits on the node's RAW tile, offset or not).
  const tileIndex = getItemTileIndex(scene.items);
  // ITEM hit: pixel-accurate against rendered footprints when we have the cursor
  // point + mode (grabs an off-grid item where it's drawn); else the raw tile
  // index (SPATIAL-1: O(1) Map lookup, id returned directly).
  const itemId =
    point && canvasMode
      ? itemAtPoint(scene.items, point, canvasMode)
      : tileIndex.get(`${tile.x},${tile.y}`);

  if (itemId != null) return { type: 'ITEM', id: itemId };

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
  const textBox = scene.textBoxes.find((tb) => {
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

  if (connector) return { type: 'CONNECTOR', id: connector.id };

  // Rectangles paint in the SAME order Rectangles.tsx uses: reversed insertion,
  // then a stable sort by (zIndex asc) — so the LAST element is the one drawn on
  // top. A click on overlapping rectangles must select that visually-topmost
  // one (honouring zIndex and matching what the user sees), not the first match
  // in insertion order. Scan the paint order from the top down.
  const rectPaintOrder = [...scene.rectangles]
    .reverse()
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  let rectangle: (typeof rectPaintOrder)[number] | undefined;
  for (let i = rectPaintOrder.length - 1; i >= 0; i -= 1) {
    const r = rectPaintOrder[i];
    if (areaContainsCursor(r.from, r.to, r.offset, [r.from, r.to])) {
      rectangle = r;
      break;
    }
  }

  if (rectangle) return { type: 'RECTANGLE', id: rectangle.id };

  return null;
};
