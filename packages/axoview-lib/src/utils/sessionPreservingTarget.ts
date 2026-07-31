/**
 * The ONE click-away allow-list for the canvas inline editors (ADR 0034 §1).
 *
 * TXT-06: this contract had two implementations and only one of them knew about
 * the strip. `TextBoxInlineEditor` allow-listed `[data-axoview-strip]` and the
 * MUI portal classes; `useInlineRename` — the shared hook behind the floating
 * Label, node-name and connector-label editors — had no such branch, so any
 * capture-phase press outside the editor blurred it. Reaching for the top strip
 * to change a Label's colour or size mid-rename therefore ended the rename,
 * while the same gesture during a TEXT BOX session worked fine.
 *
 * A press on any of these surfaces is part of the edit session, not away from
 * it: the strip drives the live selection, and its own controls open as MUI
 * portals that are DOM-outside the editor but logically inside the session.
 */
const SESSION_PRESERVING_SELECTORS =
  '[data-axoview-strip], .MuiPopover-root, .MuiPopper-root, .MuiModal-root';

export const isSessionPreservingTarget = (
  target: EventTarget | null
): boolean => {
  const el = target as (HTMLElement & { closest?: Element['closest'] }) | null;
  return !!el?.closest?.(SESSION_PRESERVING_SELECTORS);
};
