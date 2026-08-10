/**
 * Selection/override liveness — the LayerContextProvider invalidation effect.
 *
 * The layer context is the one place that sees every input to "may this ref
 * stay selected": the layer rows, the preview overrides, the entity→layer
 * assignment, and (since the 2026-08-10 mop-up) the entity ids themselves.
 * Its effect is the single subscription between the model and ui-state.
 *
 * - E1/HIST-13: deleting a selected item drops it from `selectedIds` and
 *   `itemControls` — through undo and redo of the delete too (INV-2: every
 *   selection ref resolves to a live entity).
 * - E4/CLIP-08: a model swap (the preserveViewport icon-pack reload) prunes a
 *   selection naming the previous model's ids.
 * - E4/CLIP-09: deleting the solo'd layer clears the preview solo override —
 *   a dead solo id used to blank the whole canvas until a page switch.
 *
 * Promoted from the retired exploratory lane (mop-up wave, 2026-08-10).
 * known_issues: "Deleting a selected item leaves it selected", "A
 * `preserveViewport` reload keeps the previous model's selection", "Deleting
 * a layer leaves it solo'd in the preview overrides".
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ModelProvider, useModelStoreApi } from 'src/stores/modelStore';
import { SceneProvider, useSceneStoreApi } from 'src/stores/sceneStore';
import { UiStateProvider, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { LayerContextProvider } from 'src/hooks/useLayerContext';
import { useScene } from 'src/hooks/useScene';
import { useHistory } from 'src/hooks/useHistory';
import { useLayerActions } from 'src/hooks/useLayerActions';

const VIEW_ID = 'view-1';

const Providers = ({ children }: { children: React.ReactNode }) => (
  <ModelProvider>
    <SceneProvider>
      <UiStateProvider>
        <LayerContextProvider>{children}</LayerContextProvider>
      </UiStateProvider>
    </SceneProvider>
  </ModelProvider>
);

const useHarness = () => ({
  scene: useScene(),
  history: useHistory(),
  layers: useLayerActions(),
  modelApi: useModelStoreApi(),
  sceneApi: useSceneStoreApi(),
  uiStateApi: useUiStateStoreApi()
});

const seedView = () => ({
  version: '1.0',
  title: 'selection liveness',
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
  const { result } = renderHook(useHarness, { wrapper: Providers });
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

const selectedIds = (result: ReturnType<typeof setup>) =>
  result.current.uiStateApi.getState().selectedIds ?? [];

const liveItemIds = (result: ReturnType<typeof setup>) =>
  new Set(
    (result.current.modelApi
      .getState()
      .views.find((v) => v.id === VIEW_ID)!.items ?? []).map((i) => i.id)
  );

/** INV-2: every selection ref resolves to a live entity. */
const expectSelectionCoherent = (result: ReturnType<typeof setup>) => {
  const live = liveItemIds(result);
  for (const ref of selectedIds(result)) {
    expect(live.has(ref.id)).toBe(true);
  }
};

describe('HIST-13 — selection coherence across delete / undo / redo', () => {
  it('deleting a selected item drops it from the selection, and stays coherent through undo and redo', () => {
    const result = setup();

    act(() => {
      result.current.uiStateApi
        .getState()
        .actions.setSelectedIds([{ type: 'ITEM', id: 'node-A' }]);
    });

    act(() => {
      result.current.scene.deleteViewItem('node-A');
    });
    expect(selectedIds(result)).toEqual([]);
    expectSelectionCoherent(result);

    act(() => {
      result.current.history.undo();
    });
    expectSelectionCoherent(result);
    expect(liveItemIds(result).has('node-A')).toBe(true);

    act(() => {
      result.current.history.redo();
    });
    expectSelectionCoherent(result);
    expect(liveItemIds(result).has('node-A')).toBe(false);
  });

  it('a dead itemControls target is cleared too', () => {
    const result = setup();
    act(() => {
      result.current.uiStateApi
        .getState()
        .actions.setItemControls({ type: 'ITEM', id: 'node-A' });
    });
    act(() => {
      result.current.scene.deleteViewItem('node-A');
    });
    expect(result.current.uiStateApi.getState().itemControls).toBeNull();
  });
});

describe('CLIP-08 — a model swap prunes the previous selection', () => {
  it('selection refs naming the old model are dropped on a bare model.set', () => {
    const result = setup();

    act(() => {
      result.current.uiStateApi
        .getState()
        .actions.setSelectedIds([{ type: 'ITEM', id: 'node-A' }]);
    });

    // The icon-pack-swap reload shape: a NEW model under the same view id,
    // with the load path's explicit reset out of the picture.
    act(() => {
      result.current.modelApi.getState().actions.set(
        {
          ...seedView(),
          items: [{ id: 'other-node', name: 'Other', icon: 'block' }],
          views: [
            {
              id: VIEW_ID,
              name: 'Page 1',
              items: [{ id: 'other-node', tile: { x: 1, y: 1 } }],
              connectors: [],
              rectangles: [],
              textBoxes: []
            }
          ]
        } as never,
        true
      );
    });

    const live = liveItemIds(result);
    expect(
      selectedIds(result).filter((s) => !live.has(s.id))
    ).toEqual([]);
  });
});

describe('CLIP-09 — preview overrides follow the layer set', () => {
  it('deleting the solo layer clears the solo override', () => {
    const result = setup();

    act(() => {
      result.current.layers.createLayer({ name: 'Layer 1' });
    });
    const layerId = result.current.modelApi
      .getState()
      .views.find((v) => v.id === VIEW_ID)!.layers![0].id;

    act(() => {
      result.current.uiStateApi.getState().actions.setPreviewSoloLayer(layerId);
    });
    expect(
      result.current.uiStateApi.getState().previewLayerOverrides.soloLayerId
    ).toBe(layerId);

    act(() => {
      result.current.layers.deleteLayer(layerId);
    });

    expect(
      result.current.uiStateApi.getState().previewLayerOverrides.soloLayerId
    ).toBeNull();
  });

  it('a hidden override naming a deleted layer is pruned', () => {
    const result = setup();

    act(() => {
      result.current.layers.createLayer({ name: 'Layer 1' });
    });
    const layerId = result.current.modelApi
      .getState()
      .views.find((v) => v.id === VIEW_ID)!.layers![0].id;

    act(() => {
      result.current.uiStateApi
        .getState()
        .actions.togglePreviewLayerHidden(layerId);
    });
    expect(
      result.current.uiStateApi.getState().previewLayerOverrides.hiddenLayerIds
    ).toContain(layerId);

    act(() => {
      result.current.layers.deleteLayer(layerId);
    });

    expect(
      result.current.uiStateApi.getState().previewLayerOverrides.hiddenLayerIds
    ).not.toContain(layerId);
  });
});
