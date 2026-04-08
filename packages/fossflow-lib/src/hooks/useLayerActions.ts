// Layer CRUD actions — mirrors the pattern used in useSceneActions.ts.
// Callers get stable callback references via useCallback.

import { useCallback } from 'react';
import { Layer, ItemReference } from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useSceneStoreApi } from 'src/stores/sceneStore';
import { view as viewReducer } from 'src/stores/reducers/view';
import type { State, ViewReducerParams } from 'src/stores/reducers/types';

const useLayerActions = () => {
  const currentViewId = useUiStateStore((state) => state.view);
  const modelStoreApi = useModelStoreApi();
  const sceneStoreApi = useSceneStoreApi();

  const getState = useCallback((): State => {
    const model = modelStoreApi.getState();
    const scene = sceneStoreApi.getState();
    return {
      model: {
        version: model.version,
        title: model.title,
        description: model.description,
        colors: model.colors,
        icons: model.icons,
        items: model.items,
        views: model.views
      },
      scene: { connectors: scene.connectors, textBoxes: scene.textBoxes }
    };
  }, [modelStoreApi, sceneStoreApi]);

  const commit = useCallback(
    (newState: State) => {
      modelStoreApi.getState().actions.saveToHistory();
      modelStoreApi.getState().actions.set(newState.model, true);
      sceneStoreApi.getState().actions.set(newState.scene, true);
    },
    [modelStoreApi, sceneStoreApi]
  );

  const dispatch = useCallback(
    (action: Omit<ViewReducerParams, 'ctx'>) => {
      if (!currentViewId) return;
      const params: ViewReducerParams = {
        ...(action as ViewReducerParams),
        ctx: { viewId: currentViewId, state: getState() }
      };
      const newState = viewReducer(params);
      commit(newState);
    },
    [currentViewId, getState, commit]
  );

  const createLayer = useCallback(
    (layer: Partial<Layer> & { name: string }) => {
      dispatch({ action: 'CREATE_LAYER', payload: layer });
    },
    [dispatch]
  );

  const updateLayer = useCallback(
    (updates: Partial<Layer> & { id: string }) => {
      dispatch({ action: 'UPDATE_LAYER', payload: updates });
    },
    [dispatch]
  );

  const deleteLayer = useCallback(
    (layerId: string) => {
      dispatch({ action: 'DELETE_LAYER', payload: layerId });
    },
    [dispatch]
  );

  const reorderLayers = useCallback(
    (orderedIds: string[]) => {
      dispatch({ action: 'REORDER_LAYERS', payload: orderedIds });
    },
    [dispatch]
  );

  const assignLayerToItems = useCallback(
    (layerId: string | undefined, items: ItemReference[]) => {
      const itemIds = items.map((i) => i.id);
      dispatch({ action: 'ASSIGN_LAYER_TO_ITEMS', payload: { layerId, itemIds } });
    },
    [dispatch]
  );

  const reorderViewItem = useCallback(
    (id: string, zIndex: number) => {
      dispatch({ action: 'REORDER_VIEWITEM', payload: { id, zIndex } });
    },
    [dispatch]
  );

  return {
    createLayer,
    updateLayer,
    deleteLayer,
    reorderLayers,
    assignLayerToItems,
    reorderViewItem
  };
};

export { useLayerActions };
