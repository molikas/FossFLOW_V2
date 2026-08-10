import { useEffect, useRef } from 'react';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useSceneActions } from 'src/hooks/useSceneActions';

/**
 * ONE history entry per on-canvas edit session (TXT-04, TXT-07, TXT-08).
 *
 * The session used to leak history entries at both ends:
 *
 *  - Placing a text box wrote one entry and the ADR 0034 empty-box discard
 *    wrote a SECOND, so a single Ctrl+Z after abandoning a fresh box landed
 *    BETWEEN them and resurrected an invisible 1×1 ghost — clickable,
 *    lassoable, included by Ctrl+A and by the project bounds, and written to
 *    every save and export (TXT-04). The floating Label had the same shape once
 *    it gained the text box's lifecycle (TXT-07).
 *  - The strip's dual scope (ADR 0034 §2) meant Escape discarded the Quill
 *    draft while any element-level write made during the same session — font
 *    size, line spacing, border, fill, vertical alignment — was already
 *    committed and stayed (TXT-08). One gesture, two opposite cancel semantics.
 *
 * The drag-transaction primitive is exactly the right shape and already carries
 * the tests: it snapshots once at `begin`, coalesces every write until `commit`,
 * and pushes NOTHING when the net patch set is empty. So the whole session —
 * placement, typing, every strip write — becomes one logical action, and a
 * cancelled session that restores its own starting state leaves no trace.
 *
 * WHY THIS IS A HOOK ON A STABLE COMPONENT, not an effect inside `TextBox`.
 * The Renderer promotes the editing box into a separate `TextBoxes` instance so
 * the editor can receive pointer events, which UNMOUNTS and REMOUNTS the box
 * mid-session. A bracket owned by that component therefore closed itself the
 * moment the session began — committing the placement as its own entry and
 * leaving the discard as a second, i.e. reproducing TXT-04 exactly. The bracket
 * has to be owned by something whose lifetime is the session's, so it watches
 * the two store flags instead.
 *
 * `beginDragTransaction` is idempotent, so the placement modes opening it
 * BEFORE creating the entity (which they must, or the create lands outside the
 * bracket) composes with this hook rather than fighting it.
 */
export const useInlineEditHistoryBracket = () => {
  const editingTextBoxId = useUiStateStore((s) => s.editingTextBoxId);
  const inlineEditLabelId = useUiStateStore((s) => s.inlineEditLabelId);
  const { beginDragTransaction, commitDragTransaction } = useSceneActions();

  const openRef = useRef(false);
  const sessionOpen = Boolean(editingTextBoxId || inlineEditLabelId);

  useEffect(() => {
    if (sessionOpen && !openRef.current) {
      openRef.current = true;
      beginDragTransaction();
    } else if (!sessionOpen && openRef.current) {
      openRef.current = false;
      commitDragTransaction();
    }
  }, [sessionOpen, beginDragTransaction, commitDragTransaction]);

  // Never leave it open: unmounting mid-session (page switch, diagram load)
  // would otherwise freeze history for every later action.
  useEffect(
    () => () => {
      if (openRef.current) {
        openRef.current = false;
        commitDragTransaction();
      }
    },
    [commitDragTransaction]
  );
};
