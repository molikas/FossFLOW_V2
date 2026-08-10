import { produce } from 'immer';
import {
  View,
  Layer,
  ViewItem,
  Connector,
  Rectangle,
  TextBox,
  Label,
  ItemReference
} from 'src/types';
import { getItemByIdOrThrow, generateId } from 'src/utils';
import { VIEW_DEFAULTS, INITIAL_SCENE_STATE } from 'src/config';
import type { ViewReducerContext, State, ViewReducerParams } from './types';
import { isNoOpUpdate } from './noOpUpdate';
import { syncConnector } from './connector';
import { syncTextBox } from './textBox';
import * as viewItemReducers from './viewItem';
import * as connectorReducers from './connector';
import * as textBoxReducers from './textBox';
import * as labelReducers from './label';
import * as rectangleReducers from './rectangle';

export const updateViewTimestamp = (ctx: ViewReducerContext): State => {
  // Shallow structural write — NOT a full-state immer produce (ST-2). The
  // action that triggered this already ran one produce for its own mutation;
  // a second produce here (clone + deep-freeze the whole model) just to stamp
  // one field doubled the per-edit cost. Spreading new objects for the model,
  // the views array and the target view is O(V) and allocation-light.
  const now = new Date().toISOString();

  return {
    ...ctx.state,
    model: {
      ...ctx.state.model,
      views: ctx.state.model.views.map((view) =>
        view.id === ctx.viewId ? { ...view, lastUpdated: now } : view
      )
    }
  };
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
  // RED-06: ViewTabs' inline rename commits on blur/Enter unconditionally, so
  // opening the editor and pressing Enter without typing lands here with the
  // name it already has. Return the state untouched so nothing downstream —
  // the timestamp stamp, the dirty flag, autosave, history — reacts to it.
  const current = ctx.state.model.views.find((v) => v.id === ctx.viewId);
  if (
    current &&
    isNoOpUpdate(
      current as unknown as Record<string, unknown>,
      updates as Record<string, unknown>
    )
  ) {
    return ctx.state;
  }

  const newState = produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId);
    Object.assign(view.value, updates);
  });

  return newState;
};

// ---------------------------------------------------------------------------
// Layer reducers
// ---------------------------------------------------------------------------

/**
 * `layer.order` values must be a permutation of `0..n-1` — the stacking order of
 * two layers sharing an `order` is undefined (E2/RED-04, E2/RED-05: a create
 * after a delete reused a live value, and a partial `reorderLayers` list
 * renumbered only the ids it named). Normalising after every mutation makes the
 * invariant unbreakable by any single call rather than by each call being
 * careful. Stable: equal orders keep their current array position.
 */
const normaliseLayerOrder = (layers: Layer[]): void => {
  layers
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) =>
      a.layer.order === b.layer.order
        ? a.index - b.index
        : a.layer.order - b.layer.order
    )
    .forEach(({ layer }, order) => {
      layer.order = order;
    });
  layers.sort((a, b) => a.order - b.order);
};

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
    normaliseLayerOrder(view.value.layers);
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

/**
 * F4/LAY-05 + the E2/RED-13 ruling (owner 2026-07-30): deleting a layer has TWO
 * defensible meanings and the user picks.
 *
 * `contents: 'unassign'` (the historical behaviour) frees the entities into the
 * unassigned bucket. `contents: 'delete'` removes them with the layer, the
 * Photoshop reading.
 *
 * Why the choice had to be surfaced rather than defaulted: visibility is derived
 * as `!layer || layer.visible` (`useLayerContext`), so an entity with no layer
 * is UNCONDITIONALLY visible. Unassigning the members of a HIDDEN layer
 * therefore inverts their visibility — deleting a hidden layer revealed
 * everything it was hiding, silently. Axoview layers are tags rather than
 * owners, so the ruling took the Visio pattern (ask) over AutoCAD's (refuse).
 *
 * The reducer stays the mechanism only; the dialog that asks lives in
 * `LayersPanel`, and the hidden-layer warning is its extra sentence.
 */
export const deleteLayer = (
  payload: string | { layerId: string; contents?: 'unassign' | 'delete' },
  ctx: ViewReducerContext
): State => {
  const layerId = typeof payload === 'string' ? payload : payload.layerId;
  const contents =
    typeof payload === 'string' ? 'unassign' : payload.contents ?? 'unassign';

  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId);
    if (!view.value.layers) return;

    view.value.layers = view.value.layers.filter((l) => l.id !== layerId);

    if (contents === 'delete') {
      const survives = <T extends { layerId?: string }>(
        list: T[] | undefined
      ): T[] | undefined =>
        list ? list.filter((e) => e.layerId !== layerId) : list;
      // Connectors first: dropping an ITEM without its connectors would leave
      // anchors pointing at nothing, which is E2/RED-07's shape.
      const doomedItemIds = new Set(
        (view.value.items ?? [])
          .filter((i) => i.layerId === layerId)
          .map((i) => i.id)
      );
      view.value.connectors = (view.value.connectors ?? []).filter(
        (c) =>
          c.layerId !== layerId &&
          !c.anchors.some((a) => {
            const ref = a.ref as { item?: string } | undefined;
            return typeof ref?.item === 'string' && doomedItemIds.has(ref.item);
          })
      );
      view.value.items = survives(view.value.items) ?? [];
      view.value.rectangles = survives(view.value.rectangles);
      view.value.textBoxes = survives(view.value.textBoxes);
      view.value.labels = survives(view.value.labels);
    } else {
      // Unassign layerId from all entities that referenced this layer.
      const unassign = (
        entity: ViewItem | Connector | Rectangle | TextBox | Label
      ) => {
        if (entity.layerId === layerId) delete entity.layerId;
      };
      (view.value.items ?? []).forEach(unassign);
      (view.value.connectors ?? []).forEach(unassign);
      (view.value.rectangles ?? []).forEach(unassign);
      (view.value.textBoxes ?? []).forEach(unassign);
      (view.value.labels ?? []).forEach(unassign);
    }

    // The delete leaves a hole in the order sequence, which the next
    // `createLayer` would then reuse (E2/RED-04).
    normaliseLayerOrder(view.value.layers);
  });
};

/**
 * How many entities a layer holds, and whether hiding is in play — everything
 * the confirm dialog needs to phrase itself (F4/LAY-05, E2/RED-13).
 */
export const describeLayerContents = (
  view: View | undefined,
  layerId: string
): { count: number; hidden: boolean } => {
  if (!view) return { count: 0, hidden: false };
  const lists = [
    view.items,
    view.connectors,
    view.rectangles,
    view.textBoxes,
    view.labels
  ];
  const count = lists.reduce(
    (n, list) =>
      n + (list ?? []).filter((e) => (e as { layerId?: string }).layerId === layerId).length,
    0
  );
  const layer = (view.layers ?? []).find((l) => l.id === layerId);
  return { count, hidden: !!layer && layer.visible === false };
};

export const reorderLayers = (
  orderedIds: string[],
  ctx: ViewReducerContext
): State => {
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId);
    if (!view.value.layers) return;
    // A PARTIAL list used to renumber only the ids it named, leaving every
    // unnamed layer holding an order the loop had just handed to someone else
    // (E2/RED-05). Rebuild the whole sequence instead: named layers take the
    // leading slots in the order given, the rest follow in their current
    // relative order.
    const layers = view.value.layers;
    const named = orderedIds
      .map((id) => layers.find((l) => l.id === id))
      .filter((l): l is Layer => !!l);
    const namedIds = new Set(named.map((l) => l.id));
    const rest = layers
      .slice()
      .sort((a, b) => a.order - b.order)
      .filter((l) => !namedIds.has(l.id));
    [...named, ...rest].forEach((layer, order) => {
      layer.order = order;
    });
    layers.sort((a, b) => a.order - b.order);
  });
};

export const assignLayerToItems = (
  { layerId, refs }: { layerId: string | undefined; refs: ItemReference[] },
  ctx: ViewReducerContext
): State => {
  // F4/LAY-11 — dispatch PER COLLECTION using the reference's own type. A bare
  // id-set applied across all five collections moved every entity sharing the
  // id, and nothing enforces cross-collection id uniqueness (E4/CLIP-01).
  const idsByType = new Map<string, Set<string>>();
  refs.forEach((ref) => {
    const set = idsByType.get(ref.type) ?? new Set<string>();
    set.add(ref.id);
    idsByType.set(ref.type, set);
  });
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId);

    // E2/RED-03: nothing validated layer references, so an id naming no layer
    // was accepted here, passed `validateView` AND `modelSchema`, and saved and
    // reloaded intact — an entity permanently assigned to a layer that does not
    // exist. Reject at the one write site that can create one, rather than
    // letting the load path find it later (a strict load gate would refuse to
    // open the files this bug has already produced — the E4/CLIP-02 harm).
    if (layerId !== undefined) {
      const exists = (view.value.layers ?? []).some((l) => l.id === layerId);
      if (!exists) {
        throw new Error(
          `Cannot assign items to layer "${layerId}": no such layer in view "${ctx.viewId}".`
        );
      }
    }

    const assignIn = (
      type: string,
      entities: (ViewItem | Connector | Rectangle | TextBox | Label)[] | undefined
    ) => {
      const ids = idsByType.get(type);
      if (!ids || !entities) return;
      entities.forEach((entity) => {
        if (!ids.has(entity.id)) return;
        if (layerId === undefined) {
          delete entity.layerId;
        } else {
          entity.layerId = layerId;
        }
      });
    };
    assignIn('ITEM', view.value.items);
    assignIn('CONNECTOR', view.value.connectors);
    assignIn('RECTANGLE', view.value.rectangles);
    assignIn('TEXTBOX', view.value.textBoxes);
    assignIn('LABEL', view.value.labels);
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

// Actions that bump the target view's lastUpdated timestamp. Hoisted to module
// scope so the Set is built once, not rebuilt on every dispatch.
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
  'CREATE_LABEL',
  'UPDATE_LABEL',
  'DELETE_LABEL',
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
    case 'CREATE_LABEL':
      newState = labelReducers.createLabel(payload, ctx);
      break;
    case 'UPDATE_LABEL':
      newState = labelReducers.updateLabel(payload, ctx);
      break;
    case 'DELETE_LABEL':
      newState = labelReducers.deleteLabel(payload, ctx);
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

  // RED-06 — stamp only when the reducer actually produced a change.
  //
  // This used to apply the timestamp on the ACTION NAME alone, discarding the
  // signal the reducers already give one line above: every one of them either
  // produces through immer (new `model` reference) or returns the input state
  // untouched. Stamping regardless minted a fresh model / views array / view
  // object whose only difference was `lastUpdated`, so a no-op fired
  // `useDirtyTracker` ("unsaved changes"), woke autosave, and stored a history
  // entry whose undo produces no visible change — a Ctrl+Z that appears to do
  // nothing. Confirmed reachable by committing a page rename with the SAME
  // name, re-writing a property with the value it already has, `UPDATE_LAYER`
  // with an unknown id, and `REORDER_LAYERS` with an empty list.
  //
  // It also made the create-then-discard of an abandoned text box or Label
  // (TXT-04 / TXT-07) a non-empty patch set, so the session bracket that should
  // net to nothing still left an entry behind.
  if (TIMESTAMPED_ACTIONS.has(action) && newState.model !== ctx.state.model) {
    return updateViewTimestamp({ state: newState, viewId: ctx.viewId });
  }

  return newState;
};
