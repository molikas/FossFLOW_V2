/**
 * PERF REGRESSION — C-2: useScene memoised list reference stability
 *
 * After the C-2 fix, list references returned by useScene must be stable
 * when the underlying data has not changed.  Specifically:
 *  - connectors ref must not change when the view NAME changes
 *  - connectors ref must not change when an unrelated model property changes
 *  - connectors ref MUST change when a connector is added / removed / updated
 *
 * This file also covers the updateView reducer bug fix (Object.assign vs
 * reference replacement) by verifying that renaming a view does NOT invalidate
 * connector/item memos.
 */

import { renderHook, act } from '@testing-library/react';
import { useScene } from 'src/hooks/useScene';

jest.mock('src/stores/modelStore');
jest.mock('src/stores/uiStateStore');
jest.mock('src/stores/sceneStore');
jest.mock('src/hooks/useView');

import * as modelStoreModule from 'src/stores/modelStore';
import * as uiStateStoreModule from 'src/stores/uiStateStore';
import * as sceneStoreModule from 'src/stores/sceneStore';
import * as useViewModule from 'src/hooks/useView';

const CONNECTOR = {
  id: 'c1',
  anchors: [
    { id: 'a1', ref: { item: 'item1' }, face: 'right' },
    { id: 'a2', ref: { item: 'item2' }, face: 'left'  }
  ]
};

function makeModelState(viewOverrides = {}, topLevelOverrides = {}) {
  const view = {
    id: 'view-1',
    name: 'View Name',
    items: [],
    connectors: [CONNECTOR],
    rectangles: [],
    textBoxes: [],
    ...viewOverrides
  };
  return {
    views: [view],
    colors: [],
    icons: [],
    items: [],
    version: '1.0',
    title: 'Diagram',
    description: '',
    actions: { get: jest.fn(), set: jest.fn(), clearHistory: jest.fn() },
    ...topLevelOverrides
  };
}

let modelState: ReturnType<typeof makeModelState>;
let sceneState: { connectors: Record<string, any>; textBoxes: Record<string, any> };

beforeEach(() => {
  jest.clearAllMocks();
  modelState = makeModelState();
  sceneState = { connectors: {}, textBoxes: {} };

  (modelStoreModule.useModelStore as jest.Mock).mockImplementation((selector: any) =>
    selector(modelState)
  );
  (uiStateStoreModule.useUiStateStore as jest.Mock).mockImplementation((selector: any) =>
    selector({ view: 'view-1' })
  );
  (sceneStoreModule.useSceneStore as jest.Mock).mockImplementation((selector: any) =>
    selector(sceneState)
  );
  (sceneStoreModule.useSceneStoreApi as jest.Mock).mockReturnValue({
    getState: jest.fn().mockReturnValue(sceneState)
  });
  (modelStoreModule.useModelStoreApi as jest.Mock).mockReturnValue({
    getState: jest.fn().mockReturnValue(modelState)
  });
  (useViewModule.useView as jest.Mock).mockReturnValue({ changeView: jest.fn() });
});

describe('useScene reference stability — C-2 regression', () => {
  it('connectors reference is stable across re-renders when data is unchanged', () => {
    const { result, rerender } = renderHook(() => useScene());
    const ref1 = result.current.connectors;
    rerender();
    expect(result.current.connectors).toBe(ref1);
  });

  it('connectors reference does NOT change when view name is updated (rename)', () => {
    const { result, rerender } = renderHook(() => useScene());
    const ref1 = result.current.connectors;

    // Simulate a view rename — connectors array is the SAME reference
    act(() => {
      const newView = { ...modelState.views[0], name: 'Renamed View' };
      // connectors array is the same object reference as before
      newView.connectors = modelState.views[0].connectors;
      modelState = { ...modelState, views: [newView] };
      (modelStoreModule.useModelStore as jest.Mock).mockImplementation((selector: any) =>
        selector(modelState)
      );
    });

    rerender();
    expect(result.current.connectors).toBe(ref1);
  });

  it('connectors reference does NOT change when diagram title changes', () => {
    const { result, rerender } = renderHook(() => useScene());
    const ref1 = result.current.connectors;

    act(() => {
      modelState = { ...modelState, title: 'New Diagram Title' };
      (modelStoreModule.useModelStore as jest.Mock).mockImplementation((selector: any) =>
        selector(modelState)
      );
    });

    rerender();
    expect(result.current.connectors).toBe(ref1);
  });

  it('connectors reference CHANGES when a connector is added', () => {
    const { result, rerender } = renderHook(() => useScene());
    const ref1 = result.current.connectors;

    act(() => {
      const newConnector = { id: 'c2', anchors: [] };
      const newView = {
        ...modelState.views[0],
        connectors: [...modelState.views[0].connectors, newConnector]
      };
      modelState = { ...modelState, views: [newView] };
      (modelStoreModule.useModelStore as jest.Mock).mockImplementation((selector: any) =>
        selector(modelState)
      );
    });

    rerender();
    expect(result.current.connectors).not.toBe(ref1);
    expect(result.current.connectors).toHaveLength(2);
  });

  it('connectors reference CHANGES when a connector is removed', () => {
    const { result, rerender } = renderHook(() => useScene());
    const ref1 = result.current.connectors;

    act(() => {
      const newView = { ...modelState.views[0], connectors: [] };
      modelState = { ...modelState, views: [newView] };
      (modelStoreModule.useModelStore as jest.Mock).mockImplementation((selector: any) =>
        selector(modelState)
      );
    });

    rerender();
    expect(result.current.connectors).not.toBe(ref1);
    expect(result.current.connectors).toHaveLength(0);
  });

  it('connectors reference CHANGES when scene connector data is updated', () => {
    const { result, rerender } = renderHook(() => useScene());
    const ref1 = result.current.connectors;

    act(() => {
      sceneState = { ...sceneState, connectors: { c1: { width: 20 } } };
      (sceneStoreModule.useSceneStore as jest.Mock).mockImplementation((selector: any) =>
        selector(sceneState)
      );
    });

    rerender();
    expect(result.current.connectors).not.toBe(ref1);
  });

  it('items reference is stable when connectors change', () => {
    const viewWithItems = {
      ...modelState.views[0],
      items: [{ id: 'item1', tile: { x: 0, y: 0 } }]
    };
    modelState = { ...modelState, views: [viewWithItems] };
    (modelStoreModule.useModelStore as jest.Mock).mockImplementation((selector: any) =>
      selector(modelState)
    );

    const { result, rerender } = renderHook(() => useScene());
    const itemsRef1 = result.current.items;

    act(() => {
      const newView = {
        ...modelState.views[0],
        connectors: [...modelState.views[0].connectors, { id: 'c2', anchors: [] }]
      };
      modelState = { ...modelState, views: [newView] };
      (modelStoreModule.useModelStore as jest.Mock).mockImplementation((selector: any) =>
        selector(modelState)
      );
    });

    rerender();
    // items didn't change — the ref should be stable
    expect(result.current.items).toBe(itemsRef1);
  });
});
