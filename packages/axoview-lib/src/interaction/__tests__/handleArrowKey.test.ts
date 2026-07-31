// @ts-nocheck
import { handleArrowKey } from '../handleArrowKey';

// Keep the module dependency-light: handleArrowKey only needs CoordsUtils.add.
jest.mock('src/utils', () => ({
  CoordsUtils: {
    add: (a: { x: number; y: number }, b: { x: number; y: number }) => ({
      x: a.x + b.x,
      y: a.y + b.y
    })
  }
}));

const makeKey = (key: string) => ({ key, preventDefault: jest.fn() });

function makeUiState(overrides = {}) {
  return {
    selectedIds: [],
    scroll: { position: { x: 0, y: 0 }, offset: { x: 0, y: 0 } },
    actions: { setScroll: jest.fn() },
    ...overrides
  };
}

function makeDeps(scene = {}) {
  return {
    getScene: () => ({ items: [], rectangles: [], textBoxes: [], ...scene }),
    beginDragTransaction: jest.fn(),
    commitDragTransaction: jest.fn(),
    batchUpdateViewItemTiles: jest.fn(),
    batchUpdateRectangles: jest.fn(),
    batchUpdateTextBoxTiles: jest.fn()
  };
}

describe('handleArrowKey — selection-aware nudge vs pan (B6)', () => {
  it('pans when nothing nudge-able is selected', () => {
    const uiState = makeUiState();
    const deps = makeDeps();
    expect(handleArrowKey(makeKey('ArrowRight'), uiState, deps)).toBe(true);
    expect(uiState.actions.setScroll).toHaveBeenCalledTimes(1);
    expect(deps.beginDragTransaction).not.toHaveBeenCalled();
    expect(deps.batchUpdateViewItemTiles).not.toHaveBeenCalled();
  });

  it('nudges a selected ITEM one tile in a single transaction (no pan)', () => {
    const uiState = makeUiState({ selectedIds: [{ type: 'ITEM', id: 'n1' }] });
    const deps = makeDeps({ items: [{ id: 'n1', tile: { x: 5, y: 5 } }] });

    expect(handleArrowKey(makeKey('ArrowRight'), uiState, deps)).toBe(true);

    expect(deps.beginDragTransaction).toHaveBeenCalledTimes(1);
    // ArrowRight → dx +1
    expect(deps.batchUpdateViewItemTiles).toHaveBeenCalledWith([
      { id: 'n1', tile: { x: 6, y: 5 } }
    ]);
    expect(deps.commitDragTransaction).toHaveBeenCalledTimes(1);
    expect(uiState.actions.setScroll).not.toHaveBeenCalled();
  });

  it('nudges rectangles and text boxes too', () => {
    const uiState = makeUiState({
      selectedIds: [
        { type: 'RECTANGLE', id: 'r1' },
        { type: 'TEXTBOX', id: 't1' }
      ]
    });
    const deps = makeDeps({
      rectangles: [{ id: 'r1', from: { x: 0, y: 0 }, to: { x: 2, y: 2 } }],
      textBoxes: [{ id: 't1', tile: { x: 3, y: 3 } }]
    });

    // ArrowDown → dy -1
    handleArrowKey(makeKey('ArrowDown'), uiState, deps);

    expect(deps.batchUpdateRectangles).toHaveBeenCalledWith([
      { id: 'r1', from: { x: 0, y: -1 }, to: { x: 2, y: 1 } }
    ]);
    expect(deps.batchUpdateTextBoxTiles).toHaveBeenCalledWith([
      { id: 't1', tile: { x: 3, y: 2 } }
    ]);
    expect(uiState.actions.setScroll).not.toHaveBeenCalled();
  });

  it('pans when only connectors/anchors are selected (not tile-nudge-able)', () => {
    const uiState = makeUiState({
      selectedIds: [{ type: 'CONNECTOR', id: 'c1' }]
    });
    const deps = makeDeps();

    handleArrowKey(makeKey('ArrowUp'), uiState, deps);

    expect(uiState.actions.setScroll).toHaveBeenCalledTimes(1);
    expect(deps.beginDragTransaction).not.toHaveBeenCalled();
  });

  it('returns false for a non-arrow key (not consumed)', () => {
    const uiState = makeUiState();
    expect(handleArrowKey(makeKey('a'), uiState, makeDeps())).toBe(false);
    expect(uiState.actions.setScroll).not.toHaveBeenCalled();
  });
});

// Promoted from the exploratory lane (I3/SEL-01). The batch updaters are the
// DRAG commit path and write `offset: u.offset` unconditionally — deliberately,
// so a drag that re-snaps an item clears the residual by passing `undefined`.
// The nudge passed no offset at all, so every arrow press erased an off-grid
// item's sub-tile residual and snapped it onto the grid: the ADR 0023
// offset-omission class, in its keyboard consumer.
describe('handleArrowKey — the off-grid residual (SEL-01)', () => {
  const OFFSET = { x: -8.7, y: -12.74 };

  it('carries a nudged item’s offset through unchanged', () => {
    const uiState = makeUiState({ selectedIds: [{ type: 'ITEM', id: 'n1' }] });
    const deps = makeDeps({
      items: [{ id: 'n1', tile: { x: 5, y: 5 }, offset: OFFSET }]
    });

    handleArrowKey(makeKey('ArrowRight'), uiState, deps);

    expect(deps.batchUpdateViewItemTiles).toHaveBeenCalledWith([
      { id: 'n1', tile: { x: 6, y: 5 }, offset: OFFSET }
    ]);
  });

  it('carries it for rectangles and text boxes too', () => {
    const uiState = makeUiState({
      selectedIds: [
        { type: 'RECTANGLE', id: 'r1' },
        { type: 'TEXTBOX', id: 't1' }
      ]
    });
    const deps = makeDeps({
      rectangles: [
        { id: 'r1', from: { x: 0, y: 0 }, to: { x: 2, y: 2 }, offset: OFFSET }
      ],
      textBoxes: [{ id: 't1', tile: { x: 3, y: 3 }, offset: OFFSET }]
    });

    handleArrowKey(makeKey('ArrowRight'), uiState, deps);

    expect(deps.batchUpdateRectangles).toHaveBeenCalledWith([
      { id: 'r1', from: { x: 1, y: 0 }, to: { x: 3, y: 2 }, offset: OFFSET }
    ]);
    expect(deps.batchUpdateTextBoxTiles).toHaveBeenCalledWith([
      { id: 't1', tile: { x: 4, y: 3 }, offset: OFFSET }
    ]);
  });

  it('leaves a snapped item’s absent offset absent', () => {
    const uiState = makeUiState({ selectedIds: [{ type: 'ITEM', id: 'n1' }] });
    const deps = makeDeps({ items: [{ id: 'n1', tile: { x: 5, y: 5 } }] });

    handleArrowKey(makeKey('ArrowRight'), uiState, deps);

    expect(deps.batchUpdateViewItemTiles).toHaveBeenCalledWith([
      { id: 'n1', tile: { x: 6, y: 5 }, offset: undefined }
    ]);
  });
});

// Promoted from the exploratory lane (I1/PTR-11) — see
// tests-exploratory/I1-pointer/ptr-04-07-08-11-13.explore.spec.ts in the
// campaign history. The nudge used to assert in a comment that `selectedIds`
// cannot hold locked/hidden refs; E2/RED-15 falsified that (acquisition is
// gated, but locking a layer does not re-validate a live selection), so the
// arrows moved locked items one tile per press while the mouse drag refused.
describe('handleArrowKey — the layer gate (PTR-11)', () => {
  const lockedGate = (lockedId: string) => (ref: { id: string }) =>
    ref.id !== lockedId;

  it('does not nudge a selected item whose layer is locked', () => {
    const uiState = makeUiState({ selectedIds: [{ type: 'ITEM', id: 'n1' }] });
    const deps = {
      ...makeDeps({ items: [{ id: 'n1', tile: { x: 5, y: 5 } }] }),
      isItemInteractable: lockedGate('n1')
    };

    handleArrowKey(makeKey('ArrowRight'), uiState, deps);

    expect(deps.batchUpdateViewItemTiles).not.toHaveBeenCalled();
    expect(deps.beginDragTransaction).not.toHaveBeenCalled();
    // Nothing nudge-able survived the gate, so the keystroke falls back to pan —
    // the same fallback a connectors-only selection takes.
    expect(uiState.actions.setScroll).toHaveBeenCalledTimes(1);
  });

  it('nudges only the unlocked members of a mixed selection', () => {
    const uiState = makeUiState({
      selectedIds: [
        { type: 'ITEM', id: 'locked' },
        { type: 'ITEM', id: 'free' }
      ]
    });
    const deps = {
      ...makeDeps({
        items: [
          { id: 'locked', tile: { x: 0, y: 0 } },
          { id: 'free', tile: { x: 2, y: 2 } }
        ]
      }),
      isItemInteractable: lockedGate('locked')
    };

    handleArrowKey(makeKey('ArrowRight'), uiState, deps);

    expect(deps.batchUpdateViewItemTiles).toHaveBeenCalledWith([
      { id: 'free', tile: { x: 3, y: 2 } }
    ]);
  });

  it('nudges normally when no gate is supplied (no layers configured)', () => {
    const uiState = makeUiState({ selectedIds: [{ type: 'ITEM', id: 'n1' }] });
    const deps = makeDeps({ items: [{ id: 'n1', tile: { x: 5, y: 5 } }] });

    handleArrowKey(makeKey('ArrowRight'), uiState, deps);

    expect(deps.batchUpdateViewItemTiles).toHaveBeenCalledWith([
      { id: 'n1', tile: { x: 6, y: 5 } }
    ]);
  });
});
