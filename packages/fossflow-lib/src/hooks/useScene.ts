import { useCallback, useMemo, useRef } from 'react';
import { shallow } from 'zustand/shallow';
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
import { useModelStore, useModelStoreApi } from 'src/stores/modelStore';
import { useSceneStore, useSceneStoreApi } from 'src/stores/sceneStore';
import * as reducers from 'src/stores/reducers';
import type { State, ViewReducerContext } from 'src/stores/reducers/types';
import { generateId, getItemByIdOrThrow } from 'src/utils';
import { useView } from 'src/hooks/useView';
import {
  RECTANGLE_DEFAULTS,
  TEXTBOX_DEFAULTS,
  VIEW_DEFAULTS
} from 'src/config';

export const useScene = () => {
  const { changeView } = useView();
  const { views, colors, icons, items, version, title, description } =
    useModelStore(
      (state) => ({
        views: state.views,
        colors: state.colors,
        icons: state.icons,
        items: state.items,
        version: state.version,
        title: state.title,
        description: state.description
      }),
      shallow
    );
  // NOTE: sceneConnectors is used ONLY for hit-testing and interaction (getItemAtTile, Cursor).
  // Rendering (connectorsList) uses raw view connectors — each <Connector> fetches its own
  // path via useSceneStore. This prevents O(N) re-merge on every async path write (Fix A).
  const { connectors: sceneConnectors, textBoxes: sceneTextBoxes } =
    useSceneStore(
      (state) => ({ connectors: state.connectors, textBoxes: state.textBoxes }),
      shallow
    );
  const currentViewId = useUiStateStore((state) => state.view);
  const transactionInProgress = useRef(false);
  // Accumulated state during a transaction — flushed to the stores in a single write at the end.
  const pendingStateRef = useRef<State | null>(null);

  const modelStoreApi = useModelStoreApi();
  const sceneStoreApi = useSceneStoreApi();

  const currentView = useMemo(() => {
    if (!views || !currentViewId) {
      return {
        id: '',
        name: 'Default View',
        items: [],
        connectors: [],
        rectangles: [],
        textBoxes: []
      };
    }

    try {
      return getItemByIdOrThrow(views, currentViewId).value;
    } catch (error) {
      return (
        views[0] || {
          id: currentViewId,
          name: 'Default View',
          items: [],
          connectors: [],
          rectangles: [],
          textBoxes: []
        }
      );
    }
  }, [currentViewId, views]);

  const itemsList = useMemo(() => {
    return currentView.items ?? [];
  }, [currentView.items]);

  const colorsList = useMemo(() => {
    return colors ?? [];
  }, [colors]);

  // Raw view connectors for RENDERING — no scene path merge here.
  // Each <Connector> subscribes to its own path via useSceneStore (Fix A).
  const connectorsList = useMemo(() => {
    return currentView.connectors ?? [];
  }, [currentView.connectors]);

  // Merged connectors for HIT-TESTING and interaction (getItemAtTile, lasso, etc.).
  // Subscribes to sceneConnectors so interaction always sees current paths.
  const hitConnectorsList = useMemo(() => {
    return (currentView.connectors ?? []).map((connector) => {
      const sceneConnector = sceneConnectors?.[connector.id];
      return { ...connector, ...sceneConnector };
    });
  }, [currentView.connectors, sceneConnectors]);

  const rectanglesList = useMemo(() => {
    return (currentView.rectangles ?? []).map((rectangle) => {
      return {
        ...RECTANGLE_DEFAULTS,
        ...rectangle
      };
    });
  }, [currentView.rectangles]);

  const textBoxesList = useMemo(() => {
    return (currentView.textBoxes ?? []).map((textBox) => {
      const sceneTextBox = sceneTextBoxes?.[textBox.id];

      return {
        ...TEXTBOX_DEFAULTS,
        ...textBox,
        ...sceneTextBox
      };
    });
  }, [currentView.textBoxes, sceneTextBoxes]);

  const getState = useCallback((): State => {
    // Inside a transaction, return the accumulated (not-yet-flushed) state so that
    // each successive operation in the batch sees the results of prior operations.
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
      scene: {
        connectors: scene.connectors,
        textBoxes: scene.textBoxes
      }
    };
  }, [modelStoreApi, sceneStoreApi]);

  const setState = useCallback(
    (newState: State) => {
      // Inside a transaction, buffer into the ref instead of writing to the stores.
      // The transaction flush will push a single combined setState to both stores.
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
    if (transactionInProgress.current) {
      return;
    }

    modelStoreApi.getState().actions.saveToHistory();
    sceneStoreApi.getState().actions.saveToHistory();
  }, [modelStoreApi, sceneStoreApi]);

  const createModelItem = useCallback(
    (newModelItem: ModelItem) => {
      if (!transactionInProgress.current) {
        saveToHistoryBeforeChange();
      }

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

  const createViewItem = useCallback(
    (newViewItem: ViewItem, currentState?: State) => {
      if (!currentViewId) return;

      if (!transactionInProgress.current) {
        saveToHistoryBeforeChange();
      }

      const stateToUse = currentState || getState();

      const newState = reducers.view({
        action: 'CREATE_VIEWITEM',
        payload: newViewItem,
        ctx: { viewId: currentViewId, state: stateToUse }
      });
      setState(newState);
      return newState;
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  const updateViewItem = useCallback(
    (id: string, updates: Partial<ViewItem>, currentState?: State) => {
      if (!currentViewId) return getState();

      if (!transactionInProgress.current) {
        saveToHistoryBeforeChange();
      }

      const stateToUse = currentState || getState();
      const newState = reducers.view({
        action: 'UPDATE_VIEWITEM',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: stateToUse }
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
    (id: string, updates: Partial<TextBox>, currentState?: State) => {
      if (!currentViewId) return currentState || getState();

      if (!transactionInProgress.current) {
        saveToHistoryBeforeChange();
      }

      const stateToUse = currentState || getState();
      const newState = reducers.view({
        action: 'UPDATE_TEXTBOX',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: stateToUse }
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
    (id: string, updates: Partial<Rectangle>, currentState?: State) => {
      if (!currentViewId) return currentState || getState();

      if (!transactionInProgress.current) {
        saveToHistoryBeforeChange();
      }

      const stateToUse = currentState || getState();
      const newState = reducers.view({
        action: 'UPDATE_RECTANGLE',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: stateToUse }
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

  const transaction = useCallback(
    (operations: () => void) => {
      if (transactionInProgress.current) {
        // Already inside a transaction — just run the operations; the outer transaction
        // will handle history save and the single-flush at the end.
        operations();
        return;
      }

      saveToHistoryBeforeChange();
      // Snapshot the current store state into the pending buffer so that getState()
      // inside operations() sees a consistent, accumulated view.
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
          scene: {
            connectors: scene.connectors,
            textBoxes: scene.textBoxes
          }
        };
      })();
      transactionInProgress.current = true;

      try {
        operations();
        // Flush the final accumulated state in a SINGLE write to each store,
        // producing exactly two Zustand setState calls total instead of 2×N.
        if (pendingStateRef.current) {
          modelStoreApi.getState().actions.set(pendingStateRef.current.model, true);
          sceneStoreApi.getState().actions.set(pendingStateRef.current.scene, true);
        }
      } finally {
        pendingStateRef.current = null;
        transactionInProgress.current = false;
      }
    },
    [saveToHistoryBeforeChange, modelStoreApi, sceneStoreApi]
  );

  const placeIcon = useCallback(
    (params: { modelItem: ModelItem; viewItem: ViewItem }) => {
      transaction(() => {
        const stateAfterModelItem = createModelItem(params.modelItem);
        if (stateAfterModelItem) {
          createViewItem(params.viewItem, stateAfterModelItem);
        }
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
      const newState = reducers.view({
        action: 'CREATE_VIEW',
        payload: { ...VIEW_DEFAULTS, ...newViewPartial, name: (newViewPartial?.name) ?? `Page ${views.length + 1}` },
        ctx: { viewId: newViewId, state: getState() }
      });
      setState(newState);

      // Switch to the newly created view
      const model = newState.model;
      changeView(newViewId, model);
    },
    [getState, setState, views, changeView]
  );

  const deleteView = useCallback(
    (viewId: string) => {
      if (views.length <= 1) return; // Cannot delete the last view

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'DELETE_VIEW',
        payload: undefined,
        ctx: { viewId, state: getState() }
      });
      setState(newState);

      // If we deleted the current view, switch to another one
      if (viewId === currentViewId) {
        const remainingViews = newState.model.views;
        if (remainingViews.length > 0) {
          changeView(remainingViews[0].id, newState.model);
        }
      }
    },
    [views, currentViewId, getState, setState, saveToHistoryBeforeChange, changeView]
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
        // Delete nodes first — each cascades to its connected connectors
        selectedItems
          .filter((ref) => ref.type === 'ITEM')
          .forEach((ref) => deleteViewItem(ref.id));

        // After node cascades, check which connectors/textboxes/rectangles still exist
        const liveView = getState().model.views.find((v) => v.id === currentViewId);
        const existingConnectors = new Set((liveView?.connectors ?? []).map((c) => c.id));
        const existingTextBoxes = new Set((liveView?.textBoxes ?? []).map((t) => t.id));
        const existingRectangles = new Set((liveView?.rectangles ?? []).map((r) => r.id));

        selectedItems.forEach((ref) => {
          if (ref.type === 'CONNECTOR' && existingConnectors.has(ref.id)) {
            deleteConnector(ref.id);
          } else if (ref.type === 'TEXTBOX' && existingTextBoxes.has(ref.id)) {
            deleteTextBox(ref.id);
          } else if (ref.type === 'RECTANGLE' && existingRectangles.has(ref.id)) {
            deleteRectangle(ref.id);
          }
        });
      });
    },
    [currentViewId, transaction, deleteViewItem, deleteConnector, deleteTextBox, deleteRectangle, getState]
  );

  // Compute connector paths asynchronously after paste — processes them in rAF batches
  // so the main thread stays responsive while paths are built.
  // Batch size 25: ~87 frames for 2160 connectors (vs. 432 at batch=5).
  // Since each <Connector> subscribes to its own path (Fix A), each sceneStore write
  // only triggers re-renders for that batch of connectors, not all N.
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

        // Read the current scene state directly (getState() may read stale model during a
        // parallel transaction — use sceneStoreApi directly for the scene slice).
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
          scene: { connectors: sceneState.connectors, textBoxes: sceneState.textBoxes }
        };

        let currentState = fullState;
        for (const id of batch) {
          try {
            currentState = reducers.syncConnector(id, { viewId: currentViewId, state: currentState });
          } catch {
            // connector may have been deleted before the batch ran
          }
        }
        // Write only the scene slice — skipHistory=true so no history entry is created.
        sceneStoreApi.getState().actions.set(currentState.scene, true);

        onProgress?.(Math.min(offset, total), total);

        if (offset < total) {
          requestAnimationFrame(processNextBatch);
        }
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

        // Create connectors with provisional empty paths during the transaction
        // so the single batched setState flush is cheap (no A* per connector).
        payload.connectors.forEach((c) => {
          const ctx: ViewReducerContext = { viewId, state: getState() };
          const newState = reducers.createConnectorReducer(c, ctx, /* skipPathfinding */ true);
          setState(newState);
        });

        ;[...payload.rectangles].reverse().forEach((r) => createRectangle(r));
        payload.textBoxes.forEach((tb) => createTextBox(tb));
      });

      // After the transaction flushes to the stores, compute paths asynchronously.
      computePathsAsync(payload.connectors.map((c) => c.id), onPathProgress);
    },
    [currentViewId, transaction, createModelItem, createViewItem, getState, setState, computePathsAsync, createRectangle, createTextBox]
  );

  return {
    items: itemsList,
    connectors: connectorsList,
    // hitConnectors: merged with scene paths — for getItemAtTile, lasso, interaction modes.
    // NOT used for rendering (each <Connector> subscribes to its own path).
    hitConnectors: hitConnectorsList,
    colors: colorsList,
    rectangles: rectanglesList,
    textBoxes: textBoxesList,
    currentView,
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
