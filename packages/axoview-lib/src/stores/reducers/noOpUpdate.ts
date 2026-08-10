/**
 * RED-06 — is this update a write that changes nothing?
 *
 * The reducers signal "nothing happened" by returning the state untouched, and
 * the view dispatcher now honours that signal (it stamps `lastUpdated` only for
 * an action that produced a new model). But an `update*` reducer that assigns
 * `{ ...current, ...updates }` produces a NEW object even when every value is
 * identical, so the signal was never available for the most reachable no-ops:
 *
 *  - committing a page rename with the SAME name (ViewTabs' inline rename
 *    commits on blur/Enter unconditionally, so opening it and pressing Enter is
 *    enough);
 *  - re-writing a property with the value it already has — a strip click on the
 *    already-active colour, a `showLabel` toggle back and forth, and, since the
 *    ADR 0030 bulk fan-out, every member of a homogeneous selection that already
 *    matched the value being applied.
 *
 * Each of those minted a fresh model / views array / view object differing only
 * in `lastUpdated`, so `useDirtyTracker` fired ("unsaved changes"), autosave
 * ran, and history stored an entry whose undo produces no visible change.
 *
 * DELIBERATELY CONSERVATIVE. An object-valued update (`tile`, `offset`, a
 * connector's `anchors`/`labels` array) counts as a change without inspecting
 * it: a deep compare on the hot drag path would cost more than the write it is
 * trying to avoid, and a false "no change" would drop a real edit. Primitives
 * and absent values are compared with `Object.is`, so an explicit reset like
 * `{ width: undefined }` over an already-absent field is correctly a no-op.
 */
export const isNoOpUpdate = (
  current: Record<string, unknown>,
  updates: Record<string, unknown>
): boolean => {
  const keys = Object.keys(updates);
  if (keys.length === 0) return true;
  return keys.every((key) => {
    const next = updates[key];
    if (next !== null && typeof next === 'object') return false;
    return Object.is(current[key], next);
  });
};
