import { produce } from 'immer';
import { TextBox } from 'src/types';
import { getItemByIdOrThrow, getTextBoxDimensions } from 'src/utils';
import { isNoOpUpdate } from './noOpUpdate';
import { State, ViewReducerContext } from './types';

export const syncTextBox = (
  id: string,
  { viewId, state }: ViewReducerContext
): State => {
  const newState = produce(state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, viewId);
    const textBox = getItemByIdOrThrow(view.value.textBoxes ?? [], id);

    const textBoxSize = getTextBoxDimensions(textBox.value);

    draft.scene.textBoxes[textBox.value.id] = { size: textBoxSize };
  });

  return newState;
};

export const updateTextBox = (
  { id, ...updates }: { id: string } & Partial<TextBox>,
  { viewId, state }: ViewReducerContext
): State => {
  const view = getItemByIdOrThrow(state.model.views, viewId);

  // RED-06 — see noOpUpdate.ts. Also keeps the re-measure below from running on
  // a write that cannot have changed the geometry.
  const existing = view.value.textBoxes?.find((tb) => tb.id === id);
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
    const { textBoxes } = draft.model.views[view.index];

    if (!textBoxes) return;

    const textBox = getItemByIdOrThrow(textBoxes, id);
    const newTextBox = { ...textBox.value, ...updates };
    textBoxes[textBox.index] = newTextBox;

    // Re-measure on any write that changes rendered geometry — content,
    // fontSize, line spacing, or manual size (ADR 0034 addenda 2026-07-03).
    // `in` (not !== undefined) so an explicit reset write like
    // `{ width: undefined }` (fit-to-text) also re-measures.
    if (
      'content' in updates ||
      'fontSize' in updates ||
      'lineHeight' in updates ||
      'width' in updates ||
      'height' in updates
    ) {
      const stateAfterSync = syncTextBox(newTextBox.id, {
        viewId,
        state: draft
      });

      draft.model = stateAfterSync.model;
      draft.scene = stateAfterSync.scene;
    }
  });

  return newState;
};

export const createTextBox = (
  newTextBox: TextBox,
  { viewId, state }: ViewReducerContext
): State => {
  const view = getItemByIdOrThrow(state.model.views, viewId);

  const newState = produce(state, (draft) => {
    const { textBoxes } = draft.model.views[view.index];

    if (!textBoxes) {
      draft.model.views[view.index].textBoxes = [newTextBox];
    } else {
      draft.model.views[view.index].textBoxes?.unshift(newTextBox);
    }
  });

  // Measure the new box directly rather than by re-dispatching an update of
  // every field it was just created with. That round trip only ever existed to
  // reach `syncTextBox`, and since RED-06 gave `updateTextBox` a no-op guard it
  // would have depended on `tile` being an object to survive that guard —
  // a load-bearing accident. Say what is meant instead.
  return syncTextBox(newTextBox.id, { viewId, state: newState });
};

export const deleteTextBox = (
  id: string,
  { viewId, state }: ViewReducerContext
): State => {
  const view = getItemByIdOrThrow(state.model.views, viewId);
  const textBox = getItemByIdOrThrow(view.value.textBoxes ?? [], id);

  const newState = produce(state, (draft) => {
    draft.model.views[view.index].textBoxes?.splice(textBox.index, 1);
    delete draft.scene.textBoxes[id];
  });

  return newState;
};
