// Off-grid positioning chokepoint (ADR 0023).
//
// The integer tile stays the engine's single source of truth. Everything
// off-grid lives in ONE of two places only: this module (the placement
// decision + the residual/offset math) and the post-projection render translate
// in the renderers. The rest of the engine keeps reading the integer tile.

import { Coords, Scroll, Size } from 'src/types';
import { UNPROJECTED_TILE_SIZE } from 'src/config';
import { getStrategy, screenToCanvasPoint } from './coordinateTransforms';

export interface Placement {
  /** The integer tile committed to the model (always integer). */
  tile: Coords;
  /**
   * The SceneLayer-px (post-projection) residual the renderer applies as a
   * translate, or `undefined` when the item is snapped (so lean-save omits it
   * and a re-snap clears any stale offset). See `utils/renderedGeometry.ts` for
   * the coordinate spaces.
   */
  offset?: Coords;
}

/**
 * THE snap predicate. An item is SNAPPED iff the global toggle is on AND the
 * item is not explicitly unsnapped.
 *
 * Exported because the drag path needs the decision *before* it has a candidate
 * residual to resolve — it picks the CSS preview from it (follow the pointer vs
 * step by whole tiles). `DragItems` used to carry its own copy of this
 * expression, which is precisely the "the single chokepoint is load-bearing or
 * the two desync" risk ADR 0023's Consequences flag; there is now one
 * definition, here, and `resolvePlacement` below is its only other caller.
 */
export const isSnappedPlacement = (
  snap: boolean | undefined,
  globalSnap: boolean
): boolean => (snap ?? true) && globalSnap;

/**
 * THE single placement chokepoint. Given the nearest integer tile, a desired
 * sub-tile residual (or none), the item's `snap` flag and the global toggle,
 * decide whether to keep the px offset (off-grid) or clear it (snap).
 *
 * An item is SNAPPED iff the global toggle is on AND the item is not explicitly
 * unsnapped: `(snap ?? true) && globalSnap`. Otherwise it is off-grid and keeps
 * the residual. A zero / absent residual always collapses to a clean snapped
 * placement so we never persist a no-op `{x:0,y:0}` offset.
 */
export const resolvePlacement = (
  tile: Coords,
  offset: Coords | undefined,
  snap: boolean | undefined,
  globalSnap: boolean
): Placement => {
  const snapped = isSnappedPlacement(snap, globalSnap);
  if (snapped || !offset || (offset.x === 0 && offset.y === 0)) {
    return { tile };
  }
  return { tile, offset };
};

/**
 * The sub-tile residual (SceneLayer px) of a screen-space cursor relative to a
 * tile's centre. Used by fresh-placement flows (place-icon, text-box, paste) to
 * land an off-grid item where the pointer is. Mode-aware via the strategy.
 */
export const cursorTileResidual = (
  canvasMode: 'ISOMETRIC' | '2D',
  screen: Coords,
  tile: Coords,
  zoom: number,
  scroll: Scroll,
  rendererSize: Size
): Coords => {
  const point = screenToCanvasPoint(screen, zoom, scroll, rendererSize);
  const centre = getStrategy(canvasMode).toScreen(
    tile.x,
    tile.y,
    UNPROJECTED_TILE_SIZE
  );
  return { x: point.x - centre.x, y: point.y - centre.y };
};

/**
 * Convert a node's SceneLayer-px render offset into the delta to add to a
 * connector's endpoint VERTEX so the wire follows the node's rendered position.
 *
 * The connector SVG draws vertices in tile-space (`tile · UNPROJECTED_TILE_SIZE`)
 * then projects them via a `scale(-1,1)` + iso/2D matrix whose net map is
 * exactly `-toScreen(vertex / UNPROJECTED_TILE_SIZE)` in both modes. Inverting
 * that linear map, a screen-plane offset `o` shifts the endpoint when the vertex
 * is moved by `-UNPROJECTED_TILE_SIZE · fromCanvasPoint(o)`. No magic constants:
 * the strategy's own `fromCanvasPoint` carries the projection. (Verified
 * numerically against `toScreen` in iso and 2D.)
 */
export const connectorEndpointVertexDelta = (
  canvasMode: 'ISOMETRIC' | '2D',
  offset: Coords
): Coords => {
  const frac = getStrategy(canvasMode).fromCanvasPoint(
    offset.x,
    offset.y,
    UNPROJECTED_TILE_SIZE
  );
  // `0 -` (not unary minus) normalises a -0 result to +0 so it never reaches the
  // SVG path string as "-0".
  return {
    x: 0 - UNPROJECTED_TILE_SIZE * frac.x,
    y: 0 - UNPROJECTED_TILE_SIZE * frac.y
  };
};

/**
 * F4/LAY-03 — the layer a newly placed entity joins.
 *
 * There was no active-layer concept anywhere in the store: `VIEW_ITEM_DEFAULTS`
 * carries no `layerId`, and `modes/TextBox.ts`, `modes/Label.ts`,
 * `modes/PlaceIcon.ts` and the rectangle draw all wrote a fixed shape without
 * one. Selecting a layer row in the panel set the panel's own highlight and
 * nothing the placement path read, so every new element landed unassigned and
 * had to be dragged across afterwards.
 *
 * Returns a spreadable patch — `{}` when nothing is active, so an unlayered
 * diagram's entities stay lean exactly as before.
 *
 * The `layers` argument is not optional on purpose. A stale `activeLayerId`
 * (its layer deleted, or a different view active) would otherwise be stamped
 * onto a new entity as a dangling reference — the E2/RED-03 class, which
 * `assignLayerToItems` already refuses to create through its own door.
 */
export const activeLayerPatch = (
  activeLayerId: string | null | undefined,
  layers: { id: string }[] | undefined
): { layerId?: string } => {
  if (!activeLayerId) return {};
  return (layers ?? []).some((l) => l.id === activeLayerId)
    ? { layerId: activeLayerId }
    : {};
};
