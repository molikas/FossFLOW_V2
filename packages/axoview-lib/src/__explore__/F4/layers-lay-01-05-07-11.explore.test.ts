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

// LAY-11 is FIXED and its probes are retired (re-derived 2026-08-02 — one of the
// two stale characterizations the wave-3 note flagged in this file).
//
// The probe called `assignLayerToItems({ layerId, itemIds })` with BARE IDS.
// That signature no longer exists: the reducer takes typed `refs`, which is
// precisely the fix — "the reducer takes ids, not references" was the finding,
// and references are what it takes now. The probe throws on the old shape.
//
// The second characterization ("it also accepts a layerId that names no layer")
// is closed by wave 1's RED-03 layer-reference validation, reached through this
// second door exactly as the note predicted. Promoted regression:
// `stores/reducers/__tests__/layerAssignment.test.ts`.

// ---------------------------------------------------------------------------
// Layer order collision after a delete — the RED-04/05 amplifier, re-confirmed
// here because the Layers panel is its only real caller.
// ---------------------------------------------------------------------------

describe('LAY-01b — createLayer after deleteLayer (known: RED-04/05)', () => {
  // The collision characterization is retired — the OTHER stale one in this
  // file. `normaliseLayerOrder` (wave 4's RED-04/05 fix) renumbers `order` to a
  // permutation of 0..n-1 after every mutation, so a create following a delete
  // can no longer reuse a live value: this sequence now yields [0, 1], not
  // [1, 1]. The invariant is unbreakable by any single call rather than by each
  // call being careful, which is why it closed this through a second door.
  // Promoted regression: `stores/reducers/__tests__/layer.test.ts`.
  it('CHARACTERIZATION: layer order is a permutation after a delete-then-create', () => {
    let state = seedState({
      view: { layers: [layer('A', 0), layer('B', 1)] } as never
    });
    state = deleteLayer('A', { viewId: VIEW_ID, state });
    state = createLayer({ name: 'C' }, { viewId: VIEW_ID, state });
    const orders = viewOf(state).layers!.map((l) => l.order);
    expect(orders).toEqual([0, 1]);
    expect(new Set(orders).size).toBe(orders.length);
  });

});
