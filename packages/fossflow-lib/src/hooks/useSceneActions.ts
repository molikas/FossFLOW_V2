// All write operations for scene entities plus the transaction machinery.
// The optional `currentState?` parameter has been removed from every action's
// public signature — getState() is transaction-aware and returns the pending
// state automatically while inside a transaction.

import { useCallback, useRef } from 'react';
import {
  ModelItem,
  ViewItem,
  View,
  Connector,
  TextBox,
  Rectangle,
  ItemReference
} from 'src/types';
import { PastePayload } from 'src/clipboard/clipboard';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useSceneStoreApi } from 'src/stores/sceneStore';
import * as reducers from 'src/stores/reducers';
import type { State, ViewReducerContext } from 'src/stores/reducers/types';
import { generateId } from 'src/utils';
import { useView } from 'src/hooks/useView';
import { VIEW_DEFAULTS } from 'src/config';

export const useSceneActions = () => {
  const { changeView } = useView();
  const currentViewId = useUiStateStore((state) => state.view);

  const transactionInProgress = useRef(false);
  const pendingStateRef = useRef<State | null>(null);

  const modelStoreApi = useModelStoreApi();
  const sceneStoreApi = useSceneStoreApi();

  // -------------------------------------------------------------------------
  // Internal transaction utilities
  // -------------------------------------------------------------------------

  const getState = useCallback((): State => {
    if (transactionInProgress.current && pendingStateRef.current) {
      return pendingStateRef.current;
    }
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

  const setState = useCallback(
    (newState: State) => {
      if (transactionInProgress.current) {
        pendingStateRef.current = newState;
        return;
      }
      modelStoreApi.getState().actions.set(newState.model, true);
      sceneStoreApi.getState().actions.set(newState.scene, true);
    },
    [modelStoreApi, sceneStoreApi]
  );

  const saveToHistoryBeforeChange = useCallback(() => {
    if (transactionInProgress.current) return;
    modelStoreApi.getState().actions.saveToHistory();
    sceneStoreApi.getState().actions.saveToHistory();
  }, [modelStoreApi, sceneStoreApi]);

  // -------------------------------------------------------------------------
  // Transaction wrapper — try/finally ensures refs are always cleaned up
  // -------------------------------------------------------------------------

  const transaction = useCallback(
    (operations: () => void) => {
      if (transactionInProgress.current) {
        operations();
        return;
      }

      saveToHistoryBeforeChange();
      pendingStateRef.current = (() => {
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
      })();
      transactionInProgress.current = true;

      try {
        operations();
        if (pendingStateRef.current) {
          modelStoreApi
            .getState()
            .actions.set(pendingStateRef.current.model, true);
          sceneStoreApi
            .getState()
            .actions.set(pendingStateRef.current.scene, true);
        }
      } finally {
        pendingStateRef.current = null;
        transactionInProgress.current = false;
      }
    },
    [saveToHistoryBeforeChange, modelStoreApi, sceneStoreApi]
  );

  // -------------------------------------------------------------------------
  // Model item CRUD
  // -------------------------------------------------------------------------

  const createModelItem = useCallback(
    (newModelItem: ModelItem) => {
      if (!transactionInProgress.current) saveToHistoryBeforeChange();
      const newState = reducers.createModelItem(newModelItem, getState());
      setState(newState);
      return newState;
    },
    [getState, setState, saveToHistoryBeforeChange]
  );

  const updateModelItem = useCallback(
    (id: string, updates: Partial<ModelItem>) => {
      saveToHistoryBeforeChange();
      const newState = reducers.updateModelItem(id, updates, getState());
      setState(newState);
    },
    [getState, setState, saveToHistoryBeforeChange]
  );

  const deleteModelItem = useCallback(
    (id: string) => {
      saveToHistoryBeforeChange();
      const newState = reducers.deleteModelItem(id, getState());
      setState(newState);
    },
    [getState, setState, saveToHistoryBeforeChange]
  );

  // -------------------------------------------------------------------------
  // View item CRUD
  // -------------------------------------------------------------------------

  const createViewItem = useCallback(
    (newViewItem: ViewItem) => {
      if (!currentViewId) return;
      if (!transactionInProgress.current) saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'CREATE_VIEWITEM',
        payload: newViewItem,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
      return newState;
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  const updateViewItem = useCallback(
    (id: string, updates: Partial<ViewItem>) => {
      if (!currentViewId) return getState();
      if (!transactionInProgress.current) saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'UPDATE_VIEWITEM',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
      return newState;
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  const deleteViewItem = useCallback(
    (id: string) => {
      if (!currentViewId) return;
      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'DELETE_VIEWITEM',
        payload: id,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  // -------------------------------------------------------------------------
  // Connector CRUD
  // -------------------------------------------------------------------------

  const createConnector = useCallback(
    (newConnector: Connector) => {
      if (!currentViewId) return;
      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'CREATE_CONNECTOR',
        payload: newConnector,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  const updateConnector = useCallback(
    (id: string, updates: Partial<Connector>) => {
      if (!currentViewId) return;
      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'UPDATE_CONNECTOR',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  const deleteConnector = useCallback(
    (id: string) => {
      if (!currentViewId) return;
      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'DELETE_CONNECTOR',
        payload: id,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  // -------------------------------------------------------------------------
  // TextBox CRUD
  // -------------------------------------------------------------------------

  const createTextBox = useCallback(
    (newTextBox: TextBox) => {
      if (!currentViewId) return;
      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'CREATE_TEXTBOX',
        payload: newTextBox,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  const updateTextBox = useCallback(
    (id: string, updates: Partial<TextBox>) => {
      if (!currentViewId) return getState();
      if (!transactionInProgress.current) saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'UPDATE_TEXTBOX',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
      return newState;
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  const deleteTextBox = useCallback(
    (id: string) => {
      if (!currentViewId) return;
      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'DELETE_TEXTBOX',
        payload: id,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  // -------------------------------------------------------------------------
  // Rectangle CRUD
  // -------------------------------------------------------------------------

  const createRectangle = useCallback(
    (newRectangle: Rectangle) => {
      if (!currentViewId) return;
      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'CREATE_RECTANGLE',
        payload: newRectangle,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  const updateRectangle = useCallback(
    (id: string, updates: Partial<Rectangle>) => {
      if (!currentViewId) return getState();
      if (!transactionInProgress.current) saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'UPDATE_RECTANGLE',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
      return newState;
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  const deleteRectangle = useCallback(
    (id: string) => {
      if (!currentViewId) return;
      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'DELETE_RECTANGLE',
        payload: id,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  // -------------------------------------------------------------------------
  // Compound operations
  // -------------------------------------------------------------------------

  const placeIcon = useCallback(
    (params: { modelItem: ModelItem; viewItem: ViewItem }) => {
      transaction(() => {
        createModelItem(params.modelItem);
        createViewItem(params.viewItem);
      });
    },
    [transaction, createModelItem, createViewItem]
  );

  const switchView = useCallback(
    (viewId: string) => {
      const model = modelStoreApi.getState();
      changeView(viewId, {
        version: model.version,
        title: model.title,
        description: model.description,
        colors: model.colors,
        icons: model.icons,
        items: model.items,
        views: model.views
      });
    },
    [modelStoreApi, changeView]
  );

  const createView = useCallback(
    (newViewPartial?: Partial<View>) => {
      const newViewId = generateId();
      const views = modelStoreApi.getState().views;
      const newState = reducers.view({
        action: 'CREATE_VIEW',
        payload: {
          ...VIEW_DEFAULTS,
          ...newViewPartial,
          name: newViewPartial?.name ?? `Page ${views.length + 1}`
        },
        ctx: { viewId: newViewId, state: getState() }
      });
      setState(newState);
      changeView(newViewId, newState.model);
    },
    [getState, setState, modelStoreApi, changeView]
  );

  const deleteView = useCallback(
    (viewId: string) => {
      const views = modelStoreApi.getState().views;
      const currentView = sceneStoreApi.getState();
      const activViewId = currentViewId;
      if (views.length <= 1) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'DELETE_VIEW',
        payload: undefined,
        ctx: { viewId, state: getState() }
      });
      setState(newState);

      if (viewId === activViewId) {
        const remainingViews = newState.model.views;
        if (remainingViews.length > 0) {
          changeView(remainingViews[0].id, newState.model);
        }
      }
    },
    [
      currentViewId,
      getState,
      setState,
      saveToHistoryBeforeChange,
      changeView,
      modelStoreApi,
      sceneStoreApi
    ]
  );

  const updateView = useCallback(
    (viewId: string, updates: Partial<Pick<View, 'name'>>) => {
      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'UPDATE_VIEW',
        payload: updates,
        ctx: { viewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, saveToHistoryBeforeChange]
  );

  const deleteSelectedItems = useCallback(
    (selectedItems: ItemReference[]) => {
      if (!currentViewId || selectedItems.length === 0) return;

      transaction(() => {
        selectedItems
          .filter((ref) => ref.type === 'ITEM')
          .forEach((ref) => deleteViewItem(ref.id));

        const liveView = getState().model.views.find(
          (v) => v.id === currentViewId
        );
        const existingConnectors = new Set(
          (liveView?.connectors ?? []).map((c) => c.id)
        );
        const existingTextBoxes = new Set(
          (liveView?.textBoxes ?? []).map((t) => t.id)
        );
        const existingRectangles = new Set(
          (liveView?.rectangles ?? []).map((r) => r.id)
        );

        selectedItems.forEach((ref) => {
          if (ref.type === 'CONNECTOR' && existingConnectors.has(ref.id)) {
            deleteConnector(ref.id);
          } else if (ref.type === 'TEXTBOX' && existingTextBoxes.has(ref.id)) {
            deleteTextBox(ref.id);
          } else if (
            ref.type === 'RECTANGLE' &&
            existingRectangles.has(ref.id)
          ) {
            deleteRectangle(ref.id);
          }
        });
      });
    },
    [
      currentViewId,
      transaction,
      deleteViewItem,
      deleteConnector,
      deleteTextBox,
      deleteRectangle,
      getState
    ]
  );

  // -------------------------------------------------------------------------
  // Async connector path computation (for paste)
  // -------------------------------------------------------------------------

  const computePathsAsync = useCallback(
    (
      connectorIds: string[],
      onProgress?: (done: number, total: number) => void
    ) => {
      if (!currentViewId || connectorIds.length === 0) return;

      const BATCH_SIZE = 25;
      const total = connectorIds.length;
      let offset = 0;

      const processNextBatch = () => {
        const batch = connectorIds.slice(offset, offset + BATCH_SIZE);
        if (batch.length === 0) return;
        offset += BATCH_SIZE;

        const sceneState = sceneStoreApi.getState();
        const modelState = modelStoreApi.getState();
        const fullState: State = {
          model: {
            version: modelState.version,
            title: modelState.title,
            description: modelState.description,
            colors: modelState.colors,
            icons: modelState.icons,
            items: modelState.items,
            views: modelState.views
          },
          scene: {
            connectors: sceneState.connectors,
            textBoxes: sceneState.textBoxes
          }
        };

        let currentState = fullState;
        for (const id of batch) {
          try {
            currentState = reducers.syncConnector(id, {
              viewId: currentViewId,
              state: currentState
            });
          } catch {
            // connector may have been deleted before the batch ran
          }
        }
        sceneStoreApi.getState().actions.set(currentState.scene, true);
        onProgress?.(Math.min(offset, total), total);

        if (offset < total) requestAnimationFrame(processNextBatch);
      };

      requestAnimationFrame(processNextBatch);
    },
    [currentViewId, sceneStoreApi, modelStoreApi]
  );

  const pasteItems = useCallback(
    (
      payload: PastePayload,
      onPathProgress?: (done: number, total: number) => void
    ) => {
      if (!currentViewId) return;

      const viewId = currentViewId;

      transaction(() => {
        payload.items.forEach(({ modelItem, viewItem }) => {
          createModelItem(modelItem);
          createViewItem(viewItem);
        });

        payload.connectors.forEach((c) => {
          const ctx: ViewReducerContext = { viewId, state: getState() };
          const newState = reducers.createConnectorReducer(c, ctx, true);
          setState(newState);
        });

        [...payload.rectangles].reverse().forEach((r) => createRectangle(r));
        payload.textBoxes.forEach((tb) => createTextBox(tb));
      });

      computePathsAsync(
        payload.connectors.map((c) => c.id),
        onPathProgress
      );
    },
    [
      currentViewId,
      transaction,
      createModelItem,
      createViewItem,
      getState,
      setState,
      computePathsAsync,
      createRectangle,
      createTextBox
    ]
  );

  return {
    createModelItem,
    updateModelItem,
    deleteModelItem,
    createViewItem,
    updateViewItem,
    deleteViewItem,
    createConnector,
    updateConnector,
    deleteConnector,
    createTextBox,
    updateTextBox,
    deleteTextBox,
    createRectangle,
    updateRectangle,
    deleteRectangle,
    deleteSelectedItems,
    pasteItems,
    transaction,
    placeIcon,
    switchView,
    createView,
    deleteView,
    updateView
  };
};
