// ─── Canvas keyboard scope: "does this keystroke belong to the canvas?" ──────
//
// `useInteractionManager`'s keydown dispatcher listens on `window`, and for a
// long time its only scope check was `isEditableTarget` (am I inside an input?).
// The 2026-07 campaign's I1 area found four bugs of one shape from that
// (PTR-01/02/03, PTR-05, PTR-11, PTR-12): a window listener that fires in
// read-only mode, behind modals, over text selections and on locked entities.
//
// `readonlyPolicy` answers the first of those — *may this surface act in this
// editorMode*. This module answers the orthogonal question: *is the canvas even
// the surface the user is typing at right now*. Both are consulted by the
// dispatcher; neither re-tests the other's condition.
//
// See ADR 0047 §3, and docs/reviews/exploratory-2026-07/ for the campaign
// record this class came out of.

/**
 * Is a modal dialog currently up? (I1/PTR-05.)
 *
 * A modal owns the keyboard: it traps focus, dims the page behind it, and the
 * user's Delete/Ctrl+Z/`r` is aimed at *it*, not at the canvas underneath. The
 * canvas dispatcher used to fire anyway — F1 opened Help and the very next
 * Delete destroyed the selected node behind the still-open dialog, with no
 * visible feedback at all.
 *
 * The check is a DOM query rather than a store read on purpose. `uiState.dialog`
 * knows only the three lib-owned dialogs (Export/Help/Settings); the app package
 * mounts its own (import, share, settings, confirm prompts) and knows nothing
 * about that field. `role="dialog"` + `aria-modal="true"` is what MUI's `Dialog`
 * puts on its Paper (v7 `Dialog.js`) and what the ARIA pattern requires of any
 * hand-rolled one, so a new modal on either side of the package boundary is
 * shielded the day it is added — which is the property that failed here.
 *
 * Deliberately NOT matched: MUI `Menu` / `Popover` / `Drawer` (`role="menu"`,
 * `role="presentation"`) — the canvas context menu is a canvas surface, and
 * blocking hotkeys while it is open would be a regression.
 */
export const isModalDialogOpen = (): boolean => {
  if (typeof document === 'undefined') return false;
  return (
    document.querySelector(
      '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], dialog[open]'
    ) !== null
  );
};

/**
 * Is there a live, non-empty text selection outside an editable field? (I1/PTR-12.)
 *
 * Ctrl+C used to `preventDefault()` unconditionally, so the native `copy` event
 * never fired for any selection the app didn't own — select text in a dialog
 * body, a panel label or a notes preview, press Ctrl+C, and nothing is copied
 * and nothing says so. `isEditableTarget` covered inputs and contentEditables
 * only, because those are the surfaces that *focus*; a range selection over
 * static text focuses nothing, so the guard above never saw it.
 *
 * The caller uses this to let the browser's own copy win. A collapsed caret or a
 * whitespace-only range is not a selection — those fall through to the canvas
 * copy, which is what an idle Ctrl+C should still do.
 */
export const hasLiveTextSelection = (): boolean => {
  if (typeof window === 'undefined' || !window.getSelection) return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return false;
  }
  return selection.toString().trim().length > 0;
};
