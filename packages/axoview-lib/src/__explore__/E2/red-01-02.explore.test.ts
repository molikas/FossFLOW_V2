/**
 * E2 probes — RED-01 (the sparse hole deleteModelItem leaves behind) and
 * RED-02 (a pre-existing validation issue poisons every later item update).
 *
 * See docs/exploratory/areas/E2-reducers-cascades.md.
 *
 * `it.failing` marks a CONFIRMED bug repro (APPROACH §6).
 */
import { deleteModelItem } from 'src/stores/reducers/modelItem';
import { view as viewReducer } from 'src/stores/reducers/view';
import { validateView } from 'src/schemas/validation';
import { modelSchema } from 'src/schemas/model';
import { seedState, viewOf, connectorAB, VIEW_ID } from './harness';

// ---------------------------------------------------------------------------
// RED-01 — `delete arr[i]` leaves a hole the rest of the system does not expect
// ---------------------------------------------------------------------------
describe('RED-01 — sparse model.items after deleteModelItem', () => {
  it('characterization: the slot is PRESENT and holds undefined — worse than a sparse hole', () => {
    const state = seedState();
    const after = deleteModelItem('node-A', state);

    expect(after.model.items).toHaveLength(2);
    expect(after.model.items[0]).toBeUndefined();
    // immer's copy materialises the deleted index, so this is NOT a sparse hole
    // that `map`/`forEach`/`filter` would skip — every consumer visits it.
    expect(0 in after.model.items).toBe(true);
  });

  it.failing(
    'BUG: the resulting model no longer validates — the loader would reject the diagram',
    () => {
      const state = seedState();
      // Delete the model item the way useSceneActions.deleteModelItem does.
      const after = deleteModelItem('node-A', state);

      const result = modelSchema.safeParse(after.model);
      expect(result.success).toBe(true);
    }
  );

  it.failing(
    'BUG: JSON round-tripping the model turns the hole into a null entry',
    () => {
      const state = seedState();
      const after = deleteModelItem('node-A', state);

      const roundTripped = JSON.parse(JSON.stringify(after.model));
      expect(roundTripped.items).not.toContain(null);
    }
  );

  it.failing(
    'BUG: validateView THROWS on the hole, so every later node move dies with it',
    () => {
      const state = seedState();
      const after = deleteModelItem('node-A', state);

      // `validateView` line 222 does `ctx.model.items.map(i => i.id)` — the
      // undefined slot makes that a TypeError, not an Issue. Since
      // `updateViewItem` calls validateView on EVERY item update, one
      // deleteModelItem makes the whole view permanently un-editable (RED-02).
      expect(() =>
        validateView(viewOf(after), { model: after.model })
      ).not.toThrow();
    }
  );

  it('characterization: the throw propagates through UPDATE_VIEWITEM', () => {
    const state = seedState();
    const after = deleteModelItem('node-A', state);

    expect(() =>
      viewReducer({
        action: 'UPDATE_VIEWITEM',
        payload: { id: 'node-B', tile: { x: 6, y: 6 } },
        ctx: { viewId: VIEW_ID, state: after }
      })
    ).toThrow(/Cannot read properties of undefined/);
  });
});

// ---------------------------------------------------------------------------
// RED-02 — one bad entity anywhere in the view blocks every item update
// ---------------------------------------------------------------------------
describe('RED-02 — a pre-existing view issue makes every node move throw', () => {
  it.failing(
    'BUG: moving node-B throws because an UNRELATED rectangle references a missing colour',
    () => {
      const state = seedState({
        view: {
          items: [
            { id: 'node-A', tile: { x: 0, y: 0 } },
            { id: 'node-B', tile: { x: 5, y: 5 } }
          ],
          rectangles: [
            // A rectangle whose colour was removed from the palette — exactly
            // what a hand-edited or partially-migrated file carries.
            {
              id: 'rect-1',
              from: { x: 1, y: 1 },
              to: { x: 2, y: 2 },
              color: 'colour-that-no-longer-exists'
            }
          ]
        }
      });

      // Sanity: the view really is already invalid before we touch anything.
      expect(validateView(viewOf(state), { model: state.model }).length).toBe(1);

      // Moving a node that has nothing to do with the rectangle must still work.
      expect(() =>
        viewReducer({
          action: 'UPDATE_VIEWITEM',
          payload: { id: 'node-B', tile: { x: 6, y: 6 } },
          ctx: { viewId: VIEW_ID, state }
        })
      ).not.toThrow();
    }
  );

  it.failing(
    'BUG: the poisoned view also refuses new nodes — createViewItem funnels through the same check',
    () => {
      const state = seedState({
        view: {
          items: [{ id: 'node-A', tile: { x: 0, y: 0 } }],
          rectangles: [
            {
              id: 'rect-1',
              from: { x: 1, y: 1 },
              to: { x: 2, y: 2 },
              color: 'colour-that-no-longer-exists'
            }
          ]
        }
      });

      expect(() =>
        viewReducer({
          action: 'CREATE_VIEWITEM',
          payload: { id: 'node-B', tile: { x: 7, y: 7 } },
          ctx: { viewId: VIEW_ID, state }
        })
      ).not.toThrow();
    }
  );

  it('control: with a clean view the same move succeeds', () => {
    const state = seedState({ view: { connectors: [connectorAB()] } as never });
    expect(validateView(viewOf(state), { model: state.model })).toEqual([]);
    expect(() =>
      viewReducer({
        action: 'UPDATE_VIEWITEM',
        payload: { id: 'node-B', tile: { x: 6, y: 6 } },
        ctx: { viewId: VIEW_ID, state }
      })
    ).not.toThrow();
  });
});
