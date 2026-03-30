/**
 * Branch coverage for view.ts reducer branches not covered by view.test.ts:
 *   - SYNC_SCENE via the dispatcher (skips timestamp update)
 *   - Timestamp is SET after CREATE_VIEW, UPDATE_VIEW (not just content, but presence)
 *   - Timestamp is NOT set for DELETE_VIEW, SYNC_SCENE (they skip updateViewTimestamp)
 *   - updateViewTimestamp sets ISO-format lastUpdated on the target view
 */

import { view as viewReducer, updateViewTimestamp, syncScene } from '../view';
import { State, ViewReducerContext } from '../types';
import { INITIAL_SCENE_STATE } from 'src/config';

// ---------------------------------------------------------------------------
// Mocks (same pattern as view.test.ts)
// ---------------------------------------------------------------------------
jest.mock('src/utils', () => ({
  getItemByIdOrThrow: jest.fn((items: any[], id: string) => {
    const index = items.findIndex((item: any) => item.id === id);
    if (index === -1) throw new Error(`Item with id ${id} not found`);
    return { value: items[index], index };
  }),
  generateId: jest.fn(() => 'generated-id')
}));

jest.mock('src/config', () => ({
  VIEW_DEFAULTS: {
    name: 'New View',
    items: [],
    connectors: [],
    textBoxes: [],
    rectangles: []
  },
  INITIAL_SCENE_STATE: {
    connectors: {},
    textBoxes: {}
  }
}));

jest.mock('../connector', () => ({
  syncConnector: jest.fn((_id: string, ctx: any) => ctx.state),
  createConnector: jest.fn((_payload: any, ctx: any) => ctx.state),
  updateConnector: jest.fn((_payload: any, ctx: any) => ctx.state),
  deleteConnector: jest.fn((_payload: any, ctx: any) => ctx.state)
}));

jest.mock('../textBox', () => ({
  syncTextBox: jest.fn((_id: string, ctx: any) => ctx.state),
  createTextBox: jest.fn((_payload: any, ctx: any) => ctx.state),
  updateTextBox: jest.fn((_payload: any, ctx: any) => ctx.state),
  deleteTextBox: jest.fn((_payload: any, ctx: any) => ctx.state)
}));

jest.mock('../rectangle', () => ({
  createRectangle: jest.fn((_payload: any, ctx: any) => ctx.state),
  updateRectangle: jest.fn((_payload: any, ctx: any) => ctx.state),
  deleteRectangle: jest.fn((_payload: any, ctx: any) => ctx.state)
}));

jest.mock('../viewItem', () => ({
  createViewItem: jest.fn((_payload: any, ctx: any) => ctx.state),
  updateViewItem: jest.fn((_payload: any, ctx: any) => ctx.state),
  deleteViewItem: jest.fn((_payload: any, ctx: any) => ctx.state)
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeView(id: string, name = 'View') {
  return { id, name, items: [], connectors: [], textBoxes: [], rectangles: [] };
}

function makeState(views: any[]): State {
  return {
    model: { version: '1.0', title: 'T', description: '', colors: [], icons: [], items: [], views },
    scene: INITIAL_SCENE_STATE as any
  };
}

function makeCtx(state: State, viewId: string): ViewReducerContext {
  return { state, viewId };
}

// ---------------------------------------------------------------------------
// updateViewTimestamp — direct function tests
// ---------------------------------------------------------------------------
describe('updateViewTimestamp', () => {
  it('sets an ISO timestamp on the target view', () => {
    const state = makeState([makeView('v1')]);
    const ctx = makeCtx(state, 'v1');

    const before = Date.now();
    const result = updateViewTimestamp(ctx);
    const after = Date.now();

    const lastUpdated = result.model.views[0].lastUpdated;
    expect(lastUpdated).toBeDefined();
    const ts = new Date(lastUpdated as string).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('only updates the target view, not others', () => {
    const state = makeState([makeView('v1'), makeView('v2')]);
    const ctx = makeCtx(state, 'v1');

    const result = updateViewTimestamp(ctx);
    expect(result.model.views[0].lastUpdated).toBeDefined();
    expect(result.model.views[1].lastUpdated).toBeUndefined();
  });

  it('does not mutate the original state', () => {
    const state = makeState([makeView('v1')]);
    updateViewTimestamp(makeCtx(state, 'v1'));
    expect((state.model.views[0] as any).lastUpdated).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Dispatcher — SYNC_SCENE does NOT update timestamp
// ---------------------------------------------------------------------------
describe('view dispatcher — SYNC_SCENE skips timestamp', () => {
  it('handles SYNC_SCENE without throwing', () => {
    const state = makeState([makeView('v1')]);
    const result = viewReducer({
      action: 'SYNC_SCENE',
      payload: undefined as any,
      ctx: makeCtx(state, 'v1')
    });
    // syncScene returns the state without a timestamp update
    expect(result.model).toBeDefined();
  });

  it('SYNC_SCENE result does not have lastUpdated set on the view', () => {
    const state = makeState([makeView('v1')]);
    const result = viewReducer({
      action: 'SYNC_SCENE',
      payload: undefined as any,
      ctx: makeCtx(state, 'v1')
    });
    // SYNC_SCENE skips updateViewTimestamp — lastUpdated must remain unset
    expect((result.model.views[0] as any).lastUpdated).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Dispatcher — DELETE_VIEW does NOT update timestamp
// ---------------------------------------------------------------------------
describe('view dispatcher — DELETE_VIEW skips timestamp', () => {
  it('DELETE_VIEW does not set lastUpdated on remaining views', () => {
    const state = makeState([makeView('v1'), makeView('v2')]);
    const result = viewReducer({
      action: 'DELETE_VIEW',
      payload: undefined as any,
      ctx: makeCtx(state, 'v1')
    });
    expect(result.model.views).toHaveLength(1);
    // The remaining view should NOT have lastUpdated touched
    expect((result.model.views[0] as any).lastUpdated).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Dispatcher — mutating actions DO update timestamp
// ---------------------------------------------------------------------------
describe('view dispatcher — mutating actions set lastUpdated', () => {
  it('CREATE_VIEW result has lastUpdated set on the new view', () => {
    const state = makeState([makeView('v1')]);
    const result = viewReducer({
      action: 'CREATE_VIEW',
      payload: { name: 'Page 2' },
      ctx: makeCtx(state, 'v2') // new view id
    });
    expect(result.model.views).toHaveLength(2);
    const newView = result.model.views[1];
    expect((newView as any).lastUpdated).toBeDefined();
    // Must be a valid ISO 8601 date
    expect(() => new Date((newView as any).lastUpdated).toISOString()).not.toThrow();
  });

  it('UPDATE_VIEW result has lastUpdated set', () => {
    const state = makeState([makeView('v1', 'Old Name')]);
    const result = viewReducer({
      action: 'UPDATE_VIEW',
      payload: { name: 'New Name' },
      ctx: makeCtx(state, 'v1')
    });
    expect((result.model.views[0] as any).lastUpdated).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// syncScene — directly exercises the connector + textBox reduce loops
// ---------------------------------------------------------------------------
describe('syncScene', () => {
  it('handles a view with no connectors or textBoxes', () => {
    const state = makeState([makeView('v1')]);
    const result = syncScene(makeCtx(state, 'v1'));
    expect(result.model).toEqual(state.model);
  });

  it('calls syncConnector for each connector in the view', () => {
    const { syncConnector } = require('../connector');
    (syncConnector as jest.Mock).mockClear();

    const state = makeState([{
      ...makeView('v1'),
      connectors: [
        { id: 'c1', anchors: [], color: 'color-1' },
        { id: 'c2', anchors: [], color: 'color-1' }
      ]
    }]);
    syncScene(makeCtx(state, 'v1'));
    expect(syncConnector).toHaveBeenCalledTimes(2);
  });

  it('calls syncTextBox for each textBox in the view', () => {
    const { syncTextBox } = require('../textBox');
    (syncTextBox as jest.Mock).mockClear();

    const state = makeState([{
      ...makeView('v1'),
      textBoxes: [{ id: 'tb1' }, { id: 'tb2' }]
    }]);
    syncScene(makeCtx(state, 'v1'));
    expect(syncTextBox).toHaveBeenCalledTimes(2);
  });
});
