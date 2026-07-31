import { produce } from 'immer';
import { ModelItem } from 'src/types';
import { getItemByIdOrThrow } from 'src/utils';
import { seedNodeLabel } from 'src/utils/seedNodeLabel';
import { State } from './types';

export const updateModelItem = (
  id: string,
  updates: Partial<ModelItem>,
  state: State
): State => {
  const modelItem = getItemByIdOrThrow(state.model.items, id);

  const newState = produce(state, (draft) => {
    draft.model.items[modelItem.index] = { ...modelItem.value, ...updates };
  });

  return newState;
};

/**
 * TXT-05 — the ADR 0032 label↔name decouple has two halves and only one of them
 * used to run at creation time. The renderer draws `label ?? name`, so the
 * identity `name` is still the fallback whenever `label` is absent, and
 * `seedNodeLabel` — which pins every node out of that fallback — was a LOAD-path
 * normaliser only. A node created during the session (`PlaceIcon`, quick-add,
 * paste) had no `label`, the fallback was live, and renaming the node in Layers
 * moved its canvas text — the exact cross-persona confusion the amendment was
 * written to remove. The same gesture on the same node behaved differently
 * before and after a reload.
 *
 * Seeding here rather than at each creation site makes this the ONE chokepoint:
 * every path that creates a model item goes through this reducer.
 */
export const createModelItem = (
  newModelItem: ModelItem,
  state: State
): State => {
  const seeded = seedNodeLabel(newModelItem) as ModelItem;
  return produce(state, (draft) => {
    draft.model.items.push(seeded);
  });
};

export const deleteModelItem = (id: string, state: State): State => {
  const modelItem = getItemByIdOrThrow(state.model.items, id);

  const newState = produce(state, (draft) => {
    delete draft.model.items[modelItem.index];
  });

  return newState;
};
