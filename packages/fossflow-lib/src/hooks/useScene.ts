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
import type { State } from 'src/stores/reducers/types';
import { generateId, getItemByIdOrThrow } from 'src/utils';
import { useView } from 'src/hooks/useView';
import {
  CONNECTOR_DEFAULTS,
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
  const { connectors: sceneConnectors, textBoxes: sceneTextBoxes } =
    useSceneStore(
      (state) => ({
        connectors: state.connectors,
        textBoxes: state.textBoxes
      }),
      shallow
    );
  const currentViewId = useUiStateStore((state) => state.view);
  const transactionInProgress = useRef(false);

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

  const connectorsList = useMemo(() => {
    return (currentView.connectors ?? []).map((connector) => {
      const sceneConnector = sceneConnectors?.[connector.id];

      return {
        ...CONNECTOR_DEFAULTS,
        ...connector,
        ...sceneConnector
      };
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
        operations();
        return;
      }

      saveToHistoryBeforeChange();
      transactionInProgress.current = true;

      try {
        operations();
      } finally {
        transactionInProgress.current = false;
      }
    },
    [saveToHistoryBeforeChange]
  );

  const placeIcon = useCallback(
    (params: { modelItem: ModelItem; viewItem: ViewItem }) => {
      saveToHistoryBeforeChange();
      transactionInProgress.current = true;

      try {
        const stateAfterModelItem = createModelItem(params.modelItem);

        if (stateAfterModelItem) {
          createViewItem(params.viewItem, stateAfterModelItem);
        }
      } finally {
        transactionInProgress.current = false;
      }
    },
    [createModelItem, createViewItem, saveToHistoryBeforeChange]
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

  const pasteItems = useCallback(
    (payload: PastePayload) => {
      if (!currentViewId) return;

      transaction(() => {
        payload.items.forEach(({ modelItem, viewItem }) => {
          createModelItem(modelItem);
          createViewItem(viewItem);
        });
        payload.connectors.forEach((c) => createConnector(c));
        // Paste in reverse so unshift() preserves the original visual z-order
        ;[...payload.rectangles].reverse().forEach((r) => createRectangle(r));
        payload.textBoxes.forEach((tb) => createTextBox(tb));
      });
    },
    [currentViewId, transaction, createModelItem, createViewItem, createConnector, createRectangle, createTextBox]
  );

  return {
    items: itemsList,
    connectors: connectorsList,
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
