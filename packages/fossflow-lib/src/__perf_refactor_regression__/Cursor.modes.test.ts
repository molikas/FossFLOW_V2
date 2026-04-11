/**
 * REGRESSION — Cursor mode handler contracts (real module)
 *
 * Tests the ACTUAL Cursor.ts module.
 * Specifically covers the mousedownHandled flag logic that prevents spurious
 * context-menu opening after external setMode calls.
 *
 * Classified as VALID: imports the real Cursor module.
 */

import { Cursor } from 'src/interaction/modes/Cursor';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockGetItemAtTile = jest.fn(() => null);
const mockHasMovedTile = jest.fn(() => false);

jest.mock('src/utils', () => ({
  getItemAtTile: (...args: any[]) => mockGetItemAtTile(...args),
  hasMovedTile: (...args: any[]) => mockHasMovedTile(...args),
  getAnchorAtTile: jest.fn(() => null),
  // Return a realistic result for initialTiles capture; throws are silently caught
  getItemByIdOrThrow: jest.fn((arr: any[], id: string) => {
    const found = (arr as any[]).find((item: any) => item.id === id);
    if (!found) throw new Error(`Not found: ${id}`);
    return { index: 0, value: found };
  }),
  generateId: jest.fn(() => 'new-id'),
  CoordsUtils: {
    zero: () => ({ x: 0, y: 0 }),
    // Real coordinate comparison — drag detection uses this instead of hasMovedTile
    isEqual: (a: any, b: any) => a.x === b.x && a.y === b.y,
    subtract: (a: any, b: any) => ({ x: a.x - b.x, y: a.y - b.y })
  },
  // getAnchorTile returns the anchor's item tile or the tile ref directly
  getAnchorTile: jest.fn((anchor: any) => anchor.ref?.tile ?? { x: 0, y: 0 }),
  // connectorPathTileToGlobal returns the path tile as-is for test simplicity
  connectorPathTileToGlobal: jest.fn((tile: any) => tile),
  setWindowCursor: jest.fn()
}));

// Cursor.ts imports useScene for type only — mock to prevent module resolution errors
jest.mock('src/hooks/useScene', () => ({ useScene: jest.fn() }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeUiState(overrides: any = {}) {
  return {
    mode: overrides.mode ?? {
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null,
      mousedownHandled: false
    },
    mouse: overrides.mouse ?? {
      position: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
      mousedown: null,
      delta: null
    },
    itemControls: overrides.itemControls ?? null,
    actions: overrides.actions ?? {
      setMode: jest.fn(),
      setItemControls: jest.fn(),
      setContextMenu: jest.fn()
    }
  };
}

function makeScene(items: any[] = [], hitConnectors: any[] = []) {
  return {
    connectors: [],
    items,
    rectangles: [],
    textBoxes: [],
    hitConnectors,
    currentView: { items, connectors: [] }
  };
}

function callMousedown(uiState: any, isRendererInteraction: boolean) {
  Cursor.mousedown!({
    uiState,
    scene: makeScene(),
    isRendererInteraction
  } as any);
}

function callMouseup(uiState: any, isRendererInteraction = true) {
  Cursor.mouseup!({
    uiState,
    scene: makeScene(),
    isRendererInteraction
  } as any);
}

function callMousemove(uiState: any, scene = makeScene()) {
  Cursor.mousemove!({ uiState, scene, isRendererInteraction: true } as any);
}

// ---------------------------------------------------------------------------
// mousedown
// ---------------------------------------------------------------------------
describe('Cursor.mousedown (real module)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAtTile.mockReturnValue(null);
  });

  it('does nothing when isRendererInteraction is false', () => {
    const uiState = makeUiState();
    callMousedown(uiState, false);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('does nothing when mode type is not CURSOR', () => {
    const uiState = makeUiState({
      mode: { type: 'LASSO', selection: null, isDragging: false }
    });
    callMousedown(uiState, true);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('sets mousedownHandled=true and mousedownItem when item is at tile', () => {
    mockGetItemAtTile.mockReturnValue({ type: 'ITEM', id: 'node1' });
    const uiState = makeUiState();
    callMousedown(uiState, true);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        mousedownItem: { type: 'ITEM', id: 'node1' },
        mousedownHandled: true
      })
    );
  });

  it('sets mousedownHandled=true and mousedownItem=null on empty tile, clears itemControls', () => {
    mockGetItemAtTile.mockReturnValue(null);
    const uiState = makeUiState();
    callMousedown(uiState, true);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        mousedownItem: null,
        mousedownHandled: true
      })
    );
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// mouseup
// ---------------------------------------------------------------------------
describe('Cursor.mouseup (real module)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasMovedTile.mockReturnValue(false);
  });

  it('does nothing when isRendererInteraction is false', () => {
    const uiState = makeUiState();
    callMouseup(uiState, false);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
    expect(uiState.actions.setContextMenu).not.toHaveBeenCalled();
  });

  it('does nothing when mode type is not CURSOR', () => {
    const uiState = makeUiState({
      mode: { type: 'LASSO', selection: null, isDragging: false }
    });
    callMouseup(uiState);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('sets itemControls for ITEM when mousedownItem is an ITEM and no movement', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: { type: 'ITEM', id: 'node1' },
        mousedownHandled: true
      },
      mouse: {
        position: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        mousedown: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        delta: null
      }
    });
    callMouseup(uiState);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith({
      type: 'ITEM',
      id: 'node1'
    });
  });

  it('sets itemControls for RECTANGLE when mousedownItem is a RECTANGLE and no movement', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: { type: 'RECTANGLE', id: 'rect1' },
        mousedownHandled: true
      },
      mouse: {
        position: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        mousedown: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        delta: null
      }
    });
    callMouseup(uiState);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith({
      type: 'RECTANGLE',
      id: 'rect1'
    });
  });

  it('deselects (setItemControls null) on left-click empty canvas — no context menu, no event', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null,
        mousedownHandled: true
      },
      mouse: {
        position: { tile: { x: 3, y: 4 }, screen: { x: 30, y: 40 } },
        mousedown: { tile: { x: 3, y: 4 }, screen: { x: 30, y: 40 } },
        delta: null
      }
    });
    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');
    callMouseup(uiState);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith(null);
    expect(uiState.actions.setContextMenu).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  it('does NOT open context menu when mousedownHandled is false/undefined (external setMode)', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null,
        mousedownHandled: false // mode was set externally, no preceding mousedown
      },
      mouse: {
        position: { tile: { x: 3, y: 4 }, screen: { x: 30, y: 40 } },
        mousedown: null, // no mousedown recorded
        delta: null
      }
    });
    callMouseup(uiState);
    expect(uiState.actions.setContextMenu).not.toHaveBeenCalled();
  });

  it('does NOT open context menu when mousedownHandled is undefined (external setMode)', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
        // mousedownHandled: not set (undefined)
      },
      mouse: {
        position: { tile: { x: 3, y: 4 }, screen: { x: 30, y: 40 } },
        mousedown: null,
        delta: null
      }
    });
    callMouseup(uiState);
    expect(uiState.actions.setContextMenu).not.toHaveBeenCalled();
  });

  it('resets mousedownItem and mousedownHandled to null/false after mouseup', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: { type: 'ITEM', id: 'n1' },
        mousedownHandled: true
      },
      mouse: {
        position: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        mousedown: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        delta: null
      }
    });
    callMouseup(uiState);
    const lastCall =
      uiState.actions.setMode.mock.calls[
        uiState.actions.setMode.mock.calls.length - 1
      ][0];
    expect(lastCall.mousedownItem).toBeNull();
    expect(lastCall.mousedownHandled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mousemove
// ---------------------------------------------------------------------------
describe('Cursor.mousemove (real module)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when mode type is not CURSOR', () => {
    const uiState = makeUiState({
      mode: { type: 'LASSO', selection: null, isDragging: false }
    });
    Cursor.mousemove!({
      uiState,
      scene: makeScene(),
      isRendererInteraction: true
    } as any);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('does nothing when position tile equals mousedown tile (no drag yet)', () => {
    // position == mousedown → CoordsUtils.isEqual returns true → hasDragged = false
    const uiState = makeUiState({
      mode: {
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: { type: 'ITEM', id: 'n1' },
        mousedownHandled: true
      },
      mouse: {
        position: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        mousedown: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        delta: null
      }
    });
    callMousemove(uiState);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('does nothing when mousedown is null and hasMovedTile is false (no hover update)', () => {
    mockHasMovedTile.mockReturnValue(false);
    const uiState = makeUiState({
      mode: {
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null,
        mousedownHandled: false
      },
      mouse: {
        position: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        mousedown: null,
        delta: null
      }
    });
    callMousemove(uiState);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('transitions to DRAG_ITEMS with showCursor:true when item dragged and position != mousedown', () => {
    // position != mousedown → hasDragged = true → DRAG_ITEMS
    const uiState = makeUiState({
      mode: {
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: { type: 'ITEM', id: 'n1' },
        mousedownHandled: true
      },
      mouse: {
        position: { tile: { x: 8, y: 8 }, screen: { x: 80, y: 80 } },
        mousedown: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        delta: { tile: { x: 3, y: 3 }, screen: { x: 30, y: 30 } }
      }
    });
    // Scene includes the node so initialTiles gets populated
    const scene = makeScene([{ id: 'n1', tile: { x: 5, y: 5 } }]);
    callMousemove(uiState, scene);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [{ type: 'ITEM', id: 'n1' }],
        initialTiles: { n1: { x: 5, y: 5 } },
        initialRectangles: {}
      })
    );
  });

  it('transitions to DRAG_ITEMS with showCursor:true when textbox dragged and position != mousedown', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: { type: 'TEXTBOX', id: 'tb1' },
        mousedownHandled: true
      },
      mouse: {
        position: { tile: { x: 8, y: 5 }, screen: { x: 80, y: 50 } },
        mousedown: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        delta: { tile: { x: 3, y: 0 }, screen: { x: 30, y: 0 } }
      }
    });
    const scene = {
      connectors: [],
      items: [],
      rectangles: [],
      textBoxes: [{ id: 'tb1', tile: { x: 5, y: 5 } }]
    };
    callMousemove(uiState, scene);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DRAG_ITEMS',
        showCursor: true,
        initialTiles: { tb1: { x: 5, y: 5 } }
      })
    );
  });

  it('transitions to LASSO when mousedownItem is null and position != mousedown', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null,
        mousedownHandled: true
      },
      mouse: {
        position: { tile: { x: 8, y: 8 }, screen: { x: 80, y: 80 } },
        mousedown: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        delta: { tile: { x: 3, y: 3 }, screen: { x: 30, y: 30 } }
      }
    });
    callMousemove(uiState);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LASSO' })
    );
  });
});

// ---------------------------------------------------------------------------
// P2: endpoint anchor click → RECONNECT_ANCHOR mode
// ---------------------------------------------------------------------------
describe('Cursor.mousedown — connector endpoint click enters RECONNECT_ANCHOR', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAtTile.mockReturnValue(null);
  });

  // Build a minimal hitConnector whose first anchor's hit tile matches the click position.
  // connectorPathTileToGlobal is mocked to return the tile as-is, so path.tiles[0] === hit tile.
  function makeHitConnector(id: string, anchorTile: { x: number; y: number }) {
    return {
      id,
      anchors: [
        { id: 'a-src', ref: { item: 'node-A' } }, // endpoint — ref.item set
        { id: 'a-tgt', ref: { item: 'node-B' } } // endpoint
      ],
      path: {
        tiles: [anchorTile, { x: anchorTile.x + 3, y: anchorTile.y }],
        rectangle: {
          from: anchorTile,
          to: { x: anchorTile.x + 3, y: anchorTile.y }
        }
      }
    };
  }

  it('enters RECONNECT_ANCHOR when clicking the source endpoint of a selected connector', () => {
    const anchorTile = { x: 5, y: 5 };
    const hitConnector = makeHitConnector('conn-X', anchorTile);
    const uiState = makeUiState({
      mouse: {
        position: { tile: anchorTile, screen: { x: 50, y: 50 } },
        mousedown: null,
        delta: null
      },
      itemControls: { type: 'CONNECTOR', id: 'conn-X' }
    });
    const scene = makeScene([], [hitConnector]);

    Cursor.mousedown!({ uiState, scene, isRendererInteraction: true } as any);

    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RECONNECT_ANCHOR',
        connectorId: 'conn-X',
        anchorId: 'a-src',
        anchorIndex: 0
      })
    );
  });

  it('enters RECONNECT_ANCHOR when clicking the target endpoint of a selected connector', () => {
    const srcTile = { x: 2, y: 2 };
    const tgtTile = { x: 8, y: 8 };
    const hitConnector = {
      id: 'conn-Y',
      anchors: [
        { id: 'a-src', ref: { item: 'node-A' } },
        { id: 'a-tgt', ref: { item: 'node-B' } }
      ],
      path: {
        tiles: [srcTile, tgtTile],
        rectangle: { from: srcTile, to: tgtTile }
      }
    };
    const uiState = makeUiState({
      mouse: {
        position: { tile: tgtTile, screen: { x: 80, y: 80 } },
        mousedown: null,
        delta: null
      },
      itemControls: { type: 'CONNECTOR', id: 'conn-Y' }
    });
    const scene = makeScene([], [hitConnector]);

    Cursor.mousedown!({ uiState, scene, isRendererInteraction: true } as any);

    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RECONNECT_ANCHOR',
        connectorId: 'conn-Y',
        anchorId: 'a-tgt'
      })
    );
  });

  it('falls through to normal item hit-detection when no connector is selected', () => {
    mockGetItemAtTile.mockReturnValue({ type: 'ITEM', id: 'some-node' });
    const uiState = makeUiState({
      mouse: {
        position: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        mousedown: null,
        delta: null
      }
      // itemControls: null — no connector selected
    });

    Cursor.mousedown!({
      uiState,
      scene: makeScene(),
      isRendererInteraction: true
    } as any);

    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        mousedownItem: { type: 'ITEM', id: 'some-node' }
      })
    );
  });

  it('falls through to normal hit-detection when click is not on any anchor tile', () => {
    mockGetItemAtTile.mockReturnValue(null);
    const anchorTile = { x: 5, y: 5 };
    const hitConnector = makeHitConnector('conn-Z', anchorTile);
    const uiState = makeUiState({
      mouse: {
        position: { tile: { x: 9, y: 9 }, screen: { x: 90, y: 90 } },
        mousedown: null,
        delta: null
      },
      itemControls: { type: 'CONNECTOR', id: 'conn-Z' }
    });
    const scene = makeScene([], [hitConnector]);

    Cursor.mousedown!({ uiState, scene, isRendererInteraction: true } as any);

    expect(uiState.actions.setMode).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RECONNECT_ANCHOR' })
    );
  });
});
