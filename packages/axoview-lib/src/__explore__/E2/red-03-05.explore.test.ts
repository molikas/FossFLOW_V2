/**
 * E2 probes — the layer-bookkeeping family.
 *
 *  RED-03  nothing validates `layerId` liveness
 *  RED-04  reorderLayers trusts its input list
 *  RED-05  createLayer after deleteLayer collides on `order`
 *
 * See docs/exploratory/areas/E2-reducers-cascades.md.
 */
import { view as viewReducer } from 'src/stores/reducers/view';
import { validateView } from 'src/schemas/validation';
import { modelSchema } from 'src/schemas/model';
import { seedState, viewOf, VIEW_ID } from './harness';
import type { State } from 'src/stores/reducers/types';

const dispatch = (
  state: State,
  action: string,
  payload: unknown
): State =>
  viewReducer({
    action,
    payload,
    ctx: { viewId: VIEW_ID, state }
  } as never);

const layers = (state: State) => viewOf(state).layers ?? [];

const withLayers = (names: string[]) => {
  let state = seedState();
  for (const name of names) state = dispatch(state, 'CREATE_LAYER', { name });
  return state;
};

// ---------------------------------------------------------------------------
// RED-03 — a layerId that names no layer passes every check
// ---------------------------------------------------------------------------
describe('RED-03 — dangling layerId liveness', () => {
  it.failing(
    'BUG: assigning items to a layer id that does not exist is accepted and validates clean',
    () => {
      const state = withLayers(['Layer 1']);

      const assigned = dispatch(state, 'ASSIGN_LAYER_TO_ITEMS', {
        layerId: 'layer-that-does-not-exist',
        itemIds: ['node-A']
      });

      const item = viewOf(assigned).items.find((i) => i.id === 'node-A');
      // Correct: either the reducer refuses the unknown layer, or validation
      // flags the dangling reference. Neither happens.
      expect(item?.layerId).toBeUndefined();
    }
  );

  it.failing(
    'BUG: a dangling layerId survives schema + validateView, so it round-trips through save/load',
    () => {
      const state = withLayers(['Layer 1']);
      const assigned = dispatch(state, 'ASSIGN_LAYER_TO_ITEMS', {
        layerId: 'layer-that-does-not-exist',
        itemIds: ['node-A']
      });

      expect(validateView(viewOf(assigned), { model: assigned.model })).not.toEqual(
        []
      );
      expect(modelSchema.safeParse(assigned.model).success).toBe(false);
    }
  );

  it.failing(
    'BUG: deleting a layer cleans its own refs but nothing cleans refs a paste/import brought in',
    () => {
      // Same shape a cross-page paste or a hand-edited import produces: an item
      // carrying a layerId for a layer that lives on a DIFFERENT view.
      const state = seedState({
        view: {
          items: [
            { id: 'node-A', tile: { x: 0, y: 0 }, layerId: 'layer-from-page-2' },
            { id: 'node-B', tile: { x: 5, y: 5 } }
          ],
          layers: [
            { id: 'layer-local', name: 'Local', visible: true, locked: false, order: 0 }
          ]
        } as never
      });

      expect(validateView(viewOf(state), { model: state.model })).not.toEqual([]);
    }
  );
});

// ---------------------------------------------------------------------------
// RED-04 — reorderLayers trusts its input
// ---------------------------------------------------------------------------
describe('RED-04 — reorderLayers with an imperfect list', () => {
  it('control: a complete, clean list renumbers correctly', () => {
    const state = withLayers(['A', 'B', 'C']);
    const ids = layers(state).map((l) => l.id);
    const after = dispatch(state, 'REORDER_LAYERS', [ids[2], ids[0], ids[1]]);
    expect(layers(after).map((l) => l.order)).toEqual([0, 1, 2]);
    expect(layers(after).map((l) => l.name)).toEqual(['C', 'A', 'B']);
  });

  it.failing(
    'BUG: a PARTIAL list leaves two layers sharing the same order value',
    () => {
      const state = withLayers(['A', 'B', 'C']); // orders 0,1,2
      const ids = layers(state).map((l) => l.id);

      // Only two of the three ids — what a filtered/virtualised panel list, or a
      // drag that started before a concurrent create, would hand over.
      const after = dispatch(state, 'REORDER_LAYERS', [ids[1], ids[2]]);

      const orders = layers(after).map((l) => l.order);
      expect(new Set(orders).size).toBe(orders.length); // no duplicates
    }
  );

  it('characterization: a DUPLICATED id is benign — last index wins, orders stay unique', () => {
    const state = withLayers(['A', 'B', 'C']);
    const ids = layers(state).map((l) => l.id);

    const after = dispatch(state, 'REORDER_LAYERS', [
      ids[0],
      ids[1],
      ids[1],
      ids[2]
    ]);

    const orders = layers(after).map((l) => l.order);
    // B is written twice (1 then 2) and C once (3); no collision results, though
    // the values are no longer 0..n-1. Only the PARTIAL-list case above bites.
    expect(new Set(orders).size).toBe(orders.length);
    expect(layers(after).map((l) => l.name)).toEqual(['A', 'B', 'C']);
  });
});

// ---------------------------------------------------------------------------
// RED-05 — createLayer derives order from length; deleteLayer never renumbers
// ---------------------------------------------------------------------------
describe('RED-05 — order collision after a delete', () => {
  it.failing(
    'BUG: create 3, delete the middle, create 1 → two layers share an order value',
    () => {
      let state = withLayers(['A', 'B', 'C']); // orders 0,1,2
      const ids = layers(state).map((l) => l.id);

      state = dispatch(state, 'DELETE_LAYER', ids[1]); // leaves orders 0 and 2
      expect(layers(state).map((l) => l.order)).toEqual([0, 2]);

      state = dispatch(state, 'CREATE_LAYER', { name: 'D' }); // order = length = 2

      const orders = layers(state).map((l) => l.order);
      expect(new Set(orders).size).toBe(orders.length);
    }
  );

  it('characterization: the collision makes the stacking order of the pair undefined', () => {
    let state = withLayers(['A', 'B', 'C']);
    const ids = layers(state).map((l) => l.id);
    state = dispatch(state, 'DELETE_LAYER', ids[1]);
    state = dispatch(state, 'CREATE_LAYER', { name: 'D' });

    const byOrder = layers(state)
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((l) => ({ name: l.name, order: l.order }));

    expect(byOrder).toEqual([
      { name: 'A', order: 0 },
      { name: 'C', order: 2 },
      { name: 'D', order: 2 }
    ]);
  });
});
