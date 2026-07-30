import { produce } from 'immer';
import { ViewItem } from 'src/types';
import { getItemByIdOrThrow, getConnectorsByViewItem } from 'src/utils';
import { validateView } from 'src/schemas/validation';
import { State, ViewReducerContext } from './types';
import * as reducers from './view';

// The schema's hard bounds for `iconScale` (views.ts). ADR 0034 §4's no-dead-
// writes rule: a value outside them is schema-illegal at rest, so a diagram
// carrying one fails `safeParse` on the NEXT load — the write succeeds and the
// file is bricked (E4/CLIP-13). Clamping here covers every writer, including the
// exported action and the group-resize factor, whose own [0.3, 2.5] clamp sits
// one layer up and is easy to bypass or to widen.
const ICON_SCALE_MIN = 0.1;
const ICON_SCALE_MAX = 3;

export const updateViewItem = (
  { id, ...updates }: { id: string } & Partial<ViewItem>,
  { viewId, state }: ViewReducerContext
): State => {
  const newState = produce(state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, viewId);
    const { items } = view.value;

    if (!items) return;

    const viewItem = getItemByIdOrThrow(items, id);
    const newItem = { ...viewItem.value, ...updates };
    if (typeof newItem.iconScale === 'number') {
      newItem.iconScale = Math.min(
        ICON_SCALE_MAX,
        Math.max(ICON_SCALE_MIN, newItem.iconScale)
      );
    }
    // Same class: the schema declares `zIndex` an integer, so a fractional one
    // is a dead write that fails safeParse on the next load. (Found by the
    // identity/range contract gate, not by a campaign probe.)
    if (typeof newItem.zIndex === 'number') {
      newItem.zIndex = Math.round(newItem.zIndex);
    }
    items[viewItem.index] = newItem;

    if (updates.tile) {
      const connectorsToUpdate = getConnectorsByViewItem(
        viewItem.value.id,
        view.value.connectors ?? []
      );

      const updatedConnectors = connectorsToUpdate.reduce((acc, connector) => {
        return reducers.view({
          action: 'UPDATE_CONNECTOR',
          payload: connector,
          ctx: { viewId, state: acc }
        });
      }, draft);

      draft.model.views[view.index].connectors =
        updatedConnectors.model.views[view.index].connectors;

      draft.scene.connectors = updatedConnectors.scene.connectors;
    }
  });

  const newView = getItemByIdOrThrow(newState.model.views, viewId);
  const issues = validateView(newView.value, { model: newState.model });

  if (issues.length > 0) {
    throw new Error(issues[0].message);
  }

  return newState;
};

export const createViewItem = (
  newViewItem: ViewItem,
  ctx: ViewReducerContext
): State => {
  const { state, viewId } = ctx;
  const view = getItemByIdOrThrow(state.model.views, viewId);

  const newState = produce(state, (draft) => {
    const { items } = draft.model.views[view.index];
    items.unshift(newViewItem);
  });

  return updateViewItem(newViewItem, { viewId, state: newState });
};

export const deleteViewItem = (
  id: string,
  { state, viewId }: ViewReducerContext
): State => {
  const newState = produce(state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, viewId);
    const viewItem = getItemByIdOrThrow(view.value.items, id);

    draft.model.views[view.index].items.splice(viewItem.index, 1);

    // Find connectors that reference this deleted item
    const connectorsToDelete = getConnectorsByViewItem(
      viewItem.value.id,
      view.value.connectors ?? []
    );

    // Remove connectors that reference the deleted item
    if (
      connectorsToDelete.length > 0 &&
      draft.model.views[view.index].connectors
    ) {
      draft.model.views[view.index].connectors = draft.model.views[
        view.index
      ].connectors?.filter(
        (connector) => !connectorsToDelete.some((c) => c.id === connector.id)
      );

      // Also remove from scene
      connectorsToDelete.forEach((connector) => {
        delete draft.scene.connectors[connector.id];
      });
    }
  });

  return newState;
};
