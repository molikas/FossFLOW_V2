/**
 * Promoted from the F4 explore lane (ADR 0047 flip rule) — LAY-11, and the
 * placement chokepoint LAY-03 needed.
 *
 * LAY-11: `assignLayerToItems` took bare ids and applied ONE id-set filter
 * across all five entity collections, so assigning a node to a layer also moved
 * a rectangle that happened to share the node's id. Cross-collection id
 * uniqueness is not enforced anywhere (E4/CLIP-01 is the filed root), and the
 * callers had the typed `ItemReference[]` in their hands the whole time — the
 * type was dropped on the way in.
 */
import { assignLayerToItems } from '../view';
import { activeLayerPatch } from 'src/utils/resolvePlacement';
import type { State, ViewReducerContext } from '../types';
import type { Layer } from 'src/types';

const VIEW_ID = 'view-1';

const LAYERS: Layer[] = [
  { id: 'l1', name: 'L1', visible: true, locked: false, order: 0 },
  { id: 'l2', name: 'L2', visible: true, locked: false, order: 1 }
];

/** A view where a node and a rectangle deliberately SHARE an id. */
const collidingState = (): State =>
  ({
    model: {
      version: '1.0',
      title: 'F4',
      icons: [],
      colors: [],
      items: [{ id: 'shared', name: 'N' }],
      views: [
        {
          id: VIEW_ID,
          name: 'Page 1',
          layers: LAYERS,
          items: [{ id: 'shared', tile: { x: 0, y: 0 } }],
          rectangles: [{ id: 'shared', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }],
          labels: [{ id: 'shared', text: 'L', tile: { x: 2, y: 2 } }],
          textBoxes: [],
          connectors: []
        }
      ]
    },
    scene: { connectors: {}, textBoxes: {} }
  }) as unknown as State;

const ctx = (state: State): ViewReducerContext => ({ viewId: VIEW_ID, state });
const viewOf = (s: State) => s.model.views[0] as never as {
  items: { id: string; layerId?: string }[];
  rectangles: { id: string; layerId?: string }[];
  labels: { id: string; layerId?: string }[];
};

describe('assignLayerToItems — the type travels with the id (LAY-11)', () => {
  it('PRECONDITION: the fixture really does have a cross-collection id collision', () => {
    const v = viewOf(collidingState());
    expect(v.items[0].id).toBe('shared');
    expect(v.rectangles[0].id).toBe('shared');
    expect(v.labels[0].id).toBe('shared');
  });

  it('assigning the NODE moves only the node', () => {
    const out = assignLayerToItems(
      { layerId: 'l1', refs: [{ type: 'ITEM', id: 'shared' }] },
      ctx(collidingState())
    );
    const v = viewOf(out);
    expect(v.items[0].layerId).toBe('l1');
    expect(v.rectangles[0].layerId).toBeUndefined();
    expect(v.labels[0].layerId).toBeUndefined();
  });

  it('assigning the RECTANGLE moves only the rectangle', () => {
    const out = assignLayerToItems(
      { layerId: 'l2', refs: [{ type: 'RECTANGLE', id: 'shared' }] },
      ctx(collidingState())
    );
    const v = viewOf(out);
    expect(v.rectangles[0].layerId).toBe('l2');
    expect(v.items[0].layerId).toBeUndefined();
  });

  it('unassigning is type-scoped too', () => {
    const assigned = assignLayerToItems(
      {
        layerId: 'l1',
        refs: [
          { type: 'ITEM', id: 'shared' },
          { type: 'RECTANGLE', id: 'shared' }
        ]
      },
      ctx(collidingState())
    );
    const out = assignLayerToItems(
      { layerId: undefined, refs: [{ type: 'ITEM', id: 'shared' }] },
      ctx(assigned)
    );
    const v = viewOf(out);
    expect(v.items[0].layerId).toBeUndefined();
    expect(v.rectangles[0].layerId).toBe('l1');
  });

  it('a mixed batch reaches each collection with its own ids', () => {
    const out = assignLayerToItems(
      {
        layerId: 'l1',
        refs: [
          { type: 'ITEM', id: 'shared' },
          { type: 'LABEL', id: 'shared' }
        ]
      },
      ctx(collidingState())
    );
    const v = viewOf(out);
    expect([v.items[0].layerId, v.labels[0].layerId]).toEqual(['l1', 'l1']);
    expect(v.rectangles[0].layerId).toBeUndefined();
  });

  it('still refuses a layerId that names no layer (E2/RED-03 door)', () => {
    expect(() =>
      assignLayerToItems(
        { layerId: 'ghost', refs: [{ type: 'ITEM', id: 'shared' }] },
        ctx(collidingState())
      )
    ).toThrow(/no such layer/);
  });
});

describe('activeLayerPatch — new elements join the selected layer (LAY-03)', () => {
  it('stamps the active layer when it exists in the view', () => {
    expect(activeLayerPatch('l1', LAYERS)).toEqual({ layerId: 'l1' });
  });

  it('stamps nothing when no layer is active — an unlayered diagram stays lean', () => {
    expect(activeLayerPatch(null, LAYERS)).toEqual({});
    expect(activeLayerPatch(undefined, LAYERS)).toEqual({});
  });

  it('refuses a STALE active layer rather than creating a dangling reference', () => {
    // The panel clears `activeLayerId` when its layer goes, but a race (or a
    // page switch) must not be able to stamp an id that names no layer — that
    // is the E2/RED-03 class, which `assignLayerToItems` already refuses
    // through its own door.
    expect(activeLayerPatch('deleted-layer', LAYERS)).toEqual({});
    expect(activeLayerPatch('l1', [])).toEqual({});
    expect(activeLayerPatch('l1', undefined)).toEqual({});
  });
});
