import { Layer } from 'src/types';

// Three-tier bucket sort for isometric render order.
//
// Priority (high → low):
//   1. Layer stack position  — which named layer the item belongs to
//   2. Explicit z-index      — within-layer user-controlled order
//   3. Isometric depth       — tiebreaker: items further "back" render first
//
// Bucket sizes ensure no tier overflows into the next.
const LAYER_BUCKET = 1_000_000;
const ZINDEX_BUCKET = 1_000;

/**
 * Resolve the CSS z-index / React `order` prop for a canvas entity.
 *
 * @param layerOrder   - Layer.order value (0 if no layer assigned)
 * @param zIndex       - Item-level explicit z-index (0 if not set)
 * @param isoDepth     - Isometric depth: typically `-tile.x - tile.y`
 */
export const resolveRenderOrder = (
  layerOrder: number,
  zIndex: number,
  isoDepth: number
): number => {
  return layerOrder * LAYER_BUCKET + zIndex * ZINDEX_BUCKET + isoDepth;
};

/**
 * Look up a layer by ID from the layers array.
 * Returns undefined if no layerId provided or layer not found.
 */
export const findLayer = (
  layerId: string | undefined,
  layers: Layer[]
): Layer | undefined => {
  if (!layerId) return undefined;
  return layers.find((l) => l.id === layerId);
};
