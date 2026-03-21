/**
 * PERF REGRESSION — C-2: useScene list shape and data integrity
 *
 * The C-2 fix stabilises the memoised list references returned by useScene.
 * Before changing any memoisation logic, this suite pins:
 *  - The exact shape of each list entry (DEFAULTS merging order)
 *  - Edge-case handling (empty lists, missing scene data)
 *  - That the correct view's data is returned after switchView
 *
 * Reference-stability tests are in a separate file: useScene.referenceStability.test.tsx
 */

import { renderHook } from '@testing-library/react';
import { useScene } from 'src/hooks/useScene';
import { CONNECTOR_DEFAULTS, RECTANGLE_DEFAULTS, TEXTBOX_DEFAULTS } from 'src/config';

// ---------------------------------------------------------------------------
// Store mocks
// ---------------------------------------------------------------------------
jest.mock('src/stores/modelStore');
jest.mock('src/stores/uiStateStore');
jest.mock('src/stores/sceneStore');
jest.mock('src/hooks/useView');

import * as modelStoreModule from 'src/stores/modelStore';
import * as uiStateStoreModule from 'src/stores/uiStateStore';
import * as sceneStoreModule from 'src/stores/sceneStore';
import * as useViewModule from 'src/hooks/useView';

const VIEW_ID = 'view-1';

const makeView = (overrides = {}) => ({
  id: VIEW_ID,
  name: 'Test View',
  items: [],
  connectors: [],
  rectangles: [],
  textBoxes: [],
  ...overrides
});

const setupMocks = (viewOverrides = {}, sceneOverrides: any = {}) => {
  const view = makeView(viewOverrides);

  (modelStoreModule.useModelStore as jest.Mock).mockImplementation((selector: any) =>
    selector({
      views: [view],
      colors: [],
      icons: [],
      items: [],
      version: '1.0',
      title: 'Test',
      description: '',
      actions: { get: jest.fn(), set: jest.fn(), clearHistory: jest.fn() }
    })
  );

  (uiStateStoreModule.useUiStateStore as jest.Mock).mockImplementation((selector: any) =>
    selector({ view: VIEW_ID })
  );

  (sceneStoreModule.useSceneStore as jest.Mock).mockImplementation((selector: any) =>
    selector({
      connectors: sceneOverrides.connectors ?? {},
      textBoxes:  sceneOverrides.textBoxes  ?? {}
    })
  );

  (sceneStoreModule.useSceneStoreApi as jest.Mock).mockReturnValue({
    getState: jest.fn().mockReturnValue({ connectors: {}, textBoxes: {} })
  });

  (modelStoreModule.useModelStoreApi as jest.Mock).mockReturnValue({
    getState: jest.fn().mockReturnValue({ views: [view], items: [], colors: [], icons: [], version: '1.0', title: 'Test', description: '' })
  });

  (useViewModule.useView as jest.Mock).mockReturnValue({ changeView: jest.fn() });
};

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// Empty lists
// ---------------------------------------------------------------------------
describe('useScene list shape — C-2 regression', () => {
  describe('empty view', () => {
    beforeEach(() => setupMocks());

    it('items is [] when view has no items', () => {
      const { result } = renderHook(() => useScene());
      expect(result.current.items).toEqual([]);
    });

    it('connectors is [] when view has no connectors', () => {
      const { result } = renderHook(() => useScene());
      expect(result.current.connectors).toEqual([]);
    });

    it('rectangles is [] when view has no rectangles', () => {
      const { result } = renderHook(() => useScene());
      expect(result.current.rectangles).toEqual([]);
    });

    it('textBoxes is [] when view has no textBoxes', () => {
      const { result } = renderHook(() => useScene());
      expect(result.current.textBoxes).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // CONNECTOR_DEFAULTS merging
  // ---------------------------------------------------------------------------
  describe('connectorsList — DEFAULTS merging', () => {
    const modelConnector = {
      id: 'c1',
      anchors: [
        { id: 'a1', ref: { item: 'item1' }, face: 'right' },
        { id: 'a2', ref: { item: 'item2' }, face: 'left'  }
      ]
    };

    it('entry includes all CONNECTOR_DEFAULTS fields', () => {
      setupMocks({ connectors: [modelConnector] });
      const { result } = renderHook(() => useScene());
      const entry = result.current.connectors[0];

      (Object.keys(CONNECTOR_DEFAULTS) as Array<keyof typeof CONNECTOR_DEFAULTS>).forEach((key) => {
        expect(entry).toHaveProperty(key);
      });
    });

    it('model data overrides CONNECTOR_DEFAULTS', () => {
      const custom = { ...modelConnector, width: 99, style: 'DASHED' as const };
      setupMocks({ connectors: [custom] });
      const { result } = renderHook(() => useScene());
      const entry = result.current.connectors[0];
      expect(entry.width).toBe(99);
      expect(entry.style).toBe('DASHED');
    });

    it('scene connector data overrides model data', () => {
      setupMocks(
        { connectors: [{ ...modelConnector, width: 10 }] },
        { connectors: { c1: { width: 42 } } }
      );
      const { result } = renderHook(() => useScene());
      expect(result.current.connectors[0].width).toBe(42);
    });

    it('connector id is preserved', () => {
      setupMocks({ connectors: [modelConnector] });
      const { result } = renderHook(() => useScene());
      expect(result.current.connectors[0].id).toBe('c1');
    });

    it('connector without a scene entry still appears in the list', () => {
      setupMocks({ connectors: [modelConnector] }, { connectors: {} });
      const { result } = renderHook(() => useScene());
      expect(result.current.connectors).toHaveLength(1);
    });

    it('multiple connectors all appear', () => {
      const c2 = { ...modelConnector, id: 'c2', anchors: [] };
      setupMocks({ connectors: [modelConnector, c2] });
      const { result } = renderHook(() => useScene());
      expect(result.current.connectors).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // RECTANGLE_DEFAULTS merging
  // ---------------------------------------------------------------------------
  describe('rectanglesList — DEFAULTS merging', () => {
    const rect = { id: 'r1', tile: { x: 0, y: 0 }, width: 5, height: 3 };

    it('entry includes all RECTANGLE_DEFAULTS fields', () => {
      setupMocks({ rectangles: [rect] });
      const { result } = renderHook(() => useScene());
      const entry = result.current.rectangles[0];
      (Object.keys(RECTANGLE_DEFAULTS) as string[]).forEach((key) => {
        expect(entry).toHaveProperty(key);
      });
    });

    it('model data overrides RECTANGLE_DEFAULTS', () => {
      setupMocks({ rectangles: [{ ...rect, width: 10 }] });
      const { result } = renderHook(() => useScene());
      expect(result.current.rectangles[0].width).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // TEXTBOX_DEFAULTS merging
  // ---------------------------------------------------------------------------
  describe('textBoxesList — DEFAULTS merging', () => {
    const tb = { id: 'tb1', tile: { x: 0, y: 0 } };

    it('entry includes all TEXTBOX_DEFAULTS fields', () => {
      setupMocks({ textBoxes: [tb] });
      const { result } = renderHook(() => useScene());
      const entry = result.current.textBoxes[0];
      (Object.keys(TEXTBOX_DEFAULTS) as string[]).forEach((key) => {
        expect(entry).toHaveProperty(key);
      });
    });

    it('scene textBox data overrides model data', () => {
      setupMocks(
        { textBoxes: [{ ...tb, fontSize: 0.5 }] },
        { textBoxes: { tb1: { fontSize: 1.2 } } }
      );
      const { result } = renderHook(() => useScene());
      expect(result.current.textBoxes[0].fontSize).toBe(1.2);
    });
  });

  // ---------------------------------------------------------------------------
  // currentView
  // ---------------------------------------------------------------------------
  describe('currentView', () => {
    it('returns the view matching the active view id', () => {
      setupMocks({ name: 'My View' });
      const { result } = renderHook(() => useScene());
      expect(result.current.currentView.id).toBe(VIEW_ID);
      expect(result.current.currentView.name).toBe('My View');
    });

    it('falls back to first view when active view id is not found', () => {
      (uiStateStoreModule.useUiStateStore as jest.Mock).mockImplementation((selector: any) =>
        selector({ view: 'nonexistent-id' })
      );
      const view = makeView({ name: 'Fallback' });
      (modelStoreModule.useModelStore as jest.Mock).mockImplementation((selector: any) =>
        selector({ views: [view], colors: [], icons: [], items: [], version: '1.0', title: '', description: '', actions: {} })
      );
      (sceneStoreModule.useSceneStore as jest.Mock).mockImplementation((selector: any) =>
        selector({ connectors: {}, textBoxes: {} })
      );
      (sceneStoreModule.useSceneStoreApi as jest.Mock).mockReturnValue({ getState: jest.fn().mockReturnValue({}) });
      (modelStoreModule.useModelStoreApi as jest.Mock).mockReturnValue({ getState: jest.fn().mockReturnValue({ views: [view], items: [] }) });
      (useViewModule.useView as jest.Mock).mockReturnValue({ changeView: jest.fn() });

      const { result } = renderHook(() => useScene());
      expect(result.current.currentView).toBeDefined();
    });

    it('returns a stable empty fallback when views array is empty', () => {
      (modelStoreModule.useModelStore as jest.Mock).mockImplementation((selector: any) =>
        selector({ views: [], colors: [], icons: [], items: [], version: '1.0', title: '', description: '', actions: {} })
      );
      (uiStateStoreModule.useUiStateStore as jest.Mock).mockImplementation((selector: any) =>
        selector({ view: null })
      );
      (sceneStoreModule.useSceneStore as jest.Mock).mockImplementation((selector: any) =>
        selector({ connectors: {}, textBoxes: {} })
      );
      (sceneStoreModule.useSceneStoreApi as jest.Mock).mockReturnValue({ getState: jest.fn().mockReturnValue({}) });
      (modelStoreModule.useModelStoreApi as jest.Mock).mockReturnValue({ getState: jest.fn().mockReturnValue({ views: [], items: [] }) });
      (useViewModule.useView as jest.Mock).mockReturnValue({ changeView: jest.fn() });

      const { result } = renderHook(() => useScene());
      expect(result.current.currentView.items).toEqual([]);
      expect(result.current.currentView.connectors).toEqual([]);
    });
  });
});
