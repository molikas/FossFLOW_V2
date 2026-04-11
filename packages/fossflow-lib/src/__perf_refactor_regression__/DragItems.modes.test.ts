/**
 * REGRESSION — DragItems mode handler contracts (real module)
 *
 * Covers entry/exit cursors, zero mouseOffset guard, not-allowed collision
 * cursor, transaction dispatch on mousemove, and CURSOR reset on mouseup.
 */

import { DragItems } from 'src/interaction/modes/DragItems';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockSetWindowCursor = jest.fn();
const mockGetItemAtTile = jest.fn<any, any>(() => null);
const mockGetItemByIdOrThrow = jest.fn((arr: any[], id: string) => {
  const index = arr.findIndex((i: any) => i.id === id);
  if (index === -1) throw new Error(`Not found: ${id}`);
  return { index, value: arr[index] };
});
const mockGetAnchorParent = jest.fn();

jest.mock('src/utils', () => ({
  setWindowCursor: (...args: any[]) => mockSetWindowCursor(...args),
  getItemAtTile: (...args: any[]) => mockGetItemAtTile(...args),
  getItemByIdOrThrow: (...args: any[]) => mockGetItemByIdOrThrow(...args),
  getAnchorParent: (...args: any[]) => mockGetAnchorParent(...args),
  CoordsUtils: {
    subtract: (a: any, b: any) => ({ x: a.x - b.x, y: a.y - b.y }),
    isEqual: (a: any, b: any) => a.x === b.x && a.y === b.y,
    zero: () => ({ x: 0, y: 0 }),
    add: (a: any, b: any) => ({ x: a.x + b.x, y: a.y + b.y })
  }
}));

jest.mock('src/hooks/useScene', () => ({ useScene: jest.fn() }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRendererRef() {
  return { style: { userSelect: '' } } as any;
}

function makeUiState(overrides: any = {}) {
  return {
    mode: overrides.mode ?? {
      type: 'DRAG_ITEMS',
      showCursor: true,
      items: [],
      initialTiles: {},
      initialRectangles: {}
    },
    mouse: overrides.mouse ?? {
      position: { tile: { x: 5, y: 5 } },
      mousedown: { tile: { x: 3, y: 3 } }
    },
    actions: overrides.actions ?? {
      setMode: jest.fn(),
      setItemControls: jest.fn()
    }
  };
}

function makeScene(overrides: any = {}) {
  return {
    items: overrides.items ?? [],
    textBoxes: [],
    rectangles: [],
    connectors: [],
    transaction: jest.fn((fn: () => void) => fn()),
    updateViewItem: jest.fn((_id: any, _update: any, state: any) => state),
    updateTextBox: jest.fn((_id: any, _update: any, state: any) => state),
    updateRectangle: jest.fn((_id: any, _update: any, state: any) => state),
    updateConnector: jest.fn(),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// entry
// ---------------------------------------------------------------------------
describe('DragItems.entry', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets userSelect=none and grabbing cursor when DRAG_ITEMS with mousedown', () => {
    const rendererRef = makeRendererRef();
    const uiState = makeUiState();
    DragItems.entry!({ uiState, rendererRef, scene: makeScene() } as any);
    expect(rendererRef.style.userSelect).toBe('none');
    expect(mockSetWindowCursor).toHaveBeenCalledWith('grabbing');
  });

  it('does nothing when mode type is not DRAG_ITEMS', () => {
    const rendererRef = makeRendererRef();
    const uiState = makeUiState({
      mode: { type: 'CURSOR', showCursor: true, mousedownItem: null }
    });
    DragItems.entry!({ uiState, rendererRef, scene: makeScene() } as any);
    expect(rendererRef.style.userSelect).toBe('');
    expect(mockSetWindowCursor).not.toHaveBeenCalled();
  });

  it('does nothing when mousedown is null', () => {
    const rendererRef = makeRendererRef();
    const uiState = makeUiState({
      mouse: { position: { tile: { x: 5, y: 5 } }, mousedown: null }
    });
    DragItems.entry!({ uiState, rendererRef, scene: makeScene() } as any);
    expect(rendererRef.style.userSelect).toBe('');
    expect(mockSetWindowCursor).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// exit
// ---------------------------------------------------------------------------
describe('DragItems.exit', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resets userSelect to auto and sets default cursor', () => {
    const rendererRef = makeRendererRef();
    rendererRef.style.userSelect = 'none';
    DragItems.exit!({
      rendererRef,
      uiState: makeUiState(),
      scene: makeScene()
    } as any);
    expect(rendererRef.style.userSelect).toBe('auto');
    expect(mockSetWindowCursor).toHaveBeenCalledWith('default');
  });
});

// ---------------------------------------------------------------------------
// mousemove
// ---------------------------------------------------------------------------
describe('DragItems.mousemove', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAtTile.mockReturnValue(null);
  });

  it('does nothing when mode type is not DRAG_ITEMS', () => {
    const uiState = makeUiState({
      mode: { type: 'CURSOR', showCursor: true, mousedownItem: null }
    });
    const scene = makeScene();
    DragItems.mousemove!({ uiState, scene } as any);
    expect(scene.transaction).not.toHaveBeenCalled();
    expect(mockSetWindowCursor).not.toHaveBeenCalled();
  });

  it('does nothing when mousedown is null', () => {
    const uiState = makeUiState({
      mouse: { position: { tile: { x: 5, y: 5 } }, mousedown: null }
    });
    const scene = makeScene();
    DragItems.mousemove!({ uiState, scene } as any);
    expect(scene.transaction).not.toHaveBeenCalled();
  });

  it('skips scene transaction but still sets cursor when mouseOffset is zero', () => {
    // When user drags back to the original tile the offset is {0,0}.
    // The fix: we no longer early-return so items can be repositioned back to
    // their initial tiles. Cursor logic runs (sets grabbing); with no items in
    // the selection the scene transaction is still skipped.
    const uiState = makeUiState({
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 5, y: 5 } } // same tile → zero offset
      }
    });
    const scene = makeScene();
    DragItems.mousemove!({ uiState, scene } as any);
    expect(scene.transaction).not.toHaveBeenCalled();
    expect(mockSetWindowCursor).toHaveBeenCalledWith('grabbing');
  });

  it('sets not-allowed cursor when dragged node collides with external node', () => {
    const externalItem = { type: 'ITEM', id: 'external' };
    mockGetItemAtTile.mockReturnValue(externalItem);

    const uiState = makeUiState({
      mode: {
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [{ type: 'ITEM', id: 'node1' }],
        initialTiles: { node1: { x: 3, y: 3 } },
        initialRectangles: {}
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 3, y: 3 } }
      }
    });
    const scene = makeScene({
      items: [
        { id: 'node1', tile: { x: 3, y: 3 } },
        { id: 'external', tile: { x: 5, y: 5 } }
      ]
    });
    DragItems.mousemove!({ uiState, scene } as any);
    expect(mockSetWindowCursor).toHaveBeenCalledWith('not-allowed');
  });

  it('sets grabbing cursor when no collision', () => {
    mockGetItemAtTile.mockReturnValue(null);

    const uiState = makeUiState({
      mode: {
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [{ type: 'ITEM', id: 'node1' }],
        initialTiles: { node1: { x: 3, y: 3 } },
        initialRectangles: {}
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 3, y: 3 } }
      }
    });
    const scene = makeScene({
      items: [{ id: 'node1', tile: { x: 3, y: 3 } }]
    });
    DragItems.mousemove!({ uiState, scene } as any);
    expect(mockSetWindowCursor).toHaveBeenCalledWith('grabbing');
  });

  it('calls scene.transaction when items have non-zero offset', () => {
    mockGetItemAtTile.mockReturnValue(null);

    const uiState = makeUiState({
      mode: {
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [{ type: 'ITEM', id: 'node1' }],
        initialTiles: { node1: { x: 3, y: 3 } },
        initialRectangles: {}
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 3, y: 3 } }
      }
    });
    const scene = makeScene({
      items: [{ id: 'node1', tile: { x: 3, y: 3 } }]
    });
    DragItems.mousemove!({ uiState, scene } as any);
    expect(scene.transaction).toHaveBeenCalled();
  });

  it('does not call transaction when mode has no items', () => {
    mockGetItemAtTile.mockReturnValue(null);

    const uiState = makeUiState({
      mode: {
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [],
        initialTiles: {},
        initialRectangles: {}
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 3, y: 3 } }
      }
    });
    const scene = makeScene();
    DragItems.mousemove!({ uiState, scene } as any);
    expect(scene.transaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// mouseup
// ---------------------------------------------------------------------------
describe('DragItems.mouseup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('always clears itemControls and switches to CURSOR regardless of drag mode', () => {
    const uiState = makeUiState();
    DragItems.mouseup!({ uiState, scene: makeScene() } as any);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith(null);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      })
    );
  });

  it('switches to CURSOR even when items were being dragged', () => {
    const uiState = makeUiState({
      mode: {
        type: 'DRAG_ITEMS',
        items: [{ type: 'ITEM', id: 'n1' }],
        initialTiles: { n1: { x: 1, y: 1 } },
        initialRectangles: {}
      }
    });
    DragItems.mouseup!({ uiState, scene: makeScene() } as any);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });
});
