import { produce } from 'immer';
import { Label } from 'src/types';
import { getItemByIdOrThrow } from 'src/utils';
import { isNoOpUpdate } from './noOpUpdate';
import { State, ViewReducerContext } from './types';

// Label reducers (ADR 0031). Labels are MODEL-ONLY: unlike a TextBox they carry
// no scene-size entry — the Canvas2D SceneCanvas and the DOM LabelHitLayer each
// measure the chip themselves (exactly like node labels in SceneCanvas), so
// there is no syncLabel / scene write here and nothing for SYNC_SCENE to rebuild.

export const updateLabel = (
  { id, ...updates }: { id: string } & Partial<Label>,
  { viewId, state }: ViewReducerContext
): State => {
  const view = getItemByIdOrThrow(state.model.views, viewId);

  // RED-06 — see noOpUpdate.ts. A no-change write leaves the state untouched so
  // nothing downstream (timestamp, dirty flag, autosave, history) reacts.
  const existing = view.value.labels?.find((l) => l.id === id);
  if (
    existing &&
    isNoOpUpdate(
      existing as unknown as Record<string, unknown>,
      updates as Record<string, unknown>
    )
  ) {
    return state;
  }

  return produce(state, (draft) => {
    const { labels } = draft.model.views[view.index];

    if (!labels) return;

    const label = getItemByIdOrThrow(labels, id);
    labels[label.index] = { ...label.value, ...updates };
  });
};

export const createLabel = (
  newLabel: Label,
  { viewId, state }: ViewReducerContext
): State => {
  const view = getItemByIdOrThrow(state.model.views, viewId);

  return produce(state, (draft) => {
    const { labels } = draft.model.views[view.index];

    if (!labels) {
      draft.model.views[view.index].labels = [newLabel];
    } else {
      labels.unshift(newLabel);
    }
  });
};

export const deleteLabel = (
  id: string,
  { viewId, state }: ViewReducerContext
): State => {
  const view = getItemByIdOrThrow(state.model.views, viewId);
  const label = getItemByIdOrThrow(view.value.labels ?? [], id);

  return produce(state, (draft) => {
    draft.model.views[view.index].labels?.splice(label.index, 1);
  });
};
