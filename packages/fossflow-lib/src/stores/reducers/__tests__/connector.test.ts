/**
 * Connector reducer tests — using the REAL ConnectorAnchor[] array schema.
 *
 * The previous version of this file used the old {from, to} object format for
 * anchors which no longer matches the real Connector type (anchors: ConnectorAnchor[]).
 * That version was classified as STALE and has been replaced with this rewrite.
 */

import {
  deleteConnector,
  syncConnector,
  updateConnector,
  createConnector
} from '../connector';
import { State, ViewReducerContext } from '../types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
jest.mock('src/utils', () => ({
  getItemByIdOrThrow: jest.fn((items: any[], id: string) => {
    const index = items.findIndex((item: any) => item?.id === id);
    if (index === -1) throw new Error(`Item with id ${id} not found`);
    return { value: items[index], index };
  }),
  getConnectorPath: jest.fn(() => ({
    tiles: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
    rectangle: { from: { x: 0, y: 0 }, to: { x: 2, y: 0 } }
  }))
}));

// ---------------------------------------------------------------------------
// Helpers — use the real ConnectorAnchor[] array format
// ---------------------------------------------------------------------------
function makeAnchor(id: string, itemId?: string) {
  return { id, ref: itemId ? { item: itemId } : { tile: { x: 0, y: 0 } } };
}

function makeConnector(id: string, anchorIds = ['a1', 'a2']) {
  return {
    id,
    anchors: anchorIds.map((aid, i) => makeAnchor(aid, `item${i + 1}`))
  };
}

function makeState(viewConnectors: any[] = [], sceneConnectors: Record<string, any> = {}): State {
  return {
    model: {
      version: '1.0',
      title: 'Test',
      description: '',
      colors: [],
      icons: [],
      items: [],
      views: [{
        id: 'view1',
        name: 'Test View',
        items: [],
        connectors: viewConnectors,
        rectangles: [],
        textBoxes: []
      }]
    },
    scene: { connectors: sceneConnectors, textBoxes: {} }
  } as unknown as State;
}

function ctx(state: State, viewId = 'view1'): ViewReducerContext {
  return { viewId, state };
}

// ---------------------------------------------------------------------------
// deleteConnector
// ---------------------------------------------------------------------------
describe('connector reducer (real ConnectorAnchor[] format)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('deleteConnector', () => {
    it('removes connector from model view', () => {
      const c1 = makeConnector('c1');
      const state = makeState([c1], { c1: { path: { tiles: [], rectangle: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } } } });
      const result = deleteConnector('c1', ctx(state));
      expect(result.model.views[0].connectors).toHaveLength(0);
    });

    it('removes connector from scene', () => {
      const c1 = makeConnector('c1');
      const state = makeState([c1], { c1: { path: { tiles: [], rectangle: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } } } });
      const result = deleteConnector('c1', ctx(state));
      expect(result.scene.connectors['c1']).toBeUndefined();
    });

    it('does not remove other connectors', () => {
      const c1 = makeConnector('c1');
      const c2 = makeConnector('c2');
      const state = makeState([c1, c2], {
        c1: { path: { tiles: [], rectangle: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } } },
        c2: { path: { tiles: [], rectangle: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } } }
      });
      const result = deleteConnector('c1', ctx(state));
      expect(result.model.views[0].connectors).toHaveLength(1);
      expect(result.model.views[0].connectors![0].id).toBe('c2');
      expect(result.scene.connectors['c2']).toBeDefined();
    });

    it('throws when connector not found', () => {
      const state = makeState([]);
      expect(() => deleteConnector('ghost', ctx(state))).toThrow();
    });

    it('throws when view not found', () => {
      const state = makeState([makeConnector('c1')]);
      expect(() => deleteConnector('c1', { viewId: 'nonexistent', state })).toThrow();
    });

    it('does not mutate input state', () => {
      const c1 = makeConnector('c1');
      const state = makeState([c1]);
      const before = JSON.parse(JSON.stringify(state));
      deleteConnector('c1', ctx(state));
      expect(state).toEqual(before);
    });
  });

  // ---------------------------------------------------------------------------
  // syncConnector
  // ---------------------------------------------------------------------------
  describe('syncConnector', () => {
    it('writes computed path to scene', () => {
      const { getConnectorPath } = require('src/utils');
      getConnectorPath.mockReturnValueOnce({
        tiles: [{ x: 0, y: 0 }, { x: 3, y: 3 }],
        rectangle: { from: { x: 0, y: 0 }, to: { x: 3, y: 3 } }
      });

      const state = makeState([makeConnector('c1')]);
      const result = syncConnector('c1', ctx(state));

      expect(result.scene.connectors['c1'].path.tiles).toHaveLength(2);
      expect(result.scene.connectors['c1'].path.rectangle).toEqual({ from: { x: 0, y: 0 }, to: { x: 3, y: 3 } });
    });

    it('stores empty path (never throws) when getConnectorPath throws', () => {
      const { getConnectorPath } = require('src/utils');
      getConnectorPath.mockImplementationOnce(() => { throw new Error('pathfinder error'); });

      const state = makeState([makeConnector('c1')]);
      let result: State | undefined;
      expect(() => { result = syncConnector('c1', ctx(state)); }).not.toThrow();
      expect(result!.scene.connectors['c1'].path).toEqual({
        tiles: [],
        rectangle: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }
      });
    });

    it('connector remains in model after getConnectorPath error', () => {
      const { getConnectorPath } = require('src/utils');
      getConnectorPath.mockImplementationOnce(() => { throw new Error('fail'); });

      const state = makeState([makeConnector('c1')]);
      const result = syncConnector('c1', ctx(state));
      expect(result.model.views[0].connectors).toHaveLength(1);
      expect(result.model.views[0].connectors![0].id).toBe('c1');
    });

    it('throws when connector not found', () => {
      const state = makeState([]);
      expect(() => syncConnector('ghost', ctx(state))).toThrow();
    });

    it('does not mutate input state', () => {
      const state = makeState([makeConnector('c1')]);
      const before = JSON.parse(JSON.stringify(state));
      syncConnector('c1', ctx(state));
      expect(state).toEqual(before);
    });
  });

  // ---------------------------------------------------------------------------
  // updateConnector
  // ---------------------------------------------------------------------------
  describe('updateConnector', () => {
    it('updates non-anchor fields without calling getConnectorPath', () => {
      const { getConnectorPath } = require('src/utils');
      getConnectorPath.mockClear();

      const state = makeState([makeConnector('c1')]);
      const result = updateConnector({ id: 'c1', color: 'red' }, ctx(state));

      expect(result.model.views[0].connectors![0].color).toBe('red');
      expect(getConnectorPath).not.toHaveBeenCalled();
    });

    it('calls syncConnector (getConnectorPath) when anchors are updated', () => {
      const { getConnectorPath } = require('src/utils');
      getConnectorPath.mockClear();

      const state = makeState([makeConnector('c1')]);
      const newAnchors = [makeAnchor('a3', 'item3'), makeAnchor('a4', 'item4')];
      updateConnector({ id: 'c1', anchors: newAnchors }, ctx(state));

      expect(getConnectorPath).toHaveBeenCalled();
    });

    it('preserves untouched fields when partially updating', () => {
      const c1 = { ...makeConnector('c1'), color: 'blue', style: 'SOLID' };
      const state = makeState([c1]);
      const result = updateConnector({ id: 'c1', color: 'red' }, ctx(state));
      expect(result.model.views[0].connectors![0].style).toBe('SOLID');
      expect(result.model.views[0].connectors![0].color).toBe('red');
    });

    it('throws when connector not found', () => {
      const state = makeState([]);
      expect(() => updateConnector({ id: 'ghost', color: 'x' }, ctx(state))).toThrow();
    });

    it('does not mutate input state', () => {
      const state = makeState([makeConnector('c1')]);
      const before = JSON.parse(JSON.stringify(state));
      updateConnector({ id: 'c1', color: 'new' }, ctx(state));
      expect(state).toEqual(before);
    });
  });

  // ---------------------------------------------------------------------------
  // createConnector
  // ---------------------------------------------------------------------------
  describe('createConnector', () => {
    it('inserts new connector at front (unshift)', () => {
      const state = makeState([makeConnector('existing')]);
      const result = createConnector(makeConnector('c-new'), ctx(state));
      expect(result.model.views[0].connectors![0].id).toBe('c-new');
      expect(result.model.views[0].connectors![1].id).toBe('existing');
    });

    it('adds connector scene entry after creation', () => {
      const state = makeState([]);
      const result = createConnector(makeConnector('c1'), ctx(state));
      expect(result.scene.connectors['c1']).toBeDefined();
      expect(result.scene.connectors['c1'].path).toBeDefined();
    });

    it('stores empty path when getConnectorPath throws on creation', () => {
      const { getConnectorPath } = require('src/utils');
      getConnectorPath.mockImplementationOnce(() => { throw new Error('fail'); });

      const state = makeState([]);
      const result = createConnector(makeConnector('c1'), ctx(state));
      expect(result.model.views[0].connectors).toHaveLength(1);
      expect(result.scene.connectors['c1'].path.tiles).toHaveLength(0);
    });

    it('throws when view not found', () => {
      const state = makeState([]);
      expect(() => createConnector(makeConnector('c1'), { viewId: 'nonexistent', state })).toThrow();
    });

    it('does not mutate input state', () => {
      const state = makeState([]);
      const before = JSON.parse(JSON.stringify(state));
      createConnector(makeConnector('c1'), ctx(state));
      expect(state).toEqual(before);
    });
  });
});
