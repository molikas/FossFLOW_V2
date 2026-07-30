// All write operations for scene entities plus the transaction machinery.
// The optional `currentState?` parameter has been removed from every action's
// public signature — getState() is transaction-aware and returns the pending
// state automatically while inside a transaction.

import { useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import {
  ModelItem,
  ViewItem,
  View,
  Connector,
  TextBox,
  Label,
  Rectangle,
  ItemReference,
  Coords
} from 'src/types';
import { PastePayload } from 'src/clipboard/clipboard';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useSceneStoreApi } from 'src/stores/sceneStore';
import * as reducers from 'src/stores/reducers';
import type { State } from 'src/stores/reducers/types';
import { validateView } from 'src/schemas/validation';
import { generateId, getConnectorPath } from 'src/utils';
// Deep import (not the barrel) so this stays out of the utils cycle graph.
import { nextPageName } from 'src/utils/pageName';
import { useView } from 'src/hooks/useView';
import { VIEW_DEFAULTS } from 'src/config';
import { allocateHistorySequence } from 'src/stores/historySequence';
import { useTranslation } from 'src/stores/localeStore';

export const useSceneActions = () => {
  const { changeView } = useView();
  const currentViewId = useUiStateStore((state) => state.view);
  // D13 — default page name is localised at creation time (mirrors how
  // LayersPanel applies layersPanel.layerN). The name is stored model data, so
  // it's generated here, at the creation surface, rather than at display.
  const { t } = useTranslation('page');

  const transactionInProgress = useRef(false);
  const pendingStateRef = useRef<State | null>(null);
  // Live-drag transaction: state writes pass through to stores in real time, but
  // history records only one entry (begin → commit). See beginDragTransaction.
  const dragInProgress = useRef(false);

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
    // While a live drag is open, the pre-snapshot was captured at begin; per-tick
    // saves would overwrite it and lose the original starting state.
    if (dragInProgress.current) return;
    // One logical action across both stores — allocate a single shared seq so
    // its model+scene entries stamp the same value (D-7).
    allocateHistorySequence();
    modelStoreApi.getState().actions.saveToHistory();
    sceneStoreApi.getState().actions.saveToHistory();
  }, [modelStoreApi, sceneStoreApi]);

  // -------------------------------------------------------------------------
  // Live drag transactions — for interactions where intermediate updates must
  // be visible (connector drag, anchor reconnect) but only one undo entry
  // should land at the end.
  // -------------------------------------------------------------------------

  const beginDragTransaction = useCallback(() => {
    if (dragInProgress.current) return;
    dragInProgress.current = true;
    // The whole drag is one logical action — allocate a single shared seq so the
    // model+scene commit entries stamp the same value (D-7).
    allocateHistorySequence();
    modelStoreApi.getState().actions.saveToHistory();
    sceneStoreApi.getState().actions.saveToHistory();
    modelStoreApi.getState().actions.freezePendingPre();
    sceneStoreApi.getState().actions.freezePendingPre();
  }, [modelStoreApi, sceneStoreApi]);

  const commitDragTransaction = useCallback(() => {
    if (!dragInProgress.current) return;
    dragInProgress.current = false;
    modelStoreApi.getState().actions.unfreezePendingPre();
    sceneStoreApi.getState().actions.unfreezePendingPre();
    // Empty-update set() consumes pendingPre and pushes one entry covering all
    // intermediate writes since beginDragTransaction.
    modelStoreApi.getState().actions.set({}, true);
    sceneStoreApi.getState().actions.set({}, true);
  }, [modelStoreApi, sceneStoreApi]);

  // -------------------------------------------------------------------------
  // MQA #7 Path 4 — batched, immer-free tile updater for the drag hot path.
  //
  // Why this exists. updateViewItem(id, { tile }) runs `produce(state, ...)` over
  // the full state, then if `tile` is in updates it recursively dispatches
  // UPDATE_CONNECTOR for every connector touching the item, each of which runs
  // its own `produce`, each of which calls `syncConnector`, which runs YET
  // another `produce`. For 6 dragged items × ~3 connectors that's ~50 nested
  // immer-clones per drag frame — the dominant cliff fuel after Path 2.
  //
  // This action collapses N item updates + their connector path recomputes
  // into ONE structural copy + direct getConnectorPath() calls. No immer.
  //
  // DRAG ONLY. Caller must be inside an open beginDragTransaction (so history
  // is suppressed). Does not validate the resulting view — that runs on the
  // mouseup commit path through the normal reducer.
  // -------------------------------------------------------------------------

  const batchUpdateViewItemTiles = useCallback(
    // `offset` (ADR 0023) rides the same drag commit: present (incl. cleared to
    // undefined when re-snapping) on every touched item so the off-grid residual
    // and the integer tile stay in lockstep.
    (updates: { id: string; tile: Coords; offset?: Coords }[]) => {
      if (!currentViewId || updates.length === 0) return;

      const state = getState();
      const viewIndex = state.model.views.findIndex(
        (v) => v.id === currentViewId
      );
      if (viewIndex === -1) return;
      const view = state.model.views[viewIndex];

      const updateMap = new Map(updates.map((u) => [u.id, u]));

      // Structural copy of items array — only touched items get new refs.
      const newItems = (view.items ?? []).map((item) => {
        const u = updateMap.get(item.id);
        return u ? { ...item, tile: u.tile, offset: u.offset } : item;
      });

      const newView: View = { ...view, items: newItems };
      const newViews = state.model.views.slice();
      newViews[viewIndex] = newView;

      // Recompute paths for connectors anchored to any moved item. Connector
      // model is unchanged — anchors reference by id, not by tile.
      const updatedIds = new Set(updates.map((u) => u.id));
      const newSceneConnectors = { ...state.scene.connectors };
      for (const c of view.connectors ?? []) {
        const touches = c.anchors.some(
          (a) =>
            a.ref &&
            typeof (a.ref as { item?: string }).item === 'string' &&
            updatedIds.has((a.ref as { item: string }).item)
        );
        if (!touches) continue;
        try {
          const path = getConnectorPath({
            anchors: c.anchors,
            view: newView
          });
          newSceneConnectors[c.id] = { path };
        } catch {
          newSceneConnectors[c.id] = {
            path: {
              tiles: [],
              rectangle: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }
            },
            unroutable: true
          };
        }
      }

      const newState: State = {
        model: { ...state.model, views: newViews },
        scene: { ...state.scene, connectors: newSceneConnectors }
      };

      setState(newState);
    },
    [currentViewId, getState, setState]
  );

  // -------------------------------------------------------------------------
  // Rectangle / textbox drag hot path — immer-free per-frame move updater.
  //
  // Why this exists. Moving a rectangle/textbox via DRAG_ITEMS used to call
  // updateRectangle/updateTextBox per tile, each running `produce(state, ...)`
  // over the FULL model+scene graph. Even inside a drag transaction (history
  // frozen), that full-state immer clone every frame is the GC fuel behind the
  // sustained-drag fps cliff (rectangle/textbox move dropped to ~7 fps).
  //
  // These collapse a move into ONE structural array copy of the active view's
  // rectangles/textBoxes — no immer, no scene touch (a move is model-only;
  // textbox scene size only changes on content/fontSize edits). Mirrors
  // batchUpdateViewItemTiles. DRAG ONLY (caller inside beginDragTransaction);
  // the per-frame writes accumulate into the single commit-on-mouseup entry.
  // -------------------------------------------------------------------------

  const batchUpdateRectangles = useCallback(
    (updates: { id: string; from: Coords; to: Coords; offset?: Coords }[]) => {
      if (!currentViewId || updates.length === 0) return;

      const state = getState();
      const viewIndex = state.model.views.findIndex(
        (v) => v.id === currentViewId
      );
      if (viewIndex === -1) return;
      const view = state.model.views[viewIndex];
      if (!view.rectangles || view.rectangles.length === 0) return;

      const updateMap = new Map(updates.map((u) => [u.id, u]));
      const newRectangles = view.rectangles.map((r) => {
        const u = updateMap.get(r.id);
        return u ? { ...r, from: u.from, to: u.to, offset: u.offset } : r;
      });

      const newView: View = { ...view, rectangles: newRectangles };
      const newViews = state.model.views.slice();
      newViews[viewIndex] = newView;

      // Rectangles are model-only — scene is untouched.
      setState({
        model: { ...state.model, views: newViews },
        scene: state.scene
      });
    },
    [currentViewId, getState, setState]
  );

  const batchUpdateTextBoxTiles = useCallback(
    (updates: { id: string; tile: Coords; offset?: Coords }[]) => {
      if (!currentViewId || updates.length === 0) return;

      const state = getState();
      const viewIndex = state.model.views.findIndex(
        (v) => v.id === currentViewId
      );
      if (viewIndex === -1) return;
      const view = state.model.views[viewIndex];
      if (!view.textBoxes || view.textBoxes.length === 0) return;

      const updateMap = new Map(updates.map((u) => [u.id, u]));
      const newTextBoxes = view.textBoxes.map((t) => {
        const u = updateMap.get(t.id);
        return u ? { ...t, tile: u.tile, offset: u.offset } : t;
      });

      const newView: View = { ...view, textBoxes: newTextBoxes };
      const newViews = state.model.views.slice();
      newViews[viewIndex] = newView;

      // A move is model-only — textbox scene size only changes on content edits.
      setState({
        model: { ...state.model, views: newViews },
        scene: state.scene
      });
    },
    [currentViewId, getState, setState]
  );

  // Labels (ADR 0031) are model-only — no scene size to touch. Mirrors
  // batchUpdateTextBoxTiles for the DragItems group-move commit.
  const batchUpdateLabelTiles = useCallback(
    (updates: { id: string; tile: Coords; offset?: Coords }[]) => {
      if (!currentViewId || updates.length === 0) return;

      const state = getState();
      const viewIndex = state.model.views.findIndex(
        (v) => v.id === currentViewId
      );
      if (viewIndex === -1) return;
      const view = state.model.views[viewIndex];
      if (!view.labels || view.labels.length === 0) return;

      const updateMap = new Map(updates.map((u) => [u.id, u]));
      const newLabels = view.labels.map((l) => {
        const u = updateMap.get(l.id);
        return u ? { ...l, tile: u.tile, offset: u.offset } : l;
      });

      const newView: View = { ...view, labels: newLabels };
      const newViews = state.model.views.slice();
      newViews[viewIndex] = newView;

      setState({
        model: { ...state.model, views: newViews },
        scene: state.scene
      });
    },
    [currentViewId, getState, setState]
  );

  // -------------------------------------------------------------------------
  // EXPERIMENTAL — Path 4-true. Connector path preview without touching the
  // model. Used by DragItems during CSS-preview drag: items move via CSS
  // variables (no model write), connectors need their SVG path data refreshed
  // so they visually follow. We compute paths against a synthetic view that
  // overlays preview tiles onto the real items, and write only the resulting
  // scene.connectors[].path entries — no immer, no model touch.
  // -------------------------------------------------------------------------

  const previewConnectorPaths = useCallback(
    (
      previewTiles: Map<string, Coords>,
      previewAnchorTiles?: Map<string, Coords>
    ) => {
      const hasItemPreviews = previewTiles.size > 0;
      const hasAnchorPreviews =
        previewAnchorTiles !== undefined && previewAnchorTiles.size > 0;
      if (!currentViewId || (!hasItemPreviews && !hasAnchorPreviews)) return;

      const state = getState();
      const view = state.model.views.find((v) => v.id === currentViewId);
      if (!view) return;

      // A connector is "affected" if it references any moved item OR if any
      // of its own anchors has a preview tile override (waypoint drag).
      const affectedConnectors = (view.connectors ?? []).filter((c) => {
        const touchesMovedItem = c.anchors.some(
          (a) =>
            a.ref &&
            typeof (a.ref as { item?: string }).item === 'string' &&
            previewTiles.has((a.ref as { item: string }).item)
        );
        if (touchesMovedItem) return true;
        if (!hasAnchorPreviews) return false;
        return c.anchors.some((a) => previewAnchorTiles!.has(a.id));
      });
      if (affectedConnectors.length === 0) return;

      // Synthetic view: items overlaid with preview tiles. Connector anchors
      // get their refs swapped to free-floating tile refs when in the anchor
      // preview map, so getAnchorTile reads our overridden tile.
      const syntheticItems = (view.items ?? []).map((item) =>
        previewTiles.has(item.id)
          ? { ...item, tile: previewTiles.get(item.id)! }
          : item
      );
      const syntheticConnectors = hasAnchorPreviews
        ? (view.connectors ?? []).map((c) => ({
            ...c,
            anchors: c.anchors.map((a) =>
              previewAnchorTiles!.has(a.id)
                ? { ...a, ref: { tile: previewAnchorTiles!.get(a.id)! } }
                : a
            )
          }))
        : view.connectors;
      const syntheticView: View = {
        ...view,
        items: syntheticItems,
        connectors: syntheticConnectors
      };

      const currentSceneConnectors = sceneStoreApi.getState().connectors;
      const nextSceneConnectors = { ...currentSceneConnectors };
      for (const c of affectedConnectors) {
        // Use synthetic anchors (with anchor-tile overrides applied) for the
        // path computation so the route honors the preview waypoint position.
        const syntheticC = hasAnchorPreviews
          ? syntheticConnectors!.find((sc) => sc.id === c.id) ?? c
          : c;
        try {
          const path = getConnectorPath({
            anchors: syntheticC.anchors,
            view: syntheticView
          });
          nextSceneConnectors[c.id] = { path };
        } catch {
          nextSceneConnectors[c.id] = {
            path: {
              tiles: [],
              rectangle: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }
            },
            unroutable: true
          };
        }
      }

      // flushSync — Connector subscribers re-render inside the same mousemove
      // handler that mutated CSS variables on the Nodes; otherwise the
      // connector visually lags one frame behind the nodes.
      flushSync(() => {
        sceneStoreApi
          .getState()
          .actions.set({ connectors: nextSceneConnectors }, true);
      });
    },
    [currentViewId, getState, sceneStoreApi]
  );

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
  // Label CRUD (ADR 0031) — model-only; no scene sync (the Canvas2D LabelsCanvas
  // and the DOM LabelHitLayer self-measure the chip, like node labels).
  // -------------------------------------------------------------------------

  const createLabel = useCallback(
    (newLabel: Label) => {
      if (!currentViewId) return;
      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'CREATE_LABEL',
        payload: newLabel,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  const updateLabel = useCallback(
    (id: string, updates: Partial<Label>) => {
      if (!currentViewId) return getState();
      if (!transactionInProgress.current) saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'UPDATE_LABEL',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
      return newState;
    },
    [getState, setState, currentViewId, saveToHistoryBeforeChange]
  );

  const deleteLabel = useCallback(
    (id: string) => {
      if (!currentViewId) return;
      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'DELETE_LABEL',
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
          // D13 — interpolate {count} via i18n, never concatenate. The number
          // comes from the highest existing suffix, not from `views.length`:
          // deleting a page in the middle used to make the next one duplicate a
          // name already on screen (E3/SCN-13).
          name:
            newViewPartial?.name ??
            nextPageName(
              t('pageName'),
              views.map((v) => v.name)
            )
        },
        ctx: { viewId: newViewId, state: getState() }
      });
      setState(newState);
      changeView(newViewId, newState.model);
    },
    [getState, setState, modelStoreApi, changeView, t]
  );

  const deleteView = useCallback(
    (viewId: string) => {
      const views = modelStoreApi.getState().views;
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
      modelStoreApi
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
        const existingLabels = new Set(
          (liveView?.labels ?? []).map((l) => l.id)
        );

        // Track connectors being deleted so we can skip anchor splices on
        // them (the connector is going away — splicing its anchors first is
        // pointless and risks ordering issues against the cascade).
        const deletingConnectorIds = new Set<string>();

        selectedItems.forEach((ref) => {
          if (ref.type === 'CONNECTOR' && existingConnectors.has(ref.id)) {
            deletingConnectorIds.add(ref.id);
            deleteConnector(ref.id);
          } else if (ref.type === 'TEXTBOX' && existingTextBoxes.has(ref.id)) {
            deleteTextBox(ref.id);
          } else if (ref.type === 'LABEL' && existingLabels.has(ref.id)) {
            deleteLabel(ref.id);
          } else if (
            ref.type === 'RECTANGLE' &&
            existingRectangles.has(ref.id)
          ) {
            deleteRectangle(ref.id);
          }
        });

        // Free-floating waypoint anchors — splice from each parent connector.
        // Group by parent so we issue one updateConnector per connector rather
        // than per anchor. Skip anchors whose parent connector is also being
        // deleted in this same transaction. ADR-0006.
        const anchorIdsToRemove = selectedItems
          .filter((ref) => ref.type === 'CONNECTOR_ANCHOR')
          .map((ref) => ref.id);

        if (anchorIdsToRemove.length > 0) {
          // Re-read the view AFTER the connector deletes above so the live
          // anchor lists reflect any cascaded changes from this transaction.
          const viewAfter = getState().model.views.find(
            (v) => v.id === currentViewId
          );
          const removeSet = new Set(anchorIdsToRemove);
          for (const connector of viewAfter?.connectors ?? []) {
            if (deletingConnectorIds.has(connector.id)) continue;
            if (!connector.anchors?.some((a) => removeSet.has(a.id))) continue;
            const nextAnchors = connector.anchors.filter(
              (a) => !removeSet.has(a.id)
            );
            // Defensive guard: any CONNECTOR_ANCHOR ref that REACHES the splice
            // here targets a middle waypoint, so the splice should always leave
            // >= 2 anchors. Lasso can now capture a free-floating ENDPOINT
            // anchor for movement (getConnectorMovementAnchorRefs, ADR 0006
            // addendum #2), but only alongside its parent CONNECTOR — and that
            // connector is in `deletingConnectorIds`, so the loop above skips it
            // and we never splice its endpoint. If a future selection path ever
            // violates that (a partial selection capturing an endpoint without
            // its connector — Lasso/FreehandLasso did, before the 2026-05-25
            // fix), cascade-delete the connector instead of leaving it with <2
            // anchors — a 1-anchor connector throws "Connector needs at least
            // two anchors" in isoMath and blocks placeIcon (regression caught
            // 2026-05-25).
            if (nextAnchors.length < 2) {
              deleteConnector(connector.id);
            } else {
              updateConnector(connector.id, { anchors: nextAnchors });
            }
          }
        }
      });
    },
    [
      currentViewId,
      transaction,
      deleteViewItem,
      deleteConnector,
      deleteTextBox,
      deleteLabel,
      deleteRectangle,
      updateConnector,
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

  // Bulk paste — ONE structural assembly of the N-scale arrays, validated once.
  //
  // The old body ran a synchronous per-item create loop: each pasted node did
  // createModelItem + createViewItem (≈2 full-state immer produce()s) and each
  // createViewItem ended in validateView(entireView). validateView was O(N·M)
  // (linear getItemByIdOrThrow per view item), so running it once per insert
  // summed to O(N^3) — the freeze. This collapses the whole paste into a single
  // structural build (concat/slice/spread — no immer, no per-item reducer) and
  // ONE validateView call: O(N + C). PASTE-2 / PASTE-3.
  //
  // Stays inside transaction() so the paste is exactly one history entry (one
  // model.set + one scene.set at commit). computePathsAsync still routes
  // connectors on rAF batches after the structural write lands.
  const pasteItems = useCallback(
    (
      payload: PastePayload,
      onPathProgress?: (done: number, total: number) => void
    ) => {
      if (!currentViewId) return;

      const viewId = currentViewId;
      let applied = false;

      transaction(() => {
        const state = getState();
        const viewIdx = state.model.views.findIndex((v) => v.id === viewId);

        if (viewIdx !== -1) {
          const view = state.model.views[viewIdx];

          // Build plain (non-frozen) arrays — concat/slice/map return fresh
          // arrays, so we never mutate the immer-frozen store state.
          const newModelItems = state.model.items.concat(
            payload.items.map((ci) => ci.modelItem)
          );
          // Pasted view items prepend — matches the old createViewItem unshift.
          const newViewItems = payload.items
            .map((ci) => ci.viewItem)
            .concat(view.items ?? []);
          // Connectors prepend — matches the old createConnector unshift.
          const newViewConnectors = payload.connectors.concat(
            view.connectors ?? []
          );
          // Provisional empty paths — matches createConnector(skipPathfinding);
          // computePathsAsync fills them in after commit.
          const newSceneConnectors = { ...state.scene.connectors };
          for (const c of payload.connectors) {
            newSceneConnectors[c.id] = {
              path: {
                tiles: [],
                rectangle: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }
              }
            };
          }

          const newView: View = {
            ...view,
            items: newViewItems,
            connectors: newViewConnectors,
            // Matches updateViewTimestamp (ISO string, not a numeric stamp).
            lastUpdated: new Date().toISOString()
          };
          const newViews = state.model.views.slice();
          newViews[viewIdx] = newView;

          const newState: State = {
            model: { ...state.model, items: newModelItems, views: newViews },
            scene: { ...state.scene, connectors: newSceneConnectors }
          };

          // Validate ONCE (O(N + M) with the Set fix in validation.ts). Paste is
          // atomic: if the assembled view is invalid — which should not happen
          // with an internally-consistent remapped payload (fresh ids, remapped
          // refs) — abort the WHOLE paste (no items, connectors, rectangles,
          // text boxes, or path routing) rather than committing a partial paste.
          // Warn-and-skip instead of throw, since this runs in a startTransition
          // callback.
          const issues = validateView(newView, { model: newState.model });
          if (issues.length > 0) {
            console.warn(
              '[axoview] paste produced an invalid view; skipping',
              issues[0]
            );
          } else {
            setState(newState);
            // Rectangles / text boxes are not N-scale — keep the existing
            // reducers (they layer on top of the pending state set above). Run
            // them only on a valid paste so the operation stays all-or-nothing.
            [...payload.rectangles].reverse().forEach((r) => createRectangle(r));
            payload.textBoxes.forEach((tb) => createTextBox(tb));
            (payload.labels ?? []).forEach((l) => createLabel(l));
            applied = true;
          }
        }
      });

      // Route connectors only if the paste actually committed.
      if (applied) {
        computePathsAsync(
          payload.connectors.map((c) => c.id),
          onPathProgress
        );
      }
    },
    [
      currentViewId,
      transaction,
      getState,
      setState,
      computePathsAsync,
      createRectangle,
      createTextBox,
      createLabel
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
    createLabel,
    updateLabel,
    deleteLabel,
    createRectangle,
    updateRectangle,
    deleteRectangle,
    deleteSelectedItems,
    pasteItems,
    transaction,
    beginDragTransaction,
    commitDragTransaction,
    batchUpdateViewItemTiles,
    batchUpdateRectangles,
    batchUpdateTextBoxTiles,
    batchUpdateLabelTiles,
    previewConnectorPaths,
    placeIcon,
    switchView,
    createView,
    deleteView,
    updateView
  };
};
