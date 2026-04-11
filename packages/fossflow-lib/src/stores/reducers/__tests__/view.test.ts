import {
  createView,
  updateView,
  deleteView,
  view as viewReducer
} from '../view';
import { State, ViewReducerContext } from '../types';
import { INITIAL_SCENE_STATE } from 'src/config';

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
  syncConnector: jest.fn((_id: string, ctx: any) => ctx.state)
}));

jest.mock('../textBox', () => ({
  syncTextBox: jest.fn((_id: string, ctx: any) => ctx.state)
}));

const makeView = (id: string, name: string) => ({
  id,
  name,
  items: [],
  connectors: [],
  textBoxes: [],
  rectangles: []
});

const makeState = (views: any[]): State => ({
  model: {
    version: '1.0',
    title: 'Test',
    description: '',
    colors: [],
    icons: [],
    items: [],
    views
  },
  scene: INITIAL_SCENE_STATE as any
});

const makeCtx = (state: State, viewId: string): ViewReducerContext => ({
  state,
  viewId
});

describe('view reducer - createView', () => {
  it('adds a new view with defaults', () => {
    const state = makeState([makeView('view1', 'View 1')]);
    const result = createView({ name: 'Custom Name' }, makeCtx(state, 'view2'));
    expect(result.model.views).toHaveLength(2);
    expect(result.model.views[1].id).toBe('view2');
    expect(result.model.views[1].name).toBe('Custom Name');
  });

  it('uses VIEW_DEFAULTS when no partial provided', () => {
    const state = makeState([makeView('view1', 'View 1')]);
    const result = createView({}, makeCtx(state, 'view2'));
    expect(result.model.views[1].name).toBe('New View');
  });

  it('does not mutate original state', () => {
    const state = makeState([makeView('view1', 'View 1')]);
    createView({}, makeCtx(state, 'view2'));
    expect(state.model.views).toHaveLength(1);
  });
});

describe('view reducer - updateView', () => {
  it('renames a view', () => {
    const state = makeState([makeView('view1', 'Old Name')]);
    const result = updateView({ name: 'New Name' }, makeCtx(state, 'view1'));
    expect(result.model.views[0].name).toBe('New Name');
  });

  it('does not mutate original state', () => {
    const state = makeState([makeView('view1', 'Old Name')]);
    updateView({ name: 'New Name' }, makeCtx(state, 'view1'));
    expect(state.model.views[0].name).toBe('Old Name');
  });

  it('throws when view id does not exist', () => {
    const state = makeState([makeView('view1', 'View 1')]);
    expect(() =>
      updateView({ name: 'X' }, makeCtx(state, 'nonexistent'))
    ).toThrow();
  });
});

describe('view reducer - deleteView', () => {
  it('removes the view with matching id', () => {
    const state = makeState([
      makeView('view1', 'View 1'),
      makeView('view2', 'View 2')
    ]);
    const result = deleteView(makeCtx(state, 'view1'));
    expect(result.model.views).toHaveLength(1);
    expect(result.model.views[0].id).toBe('view2');
  });

  it('does not mutate original state', () => {
    const state = makeState([
      makeView('view1', 'View 1'),
      makeView('view2', 'View 2')
    ]);
    deleteView(makeCtx(state, 'view1'));
    expect(state.model.views).toHaveLength(2);
  });

  it('throws when view id does not exist', () => {
    const state = makeState([makeView('view1', 'View 1')]);
    expect(() => deleteView(makeCtx(state, 'nonexistent'))).toThrow();
  });
});

describe('view reducer - action dispatcher', () => {
  it('handles CREATE_VIEW action', () => {
    const state = makeState([makeView('view1', 'View 1')]);
    const result = viewReducer({
      action: 'CREATE_VIEW',
      payload: { name: 'Page 2' },
      ctx: makeCtx(state, 'view2')
    });
    expect(result.model.views).toHaveLength(2);
    expect(result.model.views[1].name).toBe('Page 2');
  });

  it('handles UPDATE_VIEW action', () => {
    const state = makeState([makeView('view1', 'View 1')]);
    const result = viewReducer({
      action: 'UPDATE_VIEW',
      payload: { name: 'Renamed' },
      ctx: makeCtx(state, 'view1')
    });
    expect(result.model.views[0].name).toBe('Renamed');
  });

  it('handles DELETE_VIEW action', () => {
    const state = makeState([makeView('view1', 'A'), makeView('view2', 'B')]);
    const result = viewReducer({
      action: 'DELETE_VIEW',
      payload: undefined as any,
      ctx: makeCtx(state, 'view1')
    });
    expect(result.model.views).toHaveLength(1);
    expect(result.model.views[0].id).toBe('view2');
  });

  it('throws on unknown action', () => {
    const state = makeState([makeView('view1', 'View 1')]);
    expect(() =>
      viewReducer({
        action: 'INVALID_ACTION' as any,
        payload: {} as any,
        ctx: makeCtx(state, 'view1')
      })
    ).toThrow('Invalid action.');
  });
});
