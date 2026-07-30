/**
 * E2 probes — the layer-bookkeeping family.
 *
 *  RED-03  nothing validates `layerId` liveness — PARTIALLY FIXED: the write
 *          site (`ASSIGN_LAYER_TO_ITEMS`) now refuses an unknown layer id, so
 *          the first probe below throws rather than asserting. What remains is
 *          the IMPORT/PASTE half: a dangling ref arriving in a loaded file is
 *          still accepted by schema + validateView, and closing that needs the
 *          reject-vs-repair ruling (see the wave 1 notes in the tactical).
 *
 * RED-04 and RED-05 were fixed (layer `order` is normalised after every
 * mutation) and their probes promoted to
 * `src/schemas/__tests__/modelIdentity.contract.test.ts`.
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
// RED-04 and RED-05 were fixed (layer `order` is normalised after every
// mutation) and their probes promoted to
// `src/schemas/__tests__/modelIdentity.contract.test.ts`.

// ---------------------------------------------------------------------------
// RED-05 — createLayer derives order from length; deleteLayer never renumbers
