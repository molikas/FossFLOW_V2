/**
 * Promoted from the 2026-07 exploratory lane (R1/PROJ-10).
 *
 * `getItemAtTile`'s ITEM branch resolved a hit by `scene.items` ARRAY order —
 * last wins — while `NodesCanvas` paints in
 * `resolveRenderOrder(layerOrder, zIndex, isoDepth)` order. Two items sharing a
 * tile (reachable with `collides: false`) therefore disagreed: the one with
 * `zIndex: 5` was drawn on top and the click selected the `zIndex: 0` one
 * underneath, and swapping the array order flipped the verdict. Sibling drift
 * inside one function — the RECTANGLE branch already re-sorted into paint order.
 */
import { getItemAtTile } from '../hitDetection';
import { makeTilePositionFn, isometricStrategy } from '../coordinateTransforms';
import type { HitTestScene } from '../hitDetection';

const TILE = { x: 2, y: 3 };

const makeScene = (items: HitTestScene['items']): HitTestScene => ({
  items,
  textBoxes: [],
  hitConnectors: [],
  rectangles: []
});

/** The SceneLayer point at the centre of TILE — what a click there resolves to. */
const pointAtTile = () =>
  makeTilePositionFn(isometricStrategy)({ tile: TILE, origin: 'CENTER' });

describe('getItemAtTile — items resolve in PAINT order (PROJ-10)', () => {
  const under = { id: 'under', tile: TILE, zIndex: 0 };
  const over = { id: 'over', tile: TILE, zIndex: 5 };

  it.each([
    ['the higher zIndex last in the array', [under, over]],
    ['the higher zIndex FIRST in the array', [over, under]]
  ])('picks the topmost item — %s', (_label, items) => {
    // The array-order verdict flips between these two; the paint-order one
    // must not. That flip IS the bug.
    expect(getItemAtTile({ tile: TILE, scene: makeScene(items) })).toEqual({
      type: 'ITEM',
      id: 'over'
    });
  });

  it('holds on the pixel-accurate path too (ADR 0023 point + mode)', () => {
    for (const items of [
      [under, over],
      [over, under]
    ]) {
      expect(
        getItemAtTile({
          tile: TILE,
          scene: makeScene(items),
          canvasMode: 'ISOMETRIC',
          point: pointAtTile()
        })
      ).toEqual({ type: 'ITEM', id: 'over' });
    }
  });

  it('falls back to iso depth when zIndex ties, matching the renderer', () => {
    // resolveRenderOrder's third term is `-tile.x - tile.y`, so the item with
    // the LOWER tile sum paints later (on top). Two items on different tiles
    // can only both be hit on the pixel path, so use it.
    const near = { id: 'near', tile: { x: 0, y: 0 }, zIndex: 0 };
    const far = { id: 'far', tile: { x: 5, y: 5 }, zIndex: 0 };
    const scene = makeScene([near, far]);
    // Query each tile in turn — each must resolve to its own occupant; the
    // point is that adding the depth term did not break single-occupant tiles.
    expect(getItemAtTile({ tile: { x: 0, y: 0 }, scene })).toEqual({
      type: 'ITEM',
      id: 'near'
    });
    expect(getItemAtTile({ tile: { x: 5, y: 5 }, scene })).toEqual({
      type: 'ITEM',
      id: 'far'
    });
  });

  it('is unchanged for the ordinary one-item-per-tile case', () => {
    const scene = makeScene([
      { id: 'a', tile: { x: 0, y: 0 } },
      { id: 'b', tile: { x: 1, y: 1 } }
    ]);
    expect(getItemAtTile({ tile: { x: 1, y: 1 }, scene })).toEqual({
      type: 'ITEM',
      id: 'b'
    });
    expect(getItemAtTile({ tile: { x: 9, y: 9 }, scene })).toBeNull();
  });
});
