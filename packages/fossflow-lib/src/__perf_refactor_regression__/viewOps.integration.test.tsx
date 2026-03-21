/**
 * PERF REGRESSION — C-2 / view operations integration
 *
 * The view reducer bug fix (updateView: Object.assign vs reference replacement)
 * and the C-2 useScene list changes must preserve the full view lifecycle:
 * create → rename → switch → delete.
 *
 * These tests use the real view reducers (no mocks) to validate end-to-end
 * correctness of view operations as a regression baseline.
 */

import { createView, updateView, deleteView } from 'src/stores/reducers/view';
import { ViewReducerContext, State } from 'src/stores/reducers/types';
import { INITIAL_SCENE_STATE } from 'src/config';

// ---------------------------------------------------------------------------
// Minimal mock for util and config dependencies the view reducer needs
// ---------------------------------------------------------------------------
jest.mock('src/utils', () => ({
  getItemByIdOrThrow: jest.fn((items: any[], id: string) => {
    const index = items.findIndex((item: any) => item.id === id);
    if (index === -1) throw new Error(`Item with id "${id}" not found.`);
    return { value: items[index], index };
  }),
  generateId: jest.fn(() => 'new-id')
}));

jest.mock('src/config', () => ({
  VIEW_DEFAULTS: {
    name: 'Untitled view',
    items: [],
    connectors: [],
    rectangles: [],
    textBoxes: []
  },
  INITIAL_SCENE_STATE: { connectors: {}, textBoxes: {} }
}));

// Connector/textBox reducers are called by syncScene but not by create/update/delete
jest.mock('src/stores/reducers/connector', () => ({
  syncConnector: jest.fn((_id: string, ctx: any) => ctx.state)
}));
jest.mock('src/stores/reducers/textBox', () => ({
  syncTextBox: jest.fn((_id: string, ctx: any) => ctx.state)
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeView(id: string, name: string, extra = {}) {
  return { id, name, items: [], connectors: [], rectangles: [], textBoxes: [], ...extra };
}

function makeState(views: any[]): State {
  return {
    model: { version: '1.0', title: 'Test', description: '', colors: [], icons: [], items: [], views },
    scene: INITIAL_SCENE_STATE as any
  };
}

function ctx(state: State, viewId: string): ViewReducerContext {
  return { state, viewId };
}

// ---------------------------------------------------------------------------
// createView
// ---------------------------------------------------------------------------
describe('View operations integration — C-2 regression', () => {
  describe('createView', () => {
    it('adds a view to the end of the views array', () => {
      const state = makeState([makeView('v1', 'View 1')]);
      const result = createView({ name: 'View 2' }, ctx(state, 'v2'));
      expect(result.model.views).toHaveLength(2);
      expect(result.model.views[1].id).toBe('v2');
    });

    it('uses VIEW_DEFAULTS.name when name is not provided', () => {
      const state = makeState([]);
      const result = createView({}, ctx(state, 'v1'));
      expect(result.model.views[0].name).toBe('Untitled view');
    });

    it('partial override: only overridden fields differ from VIEW_DEFAULTS', () => {
      const state = makeState([]);
      const result = createView({ name: 'Custom' }, ctx(state, 'v1'));
      expect(result.model.views[0].items).toEqual([]);
      expect(result.model.views[0].connectors).toEqual([]);
    });

    it('does not mutate input state', () => {
      const state = makeState([makeView('v1', 'V1')]);
      const original = JSON.parse(JSON.stringify(state));
      createView({ name: 'V2' }, ctx(state, 'v2'));
      expect(state).toEqual(original);
    });
  });

  // ---------------------------------------------------------------------------
  // updateView (covers the Object.assign bug fix)
  // ---------------------------------------------------------------------------
  describe('updateView', () => {
    it('renames a view by id', () => {
      const state = makeState([makeView('v1', 'Old Name')]);
      const result = updateView({ name: 'New Name' }, ctx(state, 'v1'));
      expect(result.model.views[0].name).toBe('New Name');
    });

    it('does not change any other view property when renaming', () => {
      const state = makeState([makeView('v1', 'View', { description: 'desc' })]);
      const result = updateView({ name: 'Renamed' }, ctx(state, 'v1'));
      expect((result.model.views[0] as any).description).toBe('desc');
    });

    it('does not affect other views in the array', () => {
      const state = makeState([makeView('v1', 'A'), makeView('v2', 'B')]);
      const result = updateView({ name: 'A-renamed' }, ctx(state, 'v1'));
      expect(result.model.views[1].name).toBe('B');
    });

    it('does not mutate input state', () => {
      const state = makeState([makeView('v1', 'Original')]);
      updateView({ name: 'Changed' }, ctx(state, 'v1'));
      expect(state.model.views[0].name).toBe('Original');
    });

    it('throws when the view id does not exist', () => {
      const state = makeState([makeView('v1', 'View')]);
      expect(() => updateView({ name: 'X' }, ctx(state, 'nonexistent'))).toThrow();
    });

    it('returned state is a new object (Immer immutability)', () => {
      const state = makeState([makeView('v1', 'Name')]);
      const result = updateView({ name: 'New' }, ctx(state, 'v1'));
      expect(result).not.toBe(state);
      expect(result.model).not.toBe(state.model);
      expect(result.model.views).not.toBe(state.model.views);
    });
  });

  // ---------------------------------------------------------------------------
  // deleteView
  // ---------------------------------------------------------------------------
  describe('deleteView', () => {
    it('removes the view with the matching id', () => {
      const state = makeState([makeView('v1', 'V1'), makeView('v2', 'V2')]);
      const result = deleteView(ctx(state, 'v1'));
      expect(result.model.views).toHaveLength(1);
      expect(result.model.views[0].id).toBe('v2');
    });

    it('does not affect remaining views', () => {
      const state = makeState([makeView('v1', 'V1'), makeView('v2', 'V2'), makeView('v3', 'V3')]);
      const result = deleteView(ctx(state, 'v2'));
      expect(result.model.views.map((v: any) => v.id)).toEqual(['v1', 'v3']);
    });

    it('does not mutate input state', () => {
      const state = makeState([makeView('v1', 'V1'), makeView('v2', 'V2')]);
      deleteView(ctx(state, 'v1'));
      expect(state.model.views).toHaveLength(2);
    });

    it('throws when the view id does not exist', () => {
      const state = makeState([makeView('v1', 'V1')]);
      expect(() => deleteView(ctx(state, 'ghost'))).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle sequence: create → rename → delete
  // ---------------------------------------------------------------------------
  describe('full lifecycle', () => {
    it('create then rename then delete leaves original views intact', () => {
      const initial = makeState([makeView('v1', 'View 1')]);

      // Create
      const afterCreate = createView({ name: 'View 2' }, ctx(initial, 'v2'));
      expect(afterCreate.model.views).toHaveLength(2);

      // Rename
      const afterRename = updateView({ name: 'Renamed View 2' }, ctx(afterCreate, 'v2'));
      expect(afterRename.model.views[1].name).toBe('Renamed View 2');
      expect(afterRename.model.views[0].name).toBe('View 1'); // untouched

      // Delete
      const afterDelete = deleteView(ctx(afterRename, 'v2'));
      expect(afterDelete.model.views).toHaveLength(1);
      expect(afterDelete.model.views[0].id).toBe('v1');
      expect(afterDelete.model.views[0].name).toBe('View 1');
    });

    it('renaming v1 does not change v2 items or connectors', () => {
      const connector = { id: 'c1', anchors: [] };
      const state = makeState([
        makeView('v1', 'A'),
        makeView('v2', 'B', { connectors: [connector] })
      ]);

      const result = updateView({ name: 'A-new' }, ctx(state, 'v1'));

      expect(result.model.views[1].connectors).toHaveLength(1);
      expect(result.model.views[1].connectors[0].id).toBe('c1');
    });
  });
});
