// Layer CRUD actions — mirrors the pattern used in useSceneActions.ts.
// Callers get stable callback references via useCallback.

import { useCallback } from 'react';
import { Layer, ItemReference } from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useSceneStoreApi } from 'src/stores/sceneStore';
import { view as viewReducer } from 'src/stores/reducers/view';
import { allocateHistorySequence } from 'src/stores/historySequence';
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
      // A layer op is one logical action across BOTH stores, so it allocates a
      // shared sequence and arms both snapshots — the same ritual
      // `useSceneActions.saveToHistoryBeforeChange` performs (D-7).
      //
      // E1/HIST-01: without the allocation the model entry was stamped with the
      // PREVIOUS action's seq, and `useHistory.undo` steps every stack whose top
      // entry carries the highest seq — so one Ctrl+Z popped this entry AND the
      // older scene entry belonging to a different action, stranding a text
      // box's scene size or orphaning a scene connector. Without the scene arm,
      // a layer op that does move scene state recorded nothing on the scene
      // stack at all. (A layer op that leaves the scene untouched still records
      // no scene entry — `set()` drops a zero-patch write — which the seq
      // coordination is built to handle.)
      //
      // E1/HIST-10: layers are stored per view, so a layer op is page-scoped by
      // construction (owner sign-off 2026-08-02, §5 Q4) — it stamps the active
      // page like every other coordinated action.
      allocateHistorySequence(currentViewId);
      modelStoreApi.getState().actions.saveToHistory();
      sceneStoreApi.getState().actions.saveToHistory();
      modelStoreApi.getState().actions.set(newState.model, true);
      sceneStoreApi.getState().actions.set(newState.scene, true);
    },
    [currentViewId, modelStoreApi, sceneStoreApi]
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
    (layerId: string, contents: 'unassign' | 'delete' = 'unassign') => {
      // F4/LAY-05 + the E2/RED-13 ruling: the CALLER decides what happens to
      // the layer's contents, because both answers are defensible and doing
      // either one silently is the thing that is not (deleting a hidden layer
      // used to reveal everything it was hiding).
      dispatch({ action: 'DELETE_LAYER', payload: { layerId, contents } });
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
      // F4/LAY-11: the TYPE travels to the reducer. This used to drop it
      // (`items.map(i => i.id)`) and the reducer then applied one id-set filter
      // across all five entity collections, so assigning a node to a layer also
      // moved a rectangle that happened to share the node's id. Cross-collection
      // id uniqueness is not enforced anywhere (E4/CLIP-01 is the filed root),
      // so this was that bug's newest consumer — and the callers had the typed
      // form in their hands the whole time.
      dispatch({
        action: 'ASSIGN_LAYER_TO_ITEMS',
        payload: { layerId, refs: items }
      });
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
