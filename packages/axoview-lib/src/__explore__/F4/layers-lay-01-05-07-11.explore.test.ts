/**
 * F4 / LAY-01, LAY-05, LAY-07, LAY-11 — the layer reducers and the derived
 * layer context, exercised as the real pure functions they are.
 *
 * `resolveRenderOrder` is the shared paint-order key. LAY-01 asks which of the
 * five entity types actually feeds `layer.order` into it — the answer decides
 * whether the Layers panel's reorder means anything for that type.
 */
import { resolveRenderOrder, findLayer } from 'src/utils/renderOrder';
import {
  deleteLayer,
  assignLayerToItems,
  createLayer
} from 'src/stores/reducers/view';
import { seedState, viewOf, VIEW_ID } from 'src/__explore__/E2/harness';
import type { Layer } from 'src/types';

const layer = (id: string, order: number, extra: Partial<Layer> = {}): Layer =>
  ({ id, name: id, visible: true, locked: false, order, ...extra }) as Layer;

// ---------------------------------------------------------------------------
// LAY-01 — which entity types honour layer.order
// ---------------------------------------------------------------------------

describe('LAY-01 — layer order vs paint order, per entity type', () => {
  const layers = [layer('low', 0), layer('high', 1)];

  // Nodes.tsx / NodesCanvas.tsx, verbatim:
  //   resolveRenderOrder(layer?.order ?? 0, n.zIndex ?? 0, -n.tile.x - n.tile.y)
  const nodeKey = (n: {
    layerId?: string;
    zIndex?: number;
    tile: { x: number; y: number };
  }) =>
    resolveRenderOrder(
      findLayer(n.layerId, layers)?.order ?? 0,
      n.zIndex ?? 0,
      -n.tile.x - n.tile.y
    );

  // LabelsCanvas.tsx, verbatim — `layers` is used to FILTER visibility and the
  // sort key is zIndex alone:
  //   sorted = [...filtered].reverse().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  const labelSort = (labels: Array<{ id: string; zIndex?: number }>) =>
    [...labels].reverse().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  it('CONTROL: for NODES the layer order dominates zIndex and tile position', () => {
    const onLow = { layerId: 'low', zIndex: 99, tile: { x: 0, y: 0 } };
    const onHigh = { layerId: 'high', zIndex: 0, tile: { x: 9, y: 9 } };
    // Higher key paints later = on top.
    expect(nodeKey(onHigh)).toBeGreaterThan(nodeKey(onLow));
  });

  it('CONTROL: swapping the two layers\' order swaps the nodes\' paint order', () => {
    const swapped = [layer('low', 1), layer('high', 0)];
    const keyIn = (ls: Layer[], layerId: string) =>
      resolveRenderOrder(findLayer(layerId, ls)?.order ?? 0, 0, 0);
    expect(keyIn(layers, 'high')).toBeGreaterThan(keyIn(layers, 'low'));
    expect(keyIn(swapped, 'high')).toBeLessThan(keyIn(swapped, 'low'));
  });

  it('LAY-01: floating Labels sort by zIndex ALONE — the same order whichever layer they are on', () => {
    const a = { id: 'a', layerId: 'low', zIndex: 0 };
    const b = { id: 'b', layerId: 'high', zIndex: 0 };
    const before = labelSort([a, b]).map((l) => l.id);
    // Reassigning them to the opposite layers cannot change the sort — the
    // comparator never reads layerId.
    const after = labelSort([
      { ...a, layerId: 'high' },
      { ...b, layerId: 'low' }
    ]).map((l) => l.id);
    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// LAY-05 — deleting a hidden layer
// ---------------------------------------------------------------------------

describe('LAY-05 — deleting a HIDDEN layer', () => {
  const seeded = () => {
    const state = seedState({
      view: {
        layers: [layer('hidden-layer', 0, { visible: false })],
        items: [
          { id: 'node-A', tile: { x: 0, y: 0 }, layerId: 'hidden-layer' },
          { id: 'node-B', tile: { x: 5, y: 5 } }
        ]
      } as never
    });
    return state;
  };

  it('PRECONDITION: the seeded node really is on a layer whose `visible` is false', () => {
    const view = viewOf(seeded());
    expect(view.layers?.[0]).toMatchObject({ id: 'hidden-layer', visible: false });
    expect(view.items[0].layerId).toBe('hidden-layer');
  });

  it('LAY-05: deleting the layer unassigns its entities, which makes them VISIBLE again', () => {
    const next = deleteLayer('hidden-layer', {
      viewId: VIEW_ID,
      state: seeded()
    });
    const view = viewOf(next);
    expect(view.layers).toEqual([]);
    // The node survives with no layerId…
    expect(view.items[0].layerId).toBeUndefined();
    // …and `useLayerContext`'s rule is `baseVisible = !layer || layer.visible`,
    // so an unassigned entity is unconditionally visible. Deleting a hidden
    // layer therefore REVEALS everything it was hiding.
    const baseVisible = (layerId: string | undefined) => {
      const l = view.layers?.find((x) => x.id === layerId);
      return !l || l.visible;
    };
    expect(baseVisible(view.items[0].layerId)).toBe(true);
  });

  it('CONTROL: before the delete the same rule reports it hidden', () => {
    const view = viewOf(seeded());
    const l = view.layers?.find((x) => x.id === view.items[0].layerId);
    expect(!l || l.visible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LAY-07 — an entity whose layerId names no layer
// ---------------------------------------------------------------------------

describe('LAY-07 — a dangling layerId (RED-03) in the Layers panel', () => {
  it('the panel buckets it under "unassigned" rather than losing it', () => {
    // useLayerContext: `key = entity.layerId && layerById.has(entity.layerId)
    //                        ? entity.layerId : UNASSIGNED`
    const layerById = new Map<string, Layer>([['real', layer('real', 0)]]);
    const bucket = (layerId?: string) =>
      layerId && layerById.has(layerId) ? layerId : '__unassigned__';
    expect(bucket('real')).toBe('real');
    expect(bucket('ghost-layer')).toBe('__unassigned__');
    expect(bucket(undefined)).toBe('__unassigned__');
  });

  it('and it is visible, because `!layer || layer.visible` is true when no layer resolves', () => {
    const layerById = new Map<string, Layer>([
      ['hidden', layer('hidden', 0, { visible: false })]
    ]);
    const baseVisible = (layerId?: string) => {
      const l = layerId ? layerById.get(layerId) : undefined;
      return !l || l.visible;
    };
    expect(baseVisible('hidden')).toBe(false);
    expect(baseVisible('ghost-layer')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LAY-11 — assignLayerToItems matches by bare id
// ---------------------------------------------------------------------------

describe('LAY-11 — assignLayerToItems ignores the entity type', () => {
  const seeded = () =>
    seedState({
      view: {
        layers: [layer('L1', 0)],
        items: [{ id: 'shared-id', tile: { x: 0, y: 0 } }],
        rectangles: [
          { id: 'shared-id', from: { x: 2, y: 2 }, to: { x: 3, y: 3 } }
        ]
      } as never
    });

  it('PRECONDITION: a duplicate id across two collections loads (CLIP-01 — nothing enforces uniqueness)', () => {
    const view = viewOf(seeded());
    expect(view.items[0].id).toBe('shared-id');
    expect(view.rectangles![0].id).toBe('shared-id');
  });

  it('LAY-11: assigning "the node" also moves the rectangle — the reducer takes ids, not references', () => {
    const next = assignLayerToItems(
      { layerId: 'L1', itemIds: ['shared-id'] },
      { viewId: VIEW_ID, state: seeded() }
    );
    const view = viewOf(next);
    expect(view.items[0].layerId).toBe('L1');
    expect(view.rectangles![0].layerId).toBe('L1');
  });

  it('CHARACTERIZATION: it also accepts a layerId that names no layer (RED-03 through a second door)', () => {
    const next = assignLayerToItems(
      { layerId: 'no-such-layer', itemIds: ['node-A'] },
      { viewId: VIEW_ID, state: seedState({ view: { layers: [] } as never }) }
    );
    expect(viewOf(next).items[0].layerId).toBe('no-such-layer');
  });
});

// ---------------------------------------------------------------------------
// Layer order collision after a delete — the RED-04/05 amplifier, re-confirmed
// here because the Layers panel is its only real caller.
// ---------------------------------------------------------------------------

describe('LAY-01b — createLayer after deleteLayer (known: RED-04/05)', () => {
  it('CHARACTERIZATION: the new layer collides with the survivor, so paint order between them is undefined', () => {
    let state = seedState({
      view: { layers: [layer('A', 0), layer('B', 1)] } as never
    });
    state = deleteLayer('A', { viewId: VIEW_ID, state });
    state = createLayer({ name: 'C' }, { viewId: VIEW_ID, state });
    const orders = viewOf(state).layers!.map((l) => l.order);
    // B kept order 1; C got `layers.length` === 1.
    expect(orders).toEqual([1, 1]);
  });
});
