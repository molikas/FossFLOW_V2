import { CoordsUtils } from 'src/utils';
import type { Coords, ItemReference, State } from 'src/types';

// ─── Arrow-key handling: selection-aware nudge OR pan (B6) ───────────────────
//
// Extracted from useInteractionManager (mirrors handleEscapeKey.ts / toolHotkeys.ts)
// so the selection-aware branch is unit-testable in isolation — the full hook
// needs a provider stack to mount. The keydown dispatcher calls handleArrowKey.
//
// B6 (Locked decision, amends ADR 0022 §6): arrow keys used to ALWAYS pan. They
// are now selection-aware:
//   • a canvas selection of nudge-able items (ITEM / RECTANGLE / TEXTBOX) →
//     each arrow press NUDGES the whole selection by ONE tile, as a SINGLE undo
//     transaction (begin → batch updates → commit), so one press = one undo step
//     and repeated presses are separate steps;
//   • nothing nudge-able selected (empty, or a selection of ONLY connectors /
//     anchors, which aren't directly tile-nudge-able) → PAN as before.

// Pan path (ADR 0022 §6): the wasd/ijkl schemes + the speed slider were removed
// with the pan-customization surface. Unchanged from the original handler.
export const KEYBOARD_PAN_SPEED = 20;
export const ARROW_PAN_VECTORS: Record<string, Coords> = {
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
  ArrowLeft: { x: 1, y: 0 },
  ArrowRight: { x: -1, y: 0 }
};

// Nudge path (B6): per-arrow delta in TILE space. The item must move the way the
// user expects to *see* it move for each arrow, in both 2D and ISOMETRIC.
//
// Mapping derivation — how a tile delta maps to screen, from DragItems'
// tileDeltaToPixels (the authority both modes' drags use):
//   • 2D:  screen.x = +dx·TILE,  screen.y = -dy·TILE
//          → tile +x = screen-right; tile +y = screen-UP (screen Y grows down).
//   • ISO: screen.x = halfW·(dx-dy), screen.y = -halfH·(dx+dy)
//          → +x and +y are the two diagonal grid axes; a single-axis step moves
//            the item consistently along that diagonal.
// We want each arrow to push the item in its own direction, so (using the 2D
// signs, which also read sensibly along the ISO diagonals):
//   ArrowRight → screen-right → dx = +1
//   ArrowLeft  → screen-left  → dx = -1
//   ArrowUp    → screen-up    → screen.y < 0 ⇒ dy = +1   (because screen.y = -dy·TILE)
//   ArrowDown  → screen-down  → screen.y > 0 ⇒ dy = -1
// (Note this is NOT the negation of ARROW_PAN_VECTORS: pan moves the CAMERA, a
// nudge moves the OBJECT, and the existing pan X-signs were already authored
// camera-style — so deriving the nudge from the tile→screen math directly, as
// above, is the reliable source of truth.)
export const ARROW_TILE_DELTAS: Record<string, Coords> = {
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }
};

// Refs of selectable item types that can be tile-nudged. CONNECTOR /
// CONNECTOR_ANCHOR are excluded — they aren't directly tile-nudge-able here, so a
// connectors-only selection falls back to pan.
//
// R5/OVL-14: LABEL was missing, so the arrow keys PANNED the canvas with a
// floating Label selected — the one canvas entity with no keyboard nudge at all,
// while the mouse drag moved it fine. Labels are tile-anchored like everything
// else here (ADR 0031); being outside the TILE HIT-TEST is what makes them
// special, and that has nothing to do with nudging a ref that is already
// selected.
const NUDGEABLE_TYPES = new Set<ItemReference['type']>([
  'ITEM',
  'RECTANGLE',
  'TEXTBOX',
  'LABEL'
]);

// Minimal scene shape the nudge needs to read CURRENT positions (the batch
// updaters take absolute target tiles). Kept structural so this module stays
// dependency-free and unit-testable (mirrors selectableRefs' SelectableScene).
// `offset` is the ADR 0023 sub-tile residual. It must be READ here and written
// back unchanged: the batch updaters below are the drag commit path, and they
// write `offset: u.offset` unconditionally — that is deliberate, because a drag
// that re-snaps an item clears the residual by passing `undefined`. A nudge
// never re-snaps, so omitting the field erased the residual and slid the item
// onto the grid (I3/SEL-01 — the ADR 0023 offset-omission class in its keyboard
// consumer).
interface NudgeScene {
  items: { id: string; tile: Coords; offset?: Coords }[];
  rectangles: { id: string; from: Coords; to: Coords; offset?: Coords }[];
  textBoxes: { id: string; tile: Coords; offset?: Coords }[];
  /** Optional so partial scenes (tests, older callers) keep compiling. */
  labels?: { id: string; tile: Coords; offset?: Coords }[];
}

// Minimal dependency surface for the arrow handler — a structural subset of
// useInteractionManager's KeydownDeps. Scene is read via a ref getter so the
// keydown effect's dep array stays stable (M-1 perf invariant), matching how
// handleSelectAll reads sceneRef.current.
export interface ArrowKeyDeps {
  getScene: () => NudgeScene;
  /**
   * Layer gate — false for a ref whose layer is locked or hidden (I3/PTR-11).
   * The same predicate every pointer path consults (`State.isItemInteractable`).
   * Optional so unit tests and callers with no layer context keep working; when
   * absent every selected ref is treated as nudge-able, which is what a diagram
   * with no layers configured means anyway.
   */
  isItemInteractable?: (ref: ItemReference) => boolean;
  beginDragTransaction: () => void;
  commitDragTransaction: () => void;
  batchUpdateViewItemTiles: (
    updates: { id: string; tile: Coords; offset?: Coords }[]
  ) => void;
  batchUpdateRectangles: (
    updates: { id: string; from: Coords; to: Coords; offset?: Coords }[]
  ) => void;
  batchUpdateTextBoxTiles: (
    updates: { id: string; tile: Coords; offset?: Coords }[]
  ) => void;
  /** Optional (OVL-14) so callers that predate the Label nudge still compile. */
  batchUpdateLabelTiles?: (
    updates: { id: string; tile: Coords; offset?: Coords }[]
  ) => void;
}

// Pan the canvas by one arrow step (unchanged behaviour). Internal.
const pan = (e: KeyboardEvent, uiState: State['uiState']): boolean => {
  const unit = ARROW_PAN_VECTORS[e.key];
  if (!unit) return false;
  e.preventDefault();
  const currentScroll = uiState.scroll;
  uiState.actions.setScroll({
    position: CoordsUtils.add(currentScroll.position, {
      x: unit.x * KEYBOARD_PAN_SPEED,
      y: unit.y * KEYBOARD_PAN_SPEED
    }),
    offset: currentScroll.offset
  });
  return true;
};

// Nudge every nudge-able selected item by one tile. Returns false when there is
// nothing nudge-able selected (caller then falls back to pan). The whole nudge
// is wrapped in a begin/commit drag transaction so one arrow press = one undo
// step (repeated presses are separate steps). The batch updaters are the same
// DRAG-ONLY, immer-free path DragItems commits with — they require an open drag
// transaction, which begin/commit provides here.
const nudge = (
  e: KeyboardEvent,
  uiState: State['uiState'],
  deps: ArrowKeyDeps
): boolean => {
  const delta = ARROW_TILE_DELTAS[e.key];
  if (!delta) return false;

  // selectedIds is the persistent multi-selection (a single selected item is
  // len === 1 there). Filter to the nudge-able types; a selection of ONLY
  // connectors/anchors yields none → fall back to pan.
  //
  // I1/PTR-11: this used to carry a comment asserting `selectedIds` cannot hold
  // locked or hidden refs (ADR 0006 §3) and therefore needed no lock/hide gate.
  // E2/RED-15 falsified that — ACQUISITION is gated (Ctrl+A, lasso and click all
  // consult the predicate), but locking or hiding a layer does not re-validate a
  // selection that is already live. The arrows then moved items on a locked
  // layer one tile per press, and kept moving them, while a mouse drag on the
  // same items was refused. Re-check the gate here, per press.
  const gate = deps.isItemInteractable ?? (() => true);
  const selected = uiState.selectedIds.filter(
    (ref) => NUDGEABLE_TYPES.has(ref.type) && gate(ref)
  );
  if (selected.length === 0) return false;

  e.preventDefault();

  const scene = deps.getScene();
  const selectedIds = new Set(selected.map((ref) => ref.id));

  // Read CURRENT positions and add the tile delta. Missing items are skipped
  // (don't crash on a stale ref) — the batch updaters also no-op on empty input.
  const itemUpdates = scene.items
    .filter((it) => selectedIds.has(it.id))
    .map((it) => ({
      id: it.id,
      tile: CoordsUtils.add(it.tile, delta),
      offset: it.offset
    }));
  const rectUpdates = scene.rectangles
    .filter((r) => selectedIds.has(r.id))
    .map((r) => ({
      id: r.id,
      from: CoordsUtils.add(r.from, delta),
      to: CoordsUtils.add(r.to, delta),
      offset: r.offset
    }));
  const textBoxUpdates = scene.textBoxes
    .filter((tb) => selectedIds.has(tb.id))
    .map((tb) => ({
      id: tb.id,
      tile: CoordsUtils.add(tb.tile, delta),
      offset: tb.offset
    }));
  const labelUpdates = (scene.labels ?? [])
    .filter((l) => selectedIds.has(l.id))
    .map((l) => ({
      id: l.id,
      tile: CoordsUtils.add(l.tile, delta),
      offset: l.offset
    }));

  if (
    itemUpdates.length === 0 &&
    rectUpdates.length === 0 &&
    textBoxUpdates.length === 0 &&
    labelUpdates.length === 0
  ) {
    // Selection referenced only missing items — nothing to move, and we must
    // NOT open a dangling transaction. Consume the key (it WAS a nudge intent).
    return true;
  }

  // One begin/commit bracket = one undo entry for the whole multi-item nudge.
  deps.beginDragTransaction();
  if (itemUpdates.length > 0) deps.batchUpdateViewItemTiles(itemUpdates);
  if (rectUpdates.length > 0) deps.batchUpdateRectangles(rectUpdates);
  if (textBoxUpdates.length > 0) deps.batchUpdateTextBoxTiles(textBoxUpdates);
  if (labelUpdates.length > 0) deps.batchUpdateLabelTiles?.(labelUpdates);
  deps.commitDragTransaction();

  return true;
};

// Arrow keys: nudge the selection if anything nudge-able is selected, else pan.
// Returns true when the key was an arrow (and thus consumed). The text-field
// guard is applied by the caller (the keydown dispatcher returns on
// isEditableTarget before reaching here), exactly as the pan path always was.
//
// The two halves have different read-only access classes (readonlyPolicy):
// `arrowNudge` is an `editor` surface, `arrowPan` a `viewer` one. With
// `allowNudge` false the nudge branch is skipped entirely, so a viewer's arrows
// always pan — which is what they did before B6 made them selection-aware.
export const handleArrowKey = (
  e: KeyboardEvent,
  uiState: State['uiState'],
  deps: ArrowKeyDeps,
  allowNudge = true
): boolean => {
  if (allowNudge && nudge(e, uiState, deps)) return true;
  return pan(e, uiState);
};
