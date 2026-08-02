/**
 * REGRESSION — E1/HIST-03: the two history stacks trim as one.
 *
 * The cap used to be "50 entries, per store, trimmed independently". The stores
 * fill at different rates — a model-only action (place an icon, rename) pushes a
 * model entry and nothing on the scene side — so fifty of those after one
 * both-stores action evicted that action's MODEL half while its SCENE half sat
 * at the bottom of the scene stack. Draining the stacks then stepped the scene
 * half alone: half a logical action reverted, with nothing left that could
 * complete it.
 *
 * `resyncScene` HID this for connectors (it re-routes an orphaned path), which is
 * why the text-box leg below is the load-bearing one — nothing repairs a scene
 * `size`, so the end state was a model text box that renders with no dimensions
 * (INV-5b), permanently.
 *
 * Promoted from `__explore__/E1/hist-02-03.explore.test.tsx`. The probe's first
 * `it.failing` asserted a MECHANISM — that the shared seq must still be present
 * in the model stack, i.e. "retain the pair" — while its own comment allowed
 * either resolution ("evicted together, or neither is"). The fix evicts the pair
 * together, so that assertion could never have flipped. These assert the
 * OUTCOME: what the document looks like after the stacks are drained.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ModelProvider, useModelStoreApi } from 'src/stores/modelStore';
import { SceneProvider, useSceneStoreApi } from 'src/stores/sceneStore';
import { UiStateProvider, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import { useHistory } from 'src/hooks/useHistory';

const VIEW_ID = 'view-1';
const MAX_HISTORY_SIZE = 50;

// jsdom has no canvas 2D context and `getTextBoxDimensions` throws without one,
// so the text-box leg would fail during SETUP rather than on its assertion —
// which would look like the bug it is meant to detect. Same stub as
// `useLayerActions.history.test.tsx`; deliberately not the probe lane's
// `installCanvasStub`, since the main suite must not import from `__explore__`.
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
  modelApi: useModelStoreApi(),
  sceneApi: useSceneStoreApi(),
  uiStateApi: useUiStateStoreApi()
});

type Harness = ReturnType<typeof setup>;

const seedModel = () => ({
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
      name: 'Page 1',
      items: [
        { id: 'node-A', tile: { x: 0, y: 0 } },
        { id: 'node-B', tile: { x: 5, y: 5 } }
      ],
      connectors: [],
      rectangles: [],
      textBoxes: []
    }
  ]
});

function setup() {
  const { result } = renderHook(useTestHarness, { wrapper: Providers });
  act(() => {
    result.current.uiStateApi.getState().actions.setView(VIEW_ID);
    result.current.modelApi.getState().actions.set(seedModel(), true);
    result.current.sceneApi
      .getState()
      .actions.set({ connectors: {}, textBoxes: {} }, true);
    result.current.modelApi.getState().actions.clearHistory();
    result.current.sceneApi.getState().actions.clearHistory();
  });
  return result;
}

const modelView = (r: Harness) =>
  r.current.modelApi.getState().views.find((v) => v.id === VIEW_ID)!;

const pasts = (r: Harness) => ({
  model: r.current.modelApi.getState().history.past,
  scene: r.current.sceneApi.getState().history.past
});

/** A model-only logical action: pushes a model entry, nothing scene-side. */
function placeIcon(r: Harness, id: string, tile: { x: number; y: number }) {
  act(() => {
    r.current.scene.placeIcon({
      modelItem: { id, name: id, icon: 'block' },
      viewItem: { id, tile }
    });
  });
}

/** Drain both stacks the way a user holding Ctrl+Z would. */
function drainUndo(r: Harness, bound = 200) {
  let steps = 0;
  while (r.current.history.canUndo && steps < bound) {
    act(() => {
      r.current.history.undo();
    });
    steps += 1;
  }
  expect(steps).toBeLessThan(bound);
  return steps;
}

describe('HIST-03 — the two stacks retain the same logical actions', () => {
  test('a text box survives the cap WITH its scene size, not without it', () => {
    const r = setup();

    // A both-stores action: the model gets the text box, the scene gets its
    // size. Nothing repairs a missing scene size, so this is the case the
    // connector leg used to mask.
    act(() => {
      r.current.scene.createTextBox({
        id: 'tb-1',
        tile: { x: 1, y: 1 },
        content: 'hello'
      });
    });
    expect(r.current.sceneApi.getState().textBoxes['tb-1']).toBeDefined();

    // Push the model stack past its cap with model-only actions.
    for (let i = 0; i < MAX_HISTORY_SIZE; i += 1) {
      placeIcon(r, `node-${i}`, { x: 10 + i, y: 10 });
    }

    drainUndo(r);

    // The text box's action aged out of BOTH stacks, so the box survives whole.
    // Before the fix its model half was evicted and its scene half was not, so
    // the drain reverted the size alone and left a box that renders as nothing.
    expect(modelView(r).textBoxes ?? []).toHaveLength(1);
    expect(r.current.sceneApi.getState().textBoxes['tb-1']).toBeDefined();
  });

  test('when the model stack is exhausted the scene stack has nothing left over', () => {
    const r = setup();

    act(() => {
      r.current.scene.createTextBox({
        id: 'tb-1',
        tile: { x: 1, y: 1 },
        content: 'hello'
      });
    });
    for (let i = 0; i < MAX_HISTORY_SIZE; i += 1) {
      placeIcon(r, `node-${i}`, { x: 10 + i, y: 10 });
    }

    // CONTROL: the model stack must actually be at its cap, or nothing was ever
    // evicted and the assertion below is vacuous.
    expect(pasts(r).model.length).toBe(MAX_HISTORY_SIZE);

    // Drain the MODEL store on its own. This is the exact shape of the bug: the
    // model half of the text box's action was evicted, so after the model stack
    // runs out the scene stack still had one step to give — and `useHistory`
    // would take it, reverting half an action nothing could complete.
    act(() => {
      const model = r.current.modelApi.getState().actions;
      let guard = 0;
      while (model.canUndo() && guard < 200) {
        model.undo();
        guard += 1;
      }
    });

    expect(r.current.modelApi.getState().actions.canUndo()).toBe(false);
    expect(r.current.sceneApi.getState().actions.canUndo()).toBe(false);

    // Asserted through the store API rather than by reading `history.past`
    // directly: the window is evaluated on read, so a store that has stopped
    // writing keeps the aged-out entry in raw state until its next write or
    // step. `canUndo`/`peek*`/`undo` are the surface that decides what a Ctrl+Z
    // does, and they are what must agree.
  });

  test('the connector case — masked before by resyncScene — is coherent too', () => {
    const r = setup();

    act(() => {
      r.current.scene.beginDragTransaction();
      r.current.scene.createConnector({
        id: 'conn-1',
        color: 'c1',
        anchors: [
          { id: 'conn-1-a1', ref: { item: 'node-A' } },
          { id: 'conn-1-a2', ref: { item: 'node-A' } }
        ]
      });
      r.current.scene.updateConnector('conn-1', {
        anchors: [
          { id: 'conn-1-a1', ref: { item: 'node-A' } },
          { id: 'conn-1-a2', ref: { item: 'node-B' } }
        ]
      });
      r.current.scene.commitDragTransaction();
    });

    for (let i = 0; i < MAX_HISTORY_SIZE; i += 1) {
      placeIcon(r, `node-${i}`, { x: 10 + i, y: 10 });
    }

    drainUndo(r);

    // The connector survives with a real scene path. This passed BEFORE the fix
    // too — `resyncScene` re-routed the orphan — so it is a coherence pin, not
    // the detector. It is here because the two legs together are what say the
    // repair is no longer load-bearing.
    const connectors = modelView(r).connectors ?? [];
    expect(connectors).toHaveLength(1);
    const scenePath =
      r.current.sceneApi.getState().connectors['conn-1']?.path?.tiles ?? [];
    expect(scenePath.length).toBeGreaterThan(0);
  });

  test('the depth cap still holds — neither stack grows past it (HIST-15)', () => {
    const r = setup();

    for (let i = 0; i < MAX_HISTORY_SIZE + 11; i += 1) {
      placeIcon(r, `node-${i}`, { x: 10 + i, y: 10 });
    }

    const { model, scene } = pasts(r);
    expect(model.length).toBe(MAX_HISTORY_SIZE);
    expect(scene.length).toBe(0); // model-only actions record nothing here

    // HIST-15's ruling is unchanged: the cap is silent and the document does not
    // return all the way to its starting state. What changed is only WHICH
    // entries are dropped — the same logical actions on both sides.
    drainUndo(r);
    expect((modelView(r).items ?? []).length).toBeGreaterThan(2);
  });
});
