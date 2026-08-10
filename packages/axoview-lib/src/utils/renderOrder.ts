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
 * Entity kinds the merged bulk canvas draws, in their paint-order rank.
 *
 * The rank reproduces the mount order the four separate canvases used to have
 * (`RectanglesCanvas → ConnectorsCanvas → NodesCanvas → LabelsCanvas`), which is
 * what keeps a document with no explicit layering or z-order looking exactly as
 * it did before the merge — and what states ADR 0031 §2 ("a floating Label paints
 * above nodes") as a sort-key property rather than a mount-order accident.
 */
export type SceneEntityKind = 'rectangle' | 'connector' | 'node' | 'label';

export const SCENE_TYPE_RANK: Record<SceneEntityKind, number> = {
  rectangle: 0,
  connector: 1,
  node: 2,
  label: 3
};

export interface SceneDrawOrder {
  /** `Layer.order` of the entity's layer, 0 when unassigned. */
  layerOrder: number;
  /** Item-level explicit z-index, 0 when unset. */
  zIndex: number;
  kind: SceneEntityKind;
  /** `-tile.x - tile.y` for tile-anchored entities; 0 for areas and paths. */
  isoDepth: number;
}

/**
 * The merged bulk's paint-order comparator (R3/GPU-13, ADR 0038 §8).
 *
 * Tiers, high → low: **layer stack, z-index, TYPE RANK, iso depth** — then the
 * caller's array order, via a stable sort.
 *
 * **Type rank sits ABOVE iso depth, and that placement is load-bearing.** §8's
 * skeleton reads "keyed by `resolveRenderOrder(layerOrder, zIndex, isoDepth)`
 * with a type rank as the tiebreaker at equal keys", and taken literally that
 * does not work: iso depth is fed inconsistently across types today
 * (`NodesCanvas` passes `-tile.x - tile.y`, `LabelsCanvas` passes `0`,
 * connectors and rectangles do not sort at all), so a node at a positive tile
 * would sort BELOW every rectangle and label on the same layer at the same
 * z-index and the keys would never be equal for the tiebreaker to reach. That is
 * precisely the "visible re-ordering of existing documents" §8 says must not
 * happen. Ranking types first and letting iso depth separate only same-type
 * entities is the formulation that delivers what §8 decided; corrected here
 * while implementing the merge.
 *
 * The picker (`hitDetection.ts`) resolves all three tiers from this same helper,
 * and since 2026-08-08 it ranks ACROSS entity kinds with this same comparator —
 * so renderer and picker agree by construction. Closing PROJ-10's residual (the
 * layer tier, which the picker was blind to while it was handed a flat scene) is
 * what completed that; the merge had already made layer and z-index cross a type,
 * which the picker's fixed branch precedence could not express. Text boxes and
 * connector label chips remain outside the sort on both sides — they are DOM
 * above the canvas. See `pickerAgreement.contract.test.ts`.
 */
export const compareSceneDrawOrder = (
  a: SceneDrawOrder,
  b: SceneDrawOrder
): number =>
  resolveRenderOrder(a.layerOrder, a.zIndex, 0) -
    resolveRenderOrder(b.layerOrder, b.zIndex, 0) ||
  SCENE_TYPE_RANK[a.kind] - SCENE_TYPE_RANK[b.kind] ||
  a.isoDepth - b.isoDepth;

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
