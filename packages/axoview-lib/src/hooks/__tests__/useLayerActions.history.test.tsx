/**
 * Layer ops as history citizens — E1/HIST-01, promoted from the 2026-07
 * exploratory campaign's probe lane (`__explore__/E1/hist-01-04`) with the bug
 * fixed.
 *
 * `useLayerActions.commit()` used to call `modelStore.saveToHistory()` on its
 * own: no `allocateHistorySequence()`, and no scene arm. So a layer op's model
 * entry was stamped with the PREVIOUS action's sequence, and `useHistory.undo`
 * — which steps every stack whose top entry carries the highest seq (D-7) —
 * popped the layer entry together with the older SCENE entry belonging to a
 * different logical action. One Ctrl+Z, two actions reverted.
 *
 * Mirrors `__perf_refactor_regression__/undo.dualStackSkew.test.tsx`: same
 * providers, same two-node seed view, same coherence oracle.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ModelProvider, useModelStoreApi } from 'src/stores/modelStore';
import { SceneProvider, useSceneStoreApi } from 'src/stores/sceneStore';
import { UiStateProvider, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import { useHistory } from 'src/hooks/useHistory';
import { useLayerActions } from 'src/hooks/useLayerActions';

const VIEW_ID = 'view-1';

// jsdom has no canvas 2D context and `getTextBoxDimensions` throws without one,
// so a text-box case would fail during setup rather than on its assertion.
let restoreCanvas: (() => void) | null = null;
beforeAll(() => {
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: unknown;
  };
  const original = proto.getContext;
  proto.getContext = () =>
    ({ measureText: (text: string) => ({ width: text.length * 8 }) }) as unknown;
  restoreCanvas = () => {
    proto.getContext = original;
  };
});
afterAll(() => restoreCanvas?.());

const Providers = ({ children }: { children: React.ReactNode }) => (
  <ModelProvider>
    <SceneProvider>
      <UiStateProvider>{children}</UiStateProvider>
    </SceneProvider>
  </ModelProvider>
);

const useTestHarness = () => ({
  scene: useScene(),
  history: useHistory(),
  layers: useLayerActions(),
  modelApi: useModelStoreApi(),
  sceneApi: useSceneStoreApi(),
  uiStateApi: useUiStateStoreApi()
});

function seedView() {
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

function setup() {
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

type Harness = ReturnType<typeof setup>;

function modelView(result: Harness) {
  return result.current.modelApi.getState().views.find((v) => v.id === VIEW_ID)!;
}

/** A both-stores logical action: draw A→B as one drag transaction. */
function drawConnector(result: Harness, id = 'conn-1') {
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

function historyDepths(result: Harness) {
  const m = result.current.modelApi.getState().history;
  const s = result.current.sceneApi.getState().history;
  return {
    modelPast: m.past.length,
    modelFuture: m.future.length,
    scenePast: s.past.length,
    sceneFuture: s.future.length
  };
}

function seqs(result: Harness) {
  const m = result.current.modelApi.getState().history;
  const s = result.current.sceneApi.getState().history;
  return {
    modelPast: m.past.map((e) => e.seq),
    scenePast: s.past.map((e) => e.seq)
  };
}

describe('a layer op is its own logical action', () => {
  it('allocates a fresh sequence rather than inheriting the previous action’s', () => {
    const result = setup();

    drawConnector(result); // both stores, one logical action → seq N
    const afterDraw = seqs(result);
    expect(afterDraw.modelPast).toHaveLength(1); // precondition
    expect(afterDraw.scenePast).toHaveLength(1);
    expect(afterDraw.modelPast[0]).toBe(afterDraw.scenePast[0]);

    act(() => {
      result.current.layers.createLayer({ name: 'Layer 1' });
    });

    const after = seqs(result);
    expect(after.modelPast).toHaveLength(2);
    expect(after.modelPast[1]).toBeGreaterThan(after.modelPast[0]);
  });

  it('undoes exactly one logical action, leaving the previous scene entry alone', () => {
    const result = setup();

    drawConnector(result);
    act(() => {
      result.current.layers.createLayer({ name: 'Layer 1' });
    });
    expect(historyDepths(result)).toMatchObject({ modelPast: 2, scenePast: 1 });

    act(() => {
      result.current.history.undo();
    });

    // The layer entry popped; the connector's scene entry belongs to the
    // earlier action and stays where it is.
    expect(modelView(result).layers ?? []).toHaveLength(0);
    expect(historyDepths(result)).toMatchObject({ modelPast: 1, scenePast: 1 });
  });

  it('does not strand a text box without its scene size', () => {
    const result = setup();

    // Scene text-box sizes are NOT repaired by `useHistory.resyncScene`, which
    // only re-routes connectors — so an over-eager scene pop is permanent here.
    act(() => {
      result.current.scene.createTextBox({
        id: 'tb-1',
        tile: { x: 1, y: 1 },
        content: 'hello'
      });
    });
    expect(result.current.sceneApi.getState().textBoxes['tb-1']).toBeDefined();

    act(() => {
      result.current.layers.createLayer({ name: 'Layer 1' });
    });
    act(() => {
      result.current.history.undo();
    });

    expect(modelView(result).layers ?? []).toHaveLength(0);
    expect(modelView(result).textBoxes).toHaveLength(1);
    expect(result.current.sceneApi.getState().textBoxes['tb-1']).toBeDefined();
  });

  it('leaves no orphan scene connector when the previous action is undone next', () => {
    const result = setup();

    drawConnector(result);
    act(() => {
      result.current.layers.createLayer({ name: 'Layer 1' });
    });

    act(() => {
      result.current.history.undo(); // the layer op
    });
    act(() => {
      result.current.history.undo(); // the connector draw
    });

    expect(modelView(result).connectors ?? []).toHaveLength(0);
    expect(Object.keys(result.current.sceneApi.getState().connectors)).toEqual([]);
  });
});
