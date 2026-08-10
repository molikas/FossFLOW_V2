import { useCallback, useEffect, useRef } from 'react';
import { isSessionPreservingTarget } from 'src/utils/sessionPreservingTarget';

interface Params {
  /** True while the contentEditable is mounted / editing. */
  active: boolean;
  /** Persist the edited value (called on left-click-away and Enter). */
  commit: (value: string) => void;
  /** Discard the edit (called on right-click-away and Escape). */
  cancel: () => void;
  /** When true, plain Enter inserts a newline and only Enter commits via blur
   *  (Shift+Enter stays a newline). Used by the multi-line text box. */
  multiline?: boolean;
}

/**
 * Shared click-away contract for the canvas inline-rename editors (node label,
 * text box, connector name). Left-click-away and Enter PERSIST the edit;
 * right-click-away and Escape CANCEL it.
 *
 * The bug this fixes: left-clicking the canvas deselects the element, which
 * unmounts the contentEditable BEFORE its `onBlur` commit can run, so the edit
 * was silently lost and read as a cancel (only Enter — which blurs explicitly
 * first — persisted). A capture-phase `pointerdown` listener runs ahead of the
 * canvas's own deselect handler and blurs the editor synchronously, so the
 * commit lands before the unmount. The pointer button decides commit vs cancel
 * (right button → cancel), since a bare `blur` can't tell them apart.
 *
 * Contract documented in ADR 0022 §4 (inline-rename commit semantics).
 */
export const useInlineRename = ({
  active,
  commit,
  cancel,
  multiline
}: Params) => {
  const elRef = useRef<HTMLElement | null>(null);
  const cancelRef = useRef(false);

  // Hold the latest callbacks so the capture listener doesn't re-subscribe on
  // every render (commit/cancel close over changing model state).
  const commitRef = useRef(commit);
  const cancelFnRef = useRef(cancel);
  commitRef.current = commit;
  cancelFnRef.current = cancel;

  // TXT-06 made the press-away listener the AUTHORITY on ending the session,
  // rather than relying on `blur` to mean "the user left". Focus moves to the
  // strip on a plain mousedown, which fired a blur the hook could only read as
  // a commit — so reaching for the strip mid-rename ended the rename whatever
  // the press-away listener allow-listed. `finish` is now called explicitly and
  // guarded, and blur only defers to it when focus went somewhere that is NOT
  // part of the session.
  const finishedRef = useRef(false);
  const finish = useCallback((mode: 'commit' | 'cancel', text?: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    cancelRef.current = false;
    if (mode === 'cancel') {
      cancelFnRef.current();
      return;
    }
    const el = elRef.current;
    // `innerText` is the authored text as rendered; jsdom does not implement it,
    // so fall back to `textContent` (the two agree for these single-node
    // contentEditables).
    commitRef.current(text ?? el?.innerText ?? el?.textContent ?? '');
  }, []);

  useEffect(() => {
    if (!active) return;
    finishedRef.current = false;
    const onPressAway = (e: PointerEvent | MouseEvent) => {
      const el = elRef.current;
      if (!el || el.contains(e.target as Node)) return;
      // The strip and its MUI portals are part of the session, not away from
      // it. Without this branch, reaching for the top strip to change a Label's
      // colour or size mid-rename ended the rename — while the same gesture
      // during a text-box session worked, because THAT editor had the allow-list
      // and this shared hook did not. One helper now, so the two
      // implementations of the same contract cannot drift again.
      if (isSessionPreservingTarget(e.target)) return;
      // Right-click away cancels; any other button commits. Blur first so the
      // caret leaves before the canvas's own pointerdown handler deselects and
      // unmounts this editor, then finish explicitly — the editor may already
      // have lost focus to a strip control, in which case no blur would fire.
      el.blur();
      finish(e.button === 2 ? 'cancel' : 'commit');
    };
    // Bound to BOTH, matching TextBoxInlineEditor: real input fires pointerdown
    // first (`finishedRef` makes the mousedown a no-op), and the e2e suite's
    // synthetic canvas events are mouse-only.
    window.addEventListener('pointerdown', onPressAway, true);
    window.addEventListener('mousedown', onPressAway, true);
    return () => {
      window.removeEventListener('pointerdown', onPressAway, true);
      window.removeEventListener('mousedown', onPressAway, true);
    };
  }, [active, finish]);

  // Callback ref: focus + select-all on mount (matches prior per-editor logic).
  const setRef = useCallback((el: HTMLElement | null) => {
    elRef.current = el;
    if (el && document.activeElement !== el) {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  const onBlur = useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      // Focus landing on the strip (or one of its portals) is not leaving the
      // session — the control is about to edit THIS element. The session ends
      // when the press-away listener says so, not when focus wanders.
      if (isSessionPreservingTarget(e.relatedTarget)) return;
      finish(
        cancelRef.current ? 'cancel' : 'commit',
        e.currentTarget?.innerText
      );
    },
    [finish]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      e.stopPropagation();
      if (e.key === 'Enter' && (!multiline || !e.shiftKey)) {
        e.preventDefault();
        (e.currentTarget as HTMLElement).blur(); // → commit
        finish('commit');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRef.current = true;
        (e.currentTarget as HTMLElement).blur(); // → cancel
        finish('cancel');
      }
    },
    [multiline, finish]
  );

  return { setRef, onBlur, onKeyDown };
};
