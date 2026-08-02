import { produce } from 'immer';
import { ViewItem } from 'src/types';
import { getItemByIdOrThrow, getConnectorsByViewItem } from 'src/utils';
import { validateView, Issue } from 'src/schemas/validation';
import { State, ViewReducerContext } from './types';
import { isNoOpUpdate } from './noOpUpdate';
import {
  collectAnchorTiles,
  sweepDanglingAnchorRefs
} from './anchorGraph';
import * as reducers from './view';

// The schema's hard bounds for `iconScale` (views.ts). ADR 0034 §4's no-dead-
// writes rule: a value outside them is schema-illegal at rest, so a diagram
// carrying one fails `safeParse` on the NEXT load — the write succeeds and the
// file is bricked (E4/CLIP-13). Clamping here covers every writer, including the
// exported action and the group-resize factor, whose own [0.3, 2.5] clamp sits
// one layer up and is easy to bypass or to widen.
const ICON_SCALE_MIN = 0.1;
const ICON_SCALE_MAX = 3;

/**
 * Identity of a validation issue, for the E2/RED-02 before/after diff.
 *
 * `type` + the sorted `params` — the params name the exact entities involved,
 * so two issues with the same key really are the same problem and not merely
 * the same KIND of problem. Keying on `type` alone would let an update that
 * introduces a second dangling ref hide behind a pre-existing first one.
 */
const issueKey = (issue: Issue): string =>
  `${issue.type}|${JSON.stringify(
    Object.entries((issue as { params?: Record<string, unknown> }).params ?? {}).sort(
      ([a], [b]) => (a < b ? -1 : 1)
    )
  )}`;

export const updateViewItem = (
  { id, ...updates }: { id: string } & Partial<ViewItem>,
  { viewId, state }: ViewReducerContext,
  /**
   * The state the RED-02 "was this issue already here?" diff measures against.
   * Defaults to `state`, which is right for a plain update.
   *
   * `createViewItem` must pass the PRE-INSERT state: it unshifts the new item
   * and then calls this, so `state` already contains it, and an issue the
   * creation introduces would be classified as pre-existing and waved through.
   * That hole was found by the "the guard keeps its teeth" test rather than by
   * reasoning — which is why that test exists.
   */
  baseline?: State
): State => {
  // RED-06: a write that changes nothing returns the state untouched, so the
  // dispatcher does not stamp `lastUpdated` and no phantom dirty flag, autosave
  // run or empty undo entry follows.
  {
    const existingView = state.model.views.find((v) => v.id === viewId);
    const existing = existingView?.items?.find((i) => i.id === id);
    if (
      existing &&
      isNoOpUpdate(
        existing as unknown as Record<string, unknown>,
        updates as Record<string, unknown>
      )
    ) {
      return state;
    }
  }
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

  // E2/RED-02 — THE AMPLIFIER. This used to validate the WHOLE view and throw
  // on the FIRST issue it found, regardless of whether the update had anything
  // to do with it. So a view that already contained one problem — a rectangle
  // whose colour was removed from the palette, a stale anchor-to-anchor ref, a
  // hand-edited import — became permanently un-editable: dragging ANY node and
  // placing a NEW node both threw, the throw was unhandled in the pointer
  // handlers, and it left the undo snapshot armed (E1/HIST-05).
  //
  // It was also the multiplier on half of this cluster: RED-07 and RED-14 each
  // produce one dangling ref, and this turned that into "the whole page is
  // dead".
  //
  // The check is scoped to the ACTION now: only issues this update INTRODUCED
  // are its fault. Pre-existing ones are left for the load-time repair to fix
  // (wave 1's repair-don't-reject ruling), which is where a file that already
  // contains them gets healed — the two halves of the same rule.
  const newView = getItemByIdOrThrow(newState.model.views, viewId);
  const issues = validateView(newView.value, { model: newState.model });

  if (issues.length > 0) {
    const baseState = baseline ?? state;
    const before = getItemByIdOrThrow(baseState.model.views, viewId);
    const preExisting = new Set(
      validateView(before.value, { model: baseState.model }).map(issueKey)
    );
    const introduced = issues.filter((i) => !preExisting.has(issueKey(i)));
    if (introduced.length > 0) {
      throw new Error(introduced[0].message);
    }
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

  // The pre-insert state is the RED-02 baseline — see updateViewItem.
  return updateViewItem(newViewItem, { viewId, state: newState }, state);
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

    // E2/RED-07 — the anchor graph, which the item-reference cascade above does
    // not walk. A connector anchored to one of the connectors just removed was
    // left pointing at an anchor that no longer exists, and by the RED-02
    // amplifier that made every later node move in this view throw. The tiles
    // come from the doomed connectors, which is the only moment they are still
    // knowable.
    const doomedTiles = collectAnchorTiles(connectorsToDelete);
    // Only when the view HAS a connectors array — one without must not GAIN an
    // empty array here (the same "do not introduce a container" care the RED-06
    // no-op guard takes; an added key is a real patch and a real dirty flag).
    const existingConnectors = draft.model.views[view.index].connectors;
    const swept = sweepDanglingAnchorRefs(existingConnectors, doomedTiles);
    if (existingConnectors) {
      draft.model.views[view.index].connectors = swept.connectors;
    }
    // A connector the sweep removed leaves scene state behind otherwise.
    const survivingIds = new Set(swept.connectors.map((c) => c.id));
    Object.keys(draft.scene.connectors).forEach((connectorId) => {
      if (!survivingIds.has(connectorId)) delete draft.scene.connectors[connectorId];
    });
  });

  return newState;
};
