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

/**
 * E2/RED-01 — `splice`, not `delete`.
 *
 * `delete draft.model.items[i]` looks like a removal and is not one. Immer's
 * copy materialises that index, so the array keeps its length and index `i` is
 * PRESENT holding `undefined` — not a sparse hole that `map`/`filter` would
 * skip. Three things broke at once: `validateView`'s
 * `ctx.model.items.map(i => i.id)` threw, and since `updateViewItem` validates
 * on every item update, ONE call made the whole view permanently un-editable;
 * `modelSchema.safeParse` rejected the model, so it would not reload; and
 * `JSON.stringify` emitted `null` for the slot, so the corruption is what got
 * saved.
 *
 * `deleteViewItem` has always used `splice`. This is the same list operation
 * written the other way, in the twin function.
 */
export const deleteModelItem = (id: string, state: State): State => {
  const modelItem = getItemByIdOrThrow(state.model.items, id);

  const newState = produce(state, (draft) => {
    draft.model.items.splice(modelItem.index, 1);
  });

  return newState;
};
