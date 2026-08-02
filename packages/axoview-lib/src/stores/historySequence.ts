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
