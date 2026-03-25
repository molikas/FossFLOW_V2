/**
 * REGRESSION — Lasso mode handler contracts (real module)
 *
 * Tests the ACTUAL Lasso.ts module (not an inline replica).
 * Covers mousedown, mouseup, and mousemove handlers including the guards
 * that were missing and caused the toolbar-click-to-context-menu regression.
 *
 * Classified as VALID: imports the real Lasso module.
 * A regression in Lasso.ts will cause these tests to fail.
 */

import { Lasso } from 'src/interaction/modes/Lasso';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------
const mockIsWithinBounds = jest.fn(() => false);
const mockHasMovedTile = jest.fn(() => false);

jest.mock('src/utils', () => ({
  isWithinBounds: (...args: any[]) => mockIsWithinBounds(...args),
  hasMovedTile: jest.fn(() => false),
  CoordsUtils: { zero: () => ({ x: 0, y: 0 }) },
  getItemByIdOrThrow: jest.fn((arr: any[], id: string) => {
    const found = (arr as any[]).find((item: any) => item.id === id);
    if (!found) throw new Error(`Not found: ${id}`);
    return { index: 0, value: found };
  })
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeUiState(overrides: any = {}) {
  const mode = overrides.mode ?? { type: 'LASSO', selection: null, isDragging: false };
  const mouse = overrides.mouse ?? { position: { tile: { x: 5, y: 5 } }, mousedown: null };
  const actions = overrides.actions ?? { setMode: jest.fn(), setItemControls: jest.fn() };
  return { mode, mouse, actions };
}

function makeScene() {
  return { items: [], rectangles: [], textBoxes: [], connectors: [] };
}

function callMousedown(uiState: any, isRendererInteraction: boolean) {
  Lasso.mousedown!({ uiState, scene: makeScene(), isRendererInteraction } as any);
}

function callMouseup(uiState: any) {
  Lasso.mouseup!({ uiState, scene: makeScene(), isRendererInteraction: true } as any);
}

function callMousemove(uiState: any) {
  Lasso.mousemove!({ uiState, scene: makeScene(), isRendererInteraction: true } as any);
}

// ---------------------------------------------------------------------------
// mousedown
// ---------------------------------------------------------------------------
describe('Lasso.mousedown (real module)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsWithinBounds.mockReturnValue(false);
  });

  it('does nothing when isRendererInteraction is false (toolbar click)', () => {
    const uiState = makeUiState();
    callMousedown(uiState, false);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('does nothing when mode type is not LASSO', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true, mousedownItem: null } });
    callMousedown(uiState, true);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('switches to CURSOR when clicked outside selection (no selection)', () => {
    const uiState = makeUiState();
    callMousedown(uiState, true);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  it('switches to CURSOR when clicked outside existing selection bounds', () => {
    mockIsWithinBounds.mockReturnValue(false);
    const uiState = makeUiState({
      mode: {
        type: 'LASSO',
        selection: { startTile: { x: 0, y: 0 }, endTile: { x: 10, y: 10 }, items: [] },
        isDragging: false
      }
    });
    callMousedown(uiState, true);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  it('sets isDragging=true when clicked inside existing selection bounds', () => {
    mockIsWithinBounds.mockReturnValue(true);
    const uiState = makeUiState({
      mode: {
        type: 'LASSO',
        selection: { startTile: { x: 0, y: 0 }, endTile: { x: 10, y: 10 }, items: [{ type: 'ITEM', id: 'a' }] },
        isDragging: false
      }
    });
    callMousedown(uiState, true);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ isDragging: true })
    );
    // Should NOT switch to CURSOR
    expect(uiState.actions.setMode).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });
});

// ---------------------------------------------------------------------------
// mouseup
// ---------------------------------------------------------------------------
describe('Lasso.mouseup (real module)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does nothing when mode type is not LASSO', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true, mousedownItem: null } });
    callMouseup(uiState);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('does nothing when mouse.mousedown is null (toolbar click guard)', () => {
    const uiState = makeUiState(); // mousedown: null
    callMouseup(uiState);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('switches to CURSOR when no selection (dragged empty area)', () => {
    const uiState = makeUiState({
      mode: { type: 'LASSO', selection: null, isDragging: false },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 2, y: 2 }, screen: { x: 10, y: 10 } }
      }
    });
    callMouseup(uiState);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  it('switches to CURSOR when selection has no items', () => {
    const uiState = makeUiState({
      mode: {
        type: 'LASSO',
        selection: { startTile: { x: 0, y: 0 }, endTile: { x: 5, y: 5 }, items: [] },
        isDragging: false
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 0, y: 0 }, screen: { x: 0, y: 0 } }
      }
    });
    callMouseup(uiState);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  it('stays in LASSO (resets isDragging) when selection has items', () => {
    const uiState = makeUiState({
      mode: {
        type: 'LASSO',
        selection: {
          startTile: { x: 0, y: 0 },
          endTile: { x: 10, y: 10 },
          items: [{ type: 'ITEM', id: 'node1' }]
        },
        isDragging: true
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 0, y: 0 }, screen: { x: 0, y: 0 } }
      }
    });
    callMouseup(uiState);
    // Should NOT switch to CURSOR
    expect(uiState.actions.setMode).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
    // Should call setMode with isDragging: false
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ isDragging: false })
    );
  });
});

// ---------------------------------------------------------------------------
// mousemove
// ---------------------------------------------------------------------------
describe('Lasso.mousemove (real module)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: hasMovedTile returns true (the mouse has moved)
    const { hasMovedTile } = require('src/utils');
    (hasMovedTile as jest.Mock).mockReturnValue(true);
  });

  it('does nothing when mode type is not LASSO', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true, mousedownItem: null } });
    callMousemove(uiState);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('does nothing when mouse.mousedown is null', () => {
    const uiState = makeUiState();
    callMousemove(uiState);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('does nothing when hasMovedTile returns false', () => {
    const { hasMovedTile } = require('src/utils');
    (hasMovedTile as jest.Mock).mockReturnValue(false);

    const uiState = makeUiState({
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 5, y: 5 }, screen: { x: 0, y: 0 } }
      }
    });
    callMousemove(uiState);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('transitions to DRAG_ITEMS when isDragging and selection exists', () => {
    const uiState = makeUiState({
      mode: {
        type: 'LASSO',
        selection: {
          startTile: { x: 0, y: 0 },
          endTile: { x: 10, y: 10 },
          items: [{ type: 'ITEM', id: 'n1' }]
        },
        isDragging: true
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 3, y: 3 }, screen: { x: 0, y: 0 } }
      }
    });
    callMousemove(uiState);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [{ type: 'ITEM', id: 'n1' }],
        initialTiles: {},        // getItemByIdOrThrow throws (n1 not in scene) → caught silently
        initialRectangles: {}
      })
    );
  });

  it('updates selection bounds when drawing a lasso (not isDragging)', () => {
    const uiState = makeUiState({
      mode: { type: 'LASSO', selection: null, isDragging: false },
      mouse: {
        position: { tile: { x: 8, y: 8 } },
        mousedown: { tile: { x: 2, y: 2 }, screen: { x: 0, y: 0 } }
      }
    });
    callMousemove(uiState);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LASSO',
        selection: expect.objectContaining({
          startTile: { x: 2, y: 2 },
          endTile: { x: 8, y: 8 }
        })
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Connector anchor collection (Bug fix: tile-based waypoints move with lasso drag)
// ---------------------------------------------------------------------------
describe('Lasso connector anchor — selection and DRAG_ITEMS initialTiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { hasMovedTile } = require('src/utils');
    (hasMovedTile as jest.Mock).mockReturnValue(true);
    mockIsWithinBounds.mockReturnValue(true); // all tiles within lasso bounds
  });

  it('draws selection — tile-based anchor included as CONNECTOR_ANCHOR, item-based excluded', () => {
    const uiState = makeUiState({
      mode: { type: 'LASSO', selection: null, isDragging: false },
      mouse: {
        position: { tile: { x: 8, y: 8 } },
        mousedown: { tile: { x: 0, y: 0 }, screen: { x: 0, y: 0 } }
      }
    });
    const scene = {
      items: [],
      rectangles: [],
      textBoxes: [],
      connectors: [{
        id: 'c1',
        anchors: [
          { id: 'a-item', ref: { item: 'node1' } },        // item-based — NOT collected
          { id: 'a-tile', ref: { tile: { x: 5, y: 5 } } } // tile-based — SHOULD be collected
        ]
      }]
    };
    Lasso.mousemove!({ uiState, scene, isRendererInteraction: true } as any);

    const call = uiState.actions.setMode.mock.calls[0][0];
    const anchorRefs = call.selection.items.filter((i: any) => i.type === 'CONNECTOR_ANCHOR');
    expect(anchorRefs.map((i: any) => i.id)).toContain('a-tile');
    expect(anchorRefs.map((i: any) => i.id)).not.toContain('a-item');
  });

  it('isDragging → DRAG_ITEMS — CONNECTOR_ANCHOR tile recorded in initialTiles', () => {
    const uiState = makeUiState({
      mode: {
        type: 'LASSO',
        selection: {
          startTile: { x: 0, y: 0 },
          endTile: { x: 10, y: 10 },
          items: [{ type: 'CONNECTOR_ANCHOR', id: 'a-tile' }]
        },
        isDragging: true
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 3, y: 3 }, screen: { x: 0, y: 0 } }
      }
    });
    const scene = {
      items: [],
      rectangles: [],
      textBoxes: [],
      connectors: [{
        id: 'c1',
        anchors: [{ id: 'a-tile', ref: { tile: { x: 4, y: 6 } } }]
      }]
    };
    Lasso.mousemove!({ uiState, scene, isRendererInteraction: true } as any);

    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DRAG_ITEMS',
        initialTiles: { 'a-tile': { x: 4, y: 6 } }
      })
    );
  });

  it('isDragging → DRAG_ITEMS — anchor with ref.item (not tile) is NOT recorded in initialTiles', () => {
    const uiState = makeUiState({
      mode: {
        type: 'LASSO',
        selection: {
          startTile: { x: 0, y: 0 },
          endTile: { x: 10, y: 10 },
          items: [{ type: 'CONNECTOR_ANCHOR', id: 'a-item-ref' }]
        },
        isDragging: true
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 3, y: 3 }, screen: { x: 0, y: 0 } }
      }
    });
    const scene = {
      items: [],
      rectangles: [],
      textBoxes: [],
      connectors: [{
        id: 'c1',
        anchors: [{ id: 'a-item-ref', ref: { item: 'node1' } }] // item-based, no tile
      }]
    };
    Lasso.mousemove!({ uiState, scene, isRendererInteraction: true } as any);

    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DRAG_ITEMS',
        initialTiles: {} // nothing recorded for item-based anchors
      })
    );
  });
});
