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
const mockGetItemByIdOrThrow = jest.fn<any, any>((arr: any[], id: string) => {
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
  // ADR 0023 collision predicate — default to colliding (matches the real impl
  // for items without snap/collides fields, which these fixtures use).
  itemCollides: (item: any) => item?.collides ?? item?.snap !== false,
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
      setItemControls: jest.fn(),
      setLabelMoves: jest.fn(),
      clearLabelMoves: jest.fn()
    },
    canvasMode: overrides.canvasMode ?? 'ISOMETRIC'
  };
}

function makeScene(overrides: any = {}) {
  return {
    items: overrides.items ?? [],
    textBoxes: [],
    rectangles: [],
    labels: overrides.labels ?? [],
    connectors: [],
    transaction: jest.fn((fn: () => void) => fn()),
    batchUpdateLabelTiles: jest.fn(),
    updateViewItem: jest.fn((_id: any, _update: any, state: any) => state),
    updateTextBox: jest.fn((_id: any, _update: any, state: any) => state),
    updateRectangle: jest.fn((_id: any, _update: any, state: any) => state),
    updateConnector: jest.fn(),
    beginDragTransaction: jest.fn(),
    commitDragTransaction: jest.fn(),
    batchUpdateViewItemTiles: jest.fn(),
    batchUpdateRectangles: jest.fn(),
    batchUpdateTextBoxTiles: jest.fn(),
    previewConnectorPaths: jest.fn(),
    ...overrides
  };
}

function makeUiStateWithCanvasMode(
  overrides: any = {},
  canvasMode: 'ISOMETRIC' | '2D' = 'ISOMETRIC'
) {
  return { ...makeUiState(overrides), canvasMode };
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

  // MQA #7 — DragItems must open a drag transaction on entry so per-tick
  // model writes during a multi-element drag skip produceWithPatches and only
  // one history entry covers the whole drag. Unwiring this re-introduces the
  // GC cliff (heap climbs to ~160 MB, FPS collapses to ~10 fps).
  it('opens a drag transaction on entry', () => {
    const rendererRef = makeRendererRef();
    const uiState = makeUiState();
    const scene = makeScene();
    DragItems.entry!({ uiState, rendererRef, scene } as any);
    expect(scene.beginDragTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not open a drag transaction when entry early-returns', () => {
    const rendererRef = makeRendererRef();
    const uiState = makeUiState({
      mode: { type: 'CURSOR', showCursor: true, mousedownItem: null }
    });
    const scene = makeScene();
    DragItems.entry!({ uiState, rendererRef, scene } as any);
    expect(scene.beginDragTransaction).not.toHaveBeenCalled();
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

  // Safety net mirroring ReconnectAnchor: any mode exit (escape, programmatic
  // switch, or normal mouseup) commits the open drag transaction. Without
  // this, an interrupted drag would leave pendingPreFrozen=true and the next
  // drag would mis-attribute its undo history.
  it('commits the drag transaction on exit', () => {
    const scene = makeScene();
    DragItems.exit!({
      rendererRef: makeRendererRef(),
      uiState: makeUiState(),
      scene
    } as any);
    expect(scene.commitDragTransaction).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// mousemove
// ---------------------------------------------------------------------------
describe('DragItems.mousemove', () => {
  beforeEach(() => {
    // Reset module-level previewTiles BEFORE clearing mocks, so the exit()
    // call's side-effects don't leak into mock counts.
    DragItems.exit!({
      rendererRef: makeRendererRef(),
      uiState: makeUiState(),
      scene: makeScene()
    } as any);
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

  // Path 4-true (experimental): mousemove no longer wraps node moves in
  // scene.transaction — items use CSS preview, only textboxes/rectangles/
  // anchors still go through the transaction path. With items-only drag,
  // scene.transaction should NOT be called.
  it('does NOT call scene.transaction for node-only drag (CSS preview path)', () => {
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
    expect(scene.transaction).not.toHaveBeenCalled();
    expect(scene.previewConnectorPaths).toHaveBeenCalledTimes(1);
  });

  // MQA #7 Path 4-true (experimental) — DragItems must NOT write to the model
  // during mousemove. It applies a CSS preview via direct DOM mutation and
  // calls previewConnectorPaths to refresh wires; the model commit only
  // happens on mouseup. Regressing here re-introduces immer-based per-tick
  // reducer chains.
  it('skips model writes during mousemove (CSS preview only) and calls previewConnectorPaths', () => {
    mockGetItemAtTile.mockReturnValue(null);

    const uiState = makeUiState({
      mode: {
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [
          { type: 'ITEM', id: 'node1' },
          { type: 'ITEM', id: 'node2' }
        ],
        initialTiles: {
          node1: { x: 3, y: 3 },
          node2: { x: 4, y: 3 }
        },
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
        { id: 'node2', tile: { x: 4, y: 3 } }
      ]
    });
    DragItems.mousemove!({ uiState, scene } as any);
    expect(scene.updateViewItem).not.toHaveBeenCalled();
    expect(scene.batchUpdateViewItemTiles).not.toHaveBeenCalled();
    expect(scene.previewConnectorPaths).toHaveBeenCalledTimes(1);
    // Preview tiles map should contain both items at the expected target tiles.
    const previewMap = scene.previewConnectorPaths.mock.calls[0][0];
    expect(previewMap.get('node1')).toEqual({ x: 5, y: 5 });
    expect(previewMap.get('node2')).toEqual({ x: 6, y: 5 });
  });

  it('mouseup commits accumulated preview tiles to model via batchUpdateViewItemTiles', () => {
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
    // Establish preview via mousemove first.
    DragItems.mousemove!({ uiState, scene } as any);
    // Now mouseup should commit.
    DragItems.mouseup!({ uiState, scene } as any);
    expect(scene.batchUpdateViewItemTiles).toHaveBeenCalledTimes(1);
    const call = scene.batchUpdateViewItemTiles.mock.calls[0][0];
    expect(call).toEqual([{ id: 'node1', tile: { x: 5, y: 5 } }]);
  });

  // MQA #7 Path 4-true (waypoint preview) — when a connector waypoint anchor
  // is also being dragged (lasso includes both endpoints + the waypoint),
  // DragItems must route the waypoint move through previewConnectorPaths'
  // second-argument anchor preview map — NOT through scene.transaction +
  // scene.updateConnector. If we went through the reducer, syncConnector
  // would re-route the connector against the STALE model item tiles (Path
  // 4-true skips item-tile model writes), stomping the preview path. Visual
  // bug: connector endpoints flicker between correct preview position and
  // detour-to-stale-item-position path. See known_issues.md MQA #7 for the
  // full diagnosis.
  it('routes waypoint anchor drags through previewConnectorPaths (not scene.updateConnector)', () => {
    mockGetItemAtTile.mockReturnValue(null);
    const uiState = makeUiState({
      mode: {
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [
          { type: 'ITEM', id: 'node1' },
          { type: 'ITEM', id: 'node2' },
          { type: 'CONNECTOR_ANCHOR', id: 'wp1' }
        ],
        initialTiles: {
          node1: { x: 3, y: 3 },
          node2: { x: 4, y: 3 },
          wp1: { x: 5, y: 4 }
        },
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
        { id: 'node2', tile: { x: 4, y: 3 } }
      ]
    });
    DragItems.mousemove!({ uiState, scene } as any);

    // Critical: scene.updateConnector MUST NOT be called for the waypoint
    // during the drag — otherwise its syncConnector races our preview write.
    expect(scene.updateConnector).not.toHaveBeenCalled();
    expect(scene.previewConnectorPaths).toHaveBeenCalledTimes(1);

    // The waypoint's new tile must be in the anchor preview map (second arg).
    const [itemPreview, anchorPreview] =
      scene.previewConnectorPaths.mock.calls[0];
    expect(anchorPreview).toBeInstanceOf(Map);
    expect(anchorPreview.get('wp1')).toEqual({ x: 7, y: 6 });
    // And items still in the item preview map (first arg).
    expect(itemPreview.get('node1')).toEqual({ x: 5, y: 5 });
    expect(itemPreview.get('node2')).toEqual({ x: 6, y: 5 });
  });

  // Anchor re-anchoring (drop onto another item / anchor / tile) is a
  // separate, rare path that's NOT in the lasso drag hot path. It should
  // still go through scene.updateConnector inside scene.transaction.
  it('routes anchor RECONNECT (no initialTiles entry) through scene.transaction', () => {
    mockGetItemAtTile.mockReturnValue(null);
    const fakeConnector = {
      id: 'conn1',
      anchors: [
        { id: 'wp1', ref: { tile: { x: 0, y: 0 } } },
        { id: 'wp2', ref: { tile: { x: 5, y: 5 } } }
      ]
    };
    mockGetAnchorParent.mockReturnValue(fakeConnector);
    const uiState = makeUiState({
      mode: {
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [{ type: 'CONNECTOR_ANCHOR', id: 'wp1' }],
        // No initialTiles entry for wp1 → triggers reconnect branch
        initialTiles: {},
        initialRectangles: {}
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 3, y: 3 } }
      }
    });
    const scene = makeScene({
      items: [],
      connectors: [fakeConnector]
    });
    DragItems.mousemove!({ uiState, scene } as any);
    expect(scene.transaction).toHaveBeenCalledTimes(1);
    expect(scene.updateConnector).toHaveBeenCalledTimes(1);
    // No item preview, no waypoint preview either — nothing to overlay
    expect(scene.previewConnectorPaths).not.toHaveBeenCalled();
  });

  it('mouseup commits accumulated waypoint preview to the model', () => {
    mockGetItemAtTile.mockReturnValue(null);
    const fakeConnector = {
      id: 'conn1',
      anchors: [
        { id: 'ep1', ref: { item: 'node1' } },
        { id: 'wp1', ref: { tile: { x: 5, y: 4 } } },
        { id: 'ep2', ref: { item: 'node2' } }
      ]
    };
    mockGetAnchorParent.mockReturnValue(fakeConnector);
    const uiState = makeUiState({
      mode: {
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [
          { type: 'ITEM', id: 'node1' },
          { type: 'ITEM', id: 'node2' },
          { type: 'CONNECTOR_ANCHOR', id: 'wp1' }
        ],
        initialTiles: {
          node1: { x: 3, y: 3 },
          node2: { x: 4, y: 3 },
          wp1: { x: 5, y: 4 }
        },
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
        { id: 'node2', tile: { x: 4, y: 3 } }
      ],
      connectors: [fakeConnector]
    });
    DragItems.mousemove!({ uiState, scene } as any);
    DragItems.mouseup!({ uiState, scene } as any);

    // Items commit
    expect(scene.batchUpdateViewItemTiles).toHaveBeenCalledTimes(1);
    // Waypoint commit — one scene.updateConnector with the full updated
    // anchors array (per-connector, not per-anchor).
    expect(scene.updateConnector).toHaveBeenCalledTimes(1);
    const [connId, newConnector] = scene.updateConnector.mock.calls[0];
    expect(connId).toBe('conn1');
    // Waypoint anchor ref should now be at the dragged tile.
    const wp = newConnector.anchors.find((a: any) => a.id === 'wp1');
    expect(wp.ref.tile).toEqual({ x: 7, y: 6 });
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

  // MQA #7 — Commit fires before the mode switch so the open drag transaction
  // closes with one history entry. Matches Connector / ReconnectAnchor order:
  // preview writes → commit → mode change.
  it('commits drag transaction before switching mode', () => {
    const uiState = makeUiState();
    const scene = makeScene();
    DragItems.mouseup!({ uiState, scene } as any);
    expect(scene.commitDragTransaction).toHaveBeenCalledTimes(1);
    const commitOrder = scene.commitDragTransaction.mock.invocationCallOrder[0];
    const setModeOrder = uiState.actions.setMode.mock.invocationCallOrder[0];
    expect(commitOrder).toBeLessThan(setModeOrder);
  });
});

// ---------------------------------------------------------------------------
// PERF — rectangle / textbox MOVE uses the CSS-preview compositor path (RECT-1):
// a translate3d during the drag (no per-frame model write → no re-render and no
// full-area repaint — the sluggish big-square drag), with the model committed
// once on mouseup via the immer-free batchUpdate path. This locks the routing.
// ---------------------------------------------------------------------------
describe('DragItems — rectangle/textbox CSS-preview move (perf, RECT-1)', () => {
  beforeEach(() => {
    DragItems.exit!({
      rendererRef: makeRendererRef(),
      uiState: makeUiState(),
      scene: makeScene()
    } as any);
    jest.clearAllMocks();
    mockGetItemAtTile.mockReturnValue(null);
  });

  it('rectangle move: CSS-only during mousemove, batchUpdateRectangles once on mouseup', () => {
    const uiState = makeUiState({
      mode: {
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [{ type: 'RECTANGLE', id: 'rect1' }],
        initialTiles: {},
        initialRectangles: { rect1: { from: { x: 0, y: 0 }, to: { x: 2, y: 2 } } }
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 3, y: 3 } } // offset {2,2}
      }
    });
    const scene = makeScene({
      rectangles: [{ id: 'rect1', from: { x: 0, y: 0 }, to: { x: 2, y: 2 } }]
    });

    // During the drag: CSS-only preview — NO per-frame model write (the repaint
    // cliff), and certainly not the old full-state-immer reducer path.
    DragItems.mousemove!({ uiState, scene } as any);
    expect(scene.batchUpdateRectangles).not.toHaveBeenCalled();
    expect(scene.updateRectangle).not.toHaveBeenCalled();
    expect(scene.transaction).not.toHaveBeenCalled();

    // On mouseup: commit the accumulated final position once.
    DragItems.mouseup!({ uiState, scene } as any);
    expect(scene.batchUpdateRectangles).toHaveBeenCalledTimes(1);
    expect(scene.batchUpdateRectangles).toHaveBeenCalledWith([
      { id: 'rect1', from: { x: 2, y: 2 }, to: { x: 4, y: 4 } }
    ]);
  });

  it('textbox move: CSS-only during mousemove, batchUpdateTextBoxTiles once on mouseup', () => {
    const uiState = makeUiState({
      mode: {
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [{ type: 'TEXTBOX', id: 'tb1' }],
        initialTiles: { tb1: { x: 1, y: 1 } },
        initialRectangles: {}
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 3, y: 3 } } // offset {2,2}
      }
    });
    const scene = makeScene({
      textBoxes: [{ id: 'tb1', tile: { x: 1, y: 1 } }]
    });

    DragItems.mousemove!({ uiState, scene } as any);
    expect(scene.batchUpdateTextBoxTiles).not.toHaveBeenCalled();
    expect(scene.updateTextBox).not.toHaveBeenCalled();
    expect(scene.transaction).not.toHaveBeenCalled();

    DragItems.mouseup!({ uiState, scene } as any);
    expect(scene.batchUpdateTextBoxTiles).toHaveBeenCalledTimes(1);
    expect(scene.batchUpdateTextBoxTiles).toHaveBeenCalledWith([
      { id: 'tb1', tile: { x: 3, y: 3 } }
    ]);
  });
});

// ---------------------------------------------------------------------------
// Floating-label GROUP move (ADR 0031). A label is canvas-drawn (SceneCanvas)
// with no [data-drag-id] DOM element, so — unlike nodes/rectangles/text boxes —
// it cannot carry a CSS `--ff-drag-*` preview. Its live preview instead rides the
// uiState `labelMoves` channel, which SceneCanvas reads. REGRESSION GUARD: two
// reported bugs, (1) the label wasn't seeded so it never moved at all, and (2)
// once seeded it moved on COMMIT but showed no live preview (looked frozen). This
// locks both: the preview is published during the drag AND committed once + the
// preview cleared on mouseup.
// ---------------------------------------------------------------------------
describe('DragItems — floating-label group move (ADR 0031)', () => {
  beforeEach(() => {
    DragItems.exit!({
      rendererRef: makeRendererRef(),
      uiState: makeUiState(),
      scene: makeScene()
    } as any);
    jest.clearAllMocks();
    mockGetItemAtTile.mockReturnValue(null);
  });

  it('publishes the live labelMoves preview during mousemove (no model write yet)', () => {
    const uiState = makeUiState({
      mode: {
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [{ type: 'LABEL', id: 'lbl1' }],
        initialTiles: { lbl1: { x: 1, y: 1 } },
        initialRectangles: {}
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 3, y: 3 } } // offset {2,2}
      }
    });
    const scene = makeScene({
      labels: [{ id: 'lbl1', tile: { x: 1, y: 1 }, text: 'x' }]
    });

    DragItems.mousemove!({ uiState, scene } as any);

    // The canvas label preview is published — this is what makes the chip follow
    // the pointer instead of sitting frozen until commit.
    expect(uiState.actions.setLabelMoves).toHaveBeenCalledTimes(1);
    const moves = uiState.actions.setLabelMoves.mock.calls[0][0];
    expect(moves.lbl1.tile).toEqual({ x: 3, y: 3 }); // initial {1,1} + offset {2,2}
    // And NO model write during the drag.
    expect(scene.batchUpdateLabelTiles).not.toHaveBeenCalled();
  });

  it('commits via batchUpdateLabelTiles and clears the preview once on mouseup', () => {
    const uiState = makeUiState({
      mode: {
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [{ type: 'LABEL', id: 'lbl1' }],
        initialTiles: { lbl1: { x: 1, y: 1 } },
        initialRectangles: {}
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 3, y: 3 } }
      }
    });
    const scene = makeScene({
      labels: [{ id: 'lbl1', tile: { x: 1, y: 1 }, text: 'x' }]
    });

    DragItems.mousemove!({ uiState, scene } as any);
    DragItems.mouseup!({ uiState, scene } as any);

    expect(scene.batchUpdateLabelTiles).toHaveBeenCalledTimes(1);
    expect(scene.batchUpdateLabelTiles).toHaveBeenCalledWith([
      { id: 'lbl1', tile: { x: 3, y: 3 }, offset: undefined }
    ]);
    // Preview must be dropped so the committed chip isn't shadowed by a stale
    // override.
    expect(uiState.actions.clearLabelMoves).toHaveBeenCalledTimes(1);
  });

  it('clears the preview on exit (escaped drag leaves no stranded chip)', () => {
    const uiState = makeUiState({
      mode: {
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [{ type: 'LABEL', id: 'lbl1' }],
        initialTiles: { lbl1: { x: 1, y: 1 } },
        initialRectangles: {}
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 3, y: 3 } }
      }
    });
    const scene = makeScene({
      labels: [{ id: 'lbl1', tile: { x: 1, y: 1 }, text: 'x' }]
    });

    DragItems.mousemove!({ uiState, scene } as any);
    DragItems.exit!({
      rendererRef: makeRendererRef(),
      uiState,
      scene
    } as any);

    expect(uiState.actions.clearLabelMoves).toHaveBeenCalled();
    // No commit on an escaped drag.
    expect(scene.batchUpdateLabelTiles).not.toHaveBeenCalled();
  });
});
