// D-7 dual-stack undo fix — logical-action sequence stamping.
//
// Undo/redo is two independent immer patch stacks (modelStore + sceneStore).
// A model-only action (lone-node drag, place-icon) pushes a model entry but the
// scene store's no-op branch pushes nothing, so the two stacks drift to
// different depths. Stepping them in lockstep then pops entries belonging to
// DIFFERENT logical actions (behaviour-map §4.5 — the invisible-connector
// symptom).
//
// The fix: every history entry a store's set() pushes is stamped with a
// monotonic logical-action sequence shared by BOTH stores. One logical action
// allocates ONE sequence at its boundary (a standalone set, a transaction, or a
// beginDragTransaction); whichever store(s) commit for that action stamp the
// SAME value. useHistory then undoes only the stack(s) whose top entry carries
// the highest sequence (redo: the lowest future sequence) — so one keystroke
// reverts exactly one logical action across whichever store(s) participated.
//
// The counter is module-global. Values are only ever compared between the two
// stores of one provider pair, and the counter is strictly monotonic, so the
// relative ordering within a pair is always correct even if other provider
// pairs (e.g. parallel tests) interleave allocations.

let counter = 0;

// E1/HIST-10 — the PAGE half of a logical action's identity.
//
// The owner ruling ("always navigate", DECISIONS.md 2026-07-30) needs each
// history entry to know the page that was active when its action was performed,
// so undo/redo can switch to it and the effect of a step is never off-screen.
// That page is a property of the LOGICAL ACTION, not of a store, so it is
// recorded at the same boundary as the sequence and read the same way: both
// stores stamp whatever `currentHistoryViewId()` returns while they commit for
// that action, so their two halves agree BY CONSTRUCTION rather than by two
// independent reads of `uiState.view` (modelStore/sceneStore are created by
// providers that sit OUTSIDE UiStateProvider and cannot reach it).
//
// `undefined` means "this action has no page context" — a document-level edit
// (title, description, colours) or a store `set()` called directly, with no
// coordinator to supply one. It is read as "do not navigate", never as
// "navigate to views[0]".
let viewId: string | undefined;

/**
 * Open a new logical action — allocate and return the next sequence. Call once
 * at each logical-action boundary; the store set()s that follow stamp their
 * entries with `currentHistorySequence()` (the value returned here) and
 * `currentHistoryViewId()`.
 *
 * @param activeViewId the page the action is being performed on, when the
 * caller knows it. Coordinators (`useSceneActions`, `useLayerActions`,
 * `useHistory`) pass `uiState.view`; a bare store `set()` has no page context
 * and passes nothing, which clears the register for that action.
 */
export const allocateHistorySequence = (activeViewId?: string): number => {
  counter += 1;
  // '' is uiStateStore's pre-boot value, not a page — normalise it away so no
  // entry is ever stamped with an id that can never match a view.
  viewId = activeViewId || undefined;
  return counter;
};

/**
 * The sequence of the logical action currently being stamped. Read (do not
 * allocate) so a second store committing for the same action stamps the same
 * value the first store stamped.
 */
export const currentHistorySequence = (): number => {
  return counter;
};

/**
 * The page of the logical action currently being stamped, or `undefined` when
 * it has none. Same read-don't-allocate contract as `currentHistorySequence`,
 * and the same in-flight caveat: a `allocateHistorySequence()` that lands
 * between a drag's begin and its commit re-points this register exactly as it
 * re-points the counter (E1/HIST-07 is the guard against that class).
 */
export const currentHistoryViewId = (): string | undefined => {
  return viewId;
};

/**
 * E1/HIST-03 — the history window, expressed in LOGICAL ACTIONS rather than in
 * per-store entries.
 *
 * The cap used to be "50 entries, per store, trimmed independently", and the two
 * stores fill at different rates: a model-only action (place an icon, rename)
 * pushes a model entry and nothing on the scene side. Fifty of those after one
 * both-stores action evicted that action's MODEL half while its SCENE half sat
 * at the bottom of the scene stack — so draining the stacks eventually stepped
 * the scene half alone and reverted half an action that nothing could complete.
 * For a connector `resyncScene` re-routed the orphan and hid it; for a text box
 * it left a model box with no scene size, permanently (INV-5b).
 *
 * The fix is to make the retained set a property of the SEQUENCE space, which
 * both stores already share, instead of a property of each stack's length: keep
 * the newest `maxActions` logical actions and drop everything older. Both stores
 * evaluate the identical predicate against the identical counter, so the two
 * halves of one action are always retained together or dropped together — the
 * pairing holds by construction rather than by coordination, and neither store
 * needs to see the other.
 *
 * Entries are appended in allocation order and `seq` is monotonic, so the
 * retained set is always a SUFFIX; the common case (nothing to drop) returns the
 * same array reference, so this is free to call from a read.
 *
 * Two consequences worth stating rather than discovering:
 *  - an action that pushed to neither store still consumes a slot, so the
 *    effective depth can be under `maxActions` entries. HIST-15's ruling (keep
 *    the silent cap, document it) is unchanged; the cap now means "the last N
 *    actions", which is the thing a user would have guessed anyway.
 *  - the counter is module-global, so a SECOND provider pair recording history
 *    would age this one's window. The only second `<Axoview>` today is the
 *    hidden export Renderer (ADR 0025), and it loads through
 *    `useInitialDataManager` with `skipHistory`, so it allocates nothing. A
 *    future instance that records would need a per-pair counter — the same
 *    caveat, and the same fix, as the sequence itself.
 */
export const retainWithinHistoryWindow = <T extends { seq: number }>(
  past: T[],
  maxActions: number
): T[] => {
  const floor = counter - maxActions;
  if (past.length === 0 || past[0].seq > floor) return past;
  let first = 0;
  while (first < past.length && past[first].seq <= floor) first += 1;
  return past.slice(first);
};
