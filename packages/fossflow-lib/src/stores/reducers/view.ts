import { produce } from 'immer';
import {
  View,
  Layer,
  ViewItem,
  Connector,
  Rectangle,
  TextBox
} from 'src/types';
import { getItemByIdOrThrow, generateId } from 'src/utils';
import { VIEW_DEFAULTS, INITIAL_SCENE_STATE } from 'src/config';
import type { ViewReducerContext, State, ViewReducerParams } from './types';
import { syncConnector } from './connector';
import { syncTextBox } from './textBox';
import * as viewItemReducers from './viewItem';
import * as connectorReducers from './connector';
import * as textBoxReducers from './textBox';
import * as rectangleReducers from './rectangle';

export const updateViewTimestamp = (ctx: ViewReducerContext): State => {
  const now = new Date().toISOString();

  const newState = produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId);

    view.value.lastUpdated = now;
  });

  return newState;
};

export const syncScene = ({ viewId, state }: ViewReducerContext): State => {
  const view = getItemByIdOrThrow(state.model.views, viewId);

  const startingState: State = {
    model: state.model,
    scene: INITIAL_SCENE_STATE
  };

  const stateAfterConnectorsSynced = [
    ...(view.value.connectors ?? [])
  ].reduce<State>((acc, connector) => {
    return syncConnector(connector.id, { viewId, state: acc });
  }, startingState);

  const stateAfterTextBoxesSynced = [
    ...(view.value.textBoxes ?? [])
  ].reduce<State>((acc, textBox) => {
    return syncTextBox(textBox.id, { viewId, state: acc });
  }, stateAfterConnectorsSynced);

  return stateAfterTextBoxesSynced;
};

export const deleteView = (ctx: ViewReducerContext): State => {
  const newState = produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId);

    draft.model.views.splice(view.index, 1);
  });

  return newState;
};

export const updateView = (
  updates: Partial<Pick<View, 'name'>>,
  ctx: ViewReducerContext
): State => {
  const newState = produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId);
    Object.assign(view.value, updates);
  });

  return newState;
};

// ---------------------------------------------------------------------------
// Layer reducers
// ---------------------------------------------------------------------------

export const createLayer = (
  layer: Partial<Layer> & { name: string },
  ctx: ViewReducerContext
): State => {
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId);
    if (!view.value.layers) view.value.layers = [];
    const newOrder = view.value.layers.length;
    view.value.layers.push({
      id: generateId(),
      visible: true,
      locked: false,
      order: newOrder,
      ...layer
    });
  });
};

export const updateLayer = (
  updates: Partial<Layer> & { id: string },
  ctx: ViewReducerContext
): State => {
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId);
    if (!view.value.layers) return;
    const idx = view.value.layers.findIndex((l) => l.id === updates.id);
    if (idx === -1) return;
    Object.assign(view.value.layers[idx], updates);
  });
};

export const deleteLayer = (
  layerId: string,
  ctx: ViewReducerContext
): State => {
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId);
    if (!view.value.layers) return;

    view.value.layers = view.value.layers.filter((l) => l.id !== layerId);

    // Unassign layerId from all entities that referenced this layer
    const unassign = (entity: ViewItem | Connector | Rectangle | TextBox) => {
      if (entity.layerId === layerId) delete entity.layerId;
    };
    (view.value.items ?? []).forEach(unassign);
    (view.value.connectors ?? []).forEach(unassign);
    (view.value.rectangles ?? []).forEach(unassign);
    (view.value.textBoxes ?? []).forEach(unassign);
  });
};

export const reorderLayers = (
  orderedIds: string[],
  ctx: ViewReducerContext
): State => {
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId);
    if (!view.value.layers) return;
    orderedIds.forEach((id, index) => {
      const layer = view.value.layers!.find((l) => l.id === id);
      if (layer) layer.order = index;
    });
    view.value.layers.sort((a, b) => a.order - b.order);
  });
};

export const assignLayerToItems = (
  { layerId, itemIds }: { layerId: string | undefined; itemIds: string[] },
  ctx: ViewReducerContext
): State => {
  const idSet = new Set(itemIds);
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId);
    const assign = (entity: ViewItem | Connector | Rectangle | TextBox) => {
      if (!idSet.has(entity.id)) return;
      if (layerId === undefined) {
        delete entity.layerId;
      } else {
        entity.layerId = layerId;
      }
    };
    (view.value.items ?? []).forEach(assign);
    (view.value.connectors ?? []).forEach(assign);
    (view.value.rectangles ?? []).forEach(assign);
    (view.value.textBoxes ?? []).forEach(assign);
  });
};

export const reorderViewItem = (
  { id, zIndex }: { id: string; zIndex: number },
  ctx: ViewReducerContext
): State => {
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId);
    const item = view.value.items.find((i) => i.id === id);
    if (item) item.zIndex = zIndex;
  });
};

export const createView = (
  newView: Partial<View>,
  ctx: ViewReducerContext
): State => {
  const newState = produce(ctx.state, (draft) => {
    draft.model.views.push({
      ...VIEW_DEFAULTS,
      id: ctx.viewId,
      ...newView
    });
  });

  return newState;
};

export const view = ({ action, payload, ctx }: ViewReducerParams) => {
  let newState: State;

  switch (action) {
    case 'SYNC_SCENE':
      newState = syncScene(ctx);
      break;
    case 'CREATE_VIEW':
      newState = createView(payload, ctx);
      break;
    case 'UPDATE_VIEW':
      newState = updateView(payload, ctx);
      break;
    case 'DELETE_VIEW':
      newState = deleteView(ctx);
      break;
    case 'CREATE_VIEWITEM':
      newState = viewItemReducers.createViewItem(payload, ctx);
      break;
    case 'UPDATE_VIEWITEM':
      newState = viewItemReducers.updateViewItem(payload, ctx);
      break;
    case 'DELETE_VIEWITEM':
      newState = viewItemReducers.deleteViewItem(payload, ctx);
      break;
    case 'CREATE_CONNECTOR':
      newState = connectorReducers.createConnector(payload, ctx);
      break;
    case 'UPDATE_CONNECTOR':
      newState = connectorReducers.updateConnector(payload, ctx);
      break;
    case 'SYNC_CONNECTOR':
      newState = connectorReducers.syncConnector(payload, ctx);
      break;
    case 'DELETE_CONNECTOR':
      newState = connectorReducers.deleteConnector(payload, ctx);
      break;
    case 'CREATE_TEXTBOX':
      newState = textBoxReducers.createTextBox(payload, ctx);
      break;
    case 'UPDATE_TEXTBOX':
      newState = textBoxReducers.updateTextBox(payload, ctx);
      break;
    case 'DELETE_TEXTBOX':
      newState = textBoxReducers.deleteTextBox(payload, ctx);
      break;
    case 'CREATE_RECTANGLE':
      newState = rectangleReducers.createRectangle(payload, ctx);
      break;
    case 'UPDATE_RECTANGLE':
      newState = rectangleReducers.updateRectangle(payload, ctx);
      break;
    case 'DELETE_RECTANGLE':
      newState = rectangleReducers.deleteRectangle(payload, ctx);
      break;
    case 'CREATE_LAYER':
      newState = createLayer(payload, ctx);
      break;
    case 'UPDATE_LAYER':
      newState = updateLayer(payload, ctx);
      break;
    case 'DELETE_LAYER':
      newState = deleteLayer(payload, ctx);
      break;
    case 'REORDER_LAYERS':
      newState = reorderLayers(payload, ctx);
      break;
    case 'ASSIGN_LAYER_TO_ITEMS':
      newState = assignLayerToItems(payload, ctx);
      break;
    case 'REORDER_VIEWITEM':
      newState = reorderViewItem(payload, ctx);
      break;
    default:
      throw new Error('Invalid action.');
  }

  const TIMESTAMPED_ACTIONS = new Set([
    'CREATE_VIEW',
    'UPDATE_VIEW',
    'CREATE_VIEWITEM',
    'UPDATE_VIEWITEM',
    'DELETE_VIEWITEM',
    'CREATE_CONNECTOR',
    'UPDATE_CONNECTOR',
    'DELETE_CONNECTOR',
    'CREATE_TEXTBOX',
    'UPDATE_TEXTBOX',
    'DELETE_TEXTBOX',
    'CREATE_RECTANGLE',
    'UPDATE_RECTANGLE',
    'DELETE_RECTANGLE',
    'CREATE_LAYER',
    'UPDATE_LAYER',
    'DELETE_LAYER',
    'REORDER_LAYERS',
    'ASSIGN_LAYER_TO_ITEMS',
    'REORDER_VIEWITEM'
  ]);

  if (TIMESTAMPED_ACTIONS.has(action)) {
    return updateViewTimestamp({ state: newState, viewId: ctx.viewId });
  }

  return newState;
};
