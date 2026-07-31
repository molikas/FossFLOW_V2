import { produce } from 'immer';
import { Rectangle } from 'src/types';
import { getItemByIdOrThrow } from 'src/utils';
import { isNoOpUpdate } from './noOpUpdate';
import { State, ViewReducerContext } from './types';

export const updateRectangle = (
  { id, ...updates }: { id: string } & Partial<Rectangle>,
  { viewId, state }: ViewReducerContext
): State => {
  const view = getItemByIdOrThrow(state.model.views, viewId);

  // RED-06 — a write that changes nothing leaves the state untouched, so the
  // dispatcher skips the `lastUpdated` stamp. Very reachable since the ADR 0030
  // bulk fan-out: every member of a homogeneous selection that already carried
  // the value being applied used to dirty the diagram on its own.
  const existing = view.value.rectangles?.find((r) => r.id === id);
  if (
    existing &&
    isNoOpUpdate(
      existing as unknown as Record<string, unknown>,
      updates as Record<string, unknown>
    )
  ) {
    return state;
  }

  const newState = produce(state, (draft) => {
    const { rectangles } = draft.model.views[view.index];

    if (!rectangles) return;

    const rectangle = getItemByIdOrThrow(rectangles, id);
    const newRectangle = { ...rectangle.value, ...updates };
    rectangles[rectangle.index] = newRectangle;
  });

  return newState;
};

export const createRectangle = (
  newRectangle: Rectangle,
  { viewId, state }: ViewReducerContext
): State => {
  const view = getItemByIdOrThrow(state.model.views, viewId);

  const newState = produce(state, (draft) => {
    const { rectangles } = draft.model.views[view.index];

    if (!rectangles) {
      draft.model.views[view.index].rectangles = [newRectangle];
    } else {
      draft.model.views[view.index].rectangles?.unshift(newRectangle);
    }
  });

  return updateRectangle(newRectangle, {
    viewId,
    state: newState
  });
};

export const deleteRectangle = (
  id: string,
  { viewId, state }: ViewReducerContext
): State => {
  const view = getItemByIdOrThrow(state.model.views, viewId);
  const rectangle = getItemByIdOrThrow(view.value.rectangles ?? [], id);

  const newState = produce(state, (draft) => {
    draft.model.views[view.index].rectangles?.splice(rectangle.index, 1);
    // Rectangles don't have scene data - they're only stored in the model
  });

  return newState;
};
