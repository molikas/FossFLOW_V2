/**
 * Shared T1 harness for area E1 probes (docs/exploratory/areas/E1-history-undo-redo.md).
 *
 * Deliberately mirrors `__perf_refactor_regression__/undo.dualStackSkew.test.tsx`
 * so a probe's result is directly comparable with the D-7 regression suite: same
 * providers, same two-node seed view, same coherence oracle.
 *
 * Not a spec file — `jest.explore.config.js` only matches `*.explore.test.tsx`,
 * so this module is imported, never run.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ModelProvider, useModelStoreApi } from 'src/stores/modelStore';
import { SceneProvider, useSceneStoreApi } from 'src/stores/sceneStore';
import { UiStateProvider, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import { useHistory } from 'src/hooks/useHistory';
import { useLayerActions } from 'src/hooks/useLayerActions';
import { getConnectorPath } from 'src/utils';

export const VIEW_ID = 'view-1';

export const Providers = ({ children }: { children: React.ReactNode }) => (
  <ModelProvider>
    <SceneProvider>
      <UiStateProvider>{children}</UiStateProvider>
    </SceneProvider>
  </ModelProvider>
);

export const useTestHarness = () => ({
  scene: useScene(),
  history: useHistory(),
  layers: useLayerActions(),
  modelApi: useModelStoreApi(),
  sceneApi: useSceneStoreApi(),
  uiStateApi: useUiStateStoreApi()
});

export function seedView() {
  return {
    version: '1.0',
    title: 'Test',
    icons: [{ id: 'block', name: 'Block', url: '', isIsometric: true }],
    colors: [{ id: 'c1', value: '#0066cc' }],
    items: [
      { id: 'node-A', name: 'A', icon: 'block' },
      { id: 'node-B', name: 'B', icon: 'block' }
    ],
    views: [
      {
        id: VIEW_ID,
        name: 'View',
        items: [
          { id: 'node-A', tile: { x: 0, y: 0 } },
          { id: 'node-B', tile: { x: 5, y: 5 } }
        ],
        connectors: [],
        rectangles: [],
        textBoxes: []
      }
    ]
  };
}

export function setup() {
  const { result } = renderHook(useTestHarness, { wrapper: Providers });
  act(() => {
    result.current.uiStateApi.getState().actions.setView(VIEW_ID);
    result.current.modelApi.getState().actions.set(seedView(), true);
    result.current.sceneApi
      .getState()
      .actions.set({ connectors: {}, textBoxes: {} }, true);
    result.current.modelApi.getState().actions.clearHistory();
    result.current.sceneApi.getState().actions.clearHistory();
  });
  return result;
}

export type Harness = ReturnType<typeof setup>;

export function modelView(result: Harness, viewId = VIEW_ID) {
  return result.current.modelApi.getState().views.find((v) => v.id === viewId)!;
}

/**
 * The D-7 / MQA #5 coherence oracle, verbatim from the regression suite: every
 * connector in the active view's model must have a non-stale scene path.
 */
export function expectCoherent(result: Harness) {
  const scene = result.current.sceneApi.getState();
  const view = modelView(result);
  for (const c of view.connectors ?? []) {
    const sceneEntry = scene.connectors[c.id];
    expect(sceneEntry).toBeDefined();
    expect(sceneEntry.path.tiles.length).toBeGreaterThan(0);
    const fresh = getConnectorPath({ anchors: c.anchors, view });
    expect(sceneEntry.path.tiles).toEqual(fresh.tiles);
  }
}

/** Scene connector ids with no backing model connector in the active view (INV-3). */
export function orphanSceneConnectors(result: Harness): string[] {
  const scene = result.current.sceneApi.getState();
  const modelIds = new Set((modelView(result).connectors ?? []).map((c) => c.id));
  return Object.keys(scene.connectors).filter((id) => !modelIds.has(id));
}

/** Model connectors in the active view with no scene path (INV-4). */
export function pathlessModelConnectors(result: Harness): string[] {
  const scene = result.current.sceneApi.getState();
  return (modelView(result).connectors ?? [])
    .filter((c) => !scene.connectors[c.id])
    .map((c) => c.id);
}

/** A both-stores logical action: draw A→B (one drag transaction). */
export function drawConnector(result: Harness, id = 'conn-1') {
  act(() => {
    result.current.scene.beginDragTransaction();
    result.current.scene.createConnector({
      id,
      color: 'c1',
      anchors: [
        { id: `${id}-a1`, ref: { item: 'node-A' } },
        { id: `${id}-a2`, ref: { item: 'node-A' } }
      ]
    });
    result.current.scene.updateConnector(id, {
      anchors: [
        { id: `${id}-a1`, ref: { item: 'node-A' } },
        { id: `${id}-a2`, ref: { item: 'node-B' } }
      ]
    });
    result.current.scene.commitDragTransaction();
  });
}

/** A model-only logical action. */
export function placeIcon(result: Harness, id = 'node-C', tile = { x: 3, y: 3 }) {
  act(() => {
    result.current.scene.placeIcon({
      modelItem: { id, name: id, icon: 'block' },
      viewItem: { id, tile }
    });
  });
}

export function historyDepths(result: Harness) {
  const m = result.current.modelApi.getState().history;
  const s = result.current.sceneApi.getState().history;
  return {
    modelPast: m.past.length,
    modelFuture: m.future.length,
    scenePast: s.past.length,
    sceneFuture: s.future.length
  };
}

export function seqs(result: Harness) {
  const m = result.current.modelApi.getState().history;
  const s = result.current.sceneApi.getState().history;
  return {
    modelPast: m.past.map((e) => e.seq),
    scenePast: s.past.map((e) => e.seq),
    modelFuture: m.future.map((e) => e.seq),
    sceneFuture: s.future.map((e) => e.seq)
  };
}

export { act };
