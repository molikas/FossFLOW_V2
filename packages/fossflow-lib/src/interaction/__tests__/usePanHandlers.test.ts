/**
 * REGRESSION — usePanHandlers
 *
 * Right-click pan is now TRANSIENT (not sticky):
 *  - Right mousedown: consume event, defer pan entry until drag threshold.
 *  - Right mousemove (>4px): enter PAN mode.
 *  - Right mouseup after drag: exit PAN, restore previous mode.
 *  - Right mouseup without drag: deselect (close itemControls, clear lasso selection).
 *
 * All other pan triggers are unchanged:
 *  1. Left-click while in PAN mode → endPan(), return true
 *  2. Middle-click + middleClickPan=true → startPan('middle'), return true
 *  3. Middle-click + middleClickPan=false → return false
 *  4. Right-click + rightClickPan=true → consume event (return true), NO immediate PAN
 *  5. Right-click + rightClickPan=false → return false
 *  6. Left-click + ctrlKey + ctrlClickPan=true → startPan('ctrl'), return true
 *  7. Left-click + altKey + altClickPan=true → startPan('alt'), return true
 *  8. Left-click + emptyAreaClickPan=true + empty area → startPan('empty'), return true
 *  9. Regular left-click, no modifiers, no pan settings → return false
 */

import { renderHook, act } from '@testing-library/react';
import { usePanHandlers } from '../usePanHandlers';

// ---------------------------------------------------------------------------
// Mutable mock state — updated per test
// ---------------------------------------------------------------------------
const mockSetMode = jest.fn();
const mockSetItemControls = jest.fn();
const mockSetMouse = jest.fn();
const mockSetContextMenu = jest.fn();
const mockUiState = {
  mode: { type: 'CURSOR' as string, selection: null },
  contextMenu: null as any,
  actions: {
    setMode: mockSetMode,
    setItemControls: mockSetItemControls,
    setMouse: mockSetMouse,
    setContextMenu: mockSetContextMenu
  },
  panSettings: {
    middleClickPan: true,
    rightClickPan: true,
    ctrlClickPan: true,
    altClickPan: true,
    emptyAreaClickPan: false
  },
  rendererEl: null as EventTarget | null,
  mouse: { position: { tile: { x: 5, y: 5 } } }
};

jest.mock('src/stores/uiStateStore', () => ({
  useUiStateStore: jest.fn((selector: (s: typeof mockUiState) => unknown) =>
    selector(mockUiState)
  ),
  useUiStateStoreApi: jest.fn(() => ({ getState: () => mockUiState }))
}));

const mockGetItemAtTile = jest.fn<null, [unknown]>(() => null);
const mockSetWindowCursor = jest.fn<void, [unknown]>();

jest.mock('src/utils', () => ({
  getItemAtTile: (a: unknown) => mockGetItemAtTile(a),
  setWindowCursor: (a: unknown) => mockSetWindowCursor(a),
  CoordsUtils: { zero: () => ({ x: 0, y: 0 }) }
}));

jest.mock('src/hooks/useScene', () => ({
  useScene: jest.fn(() => ({
    items: [],
    connectors: [],
    rectangles: [],
    textBoxes: []
  }))
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeEvent(
  overrides: Partial<{
    button: number;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    type: string;
    target: EventTarget | null;
    clientX: number;
    clientY: number;
    preventDefault: jest.Mock;
  }> = {}
) {
  return {
    button: 0,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    type: 'mousedown',
    target: null,
    clientX: 100,
    clientY: 100,
    preventDefault: jest.fn(),
    ...overrides
  };
}

function setup() {
  return renderHook(() => usePanHandlers());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  mockUiState.mode = { type: 'CURSOR', selection: null };
  mockUiState.actions = {
    setMode: mockSetMode,
    setItemControls: mockSetItemControls,
    setMouse: mockSetMouse,
    setContextMenu: mockSetContextMenu
  } as any;
  mockUiState.contextMenu = null;
  mockUiState.panSettings.middleClickPan = true;
  mockUiState.panSettings.rightClickPan = true;
  mockUiState.panSettings.ctrlClickPan = true;
  mockUiState.panSettings.altClickPan = true;
  mockUiState.panSettings.emptyAreaClickPan = false;
  mockUiState.rendererEl = null;
  mockGetItemAtTile.mockReturnValue(null);
});

describe('usePanHandlers.handleMouseDown — pan bypass conditions', () => {
  test('1. left-click while in PAN mode → returns true (bypasses canvas interaction)', () => {
    mockUiState.mode.type = 'PAN';
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(makeEvent({ button: 0 }));
    });
    expect(returned).toBe(true);
  });

  test('1b. full cycle: middle-click starts pan, left-click ends pan → setMode CURSOR', () => {
    mockUiState.mode.type = 'CURSOR';
    const { result } = setup();
    act(() => {
      result.current.handleMouseDown(makeEvent({ button: 1 }));
    });
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAN' })
    );
    mockSetMode.mockClear();
    act(() => {
      result.current.handleMouseUp(makeEvent({ button: 0 }));
    });
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  test('2. middle-click + middleClickPan=true → startPan and returns true', () => {
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(makeEvent({ button: 1 }));
    });
    expect(returned).toBe(true);
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAN' })
    );
  });

  test('3. middle-click + middleClickPan=false → returns false', () => {
    mockUiState.panSettings.middleClickPan = false;
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(makeEvent({ button: 1 }));
    });
    expect(returned).toBe(false);
    expect(mockSetMode).not.toHaveBeenCalled();
  });

  test('4. right-click + rightClickPan=true → consumes event (returns true) but does NOT immediately enter PAN', () => {
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(makeEvent({ button: 2 }));
    });
    expect(returned).toBe(true);
    // Pan entry is deferred — mode must not be set on mousedown alone
    expect(mockSetMode).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAN' })
    );
  });

  test('5. right-click + rightClickPan=false → still consumed (returns true) but no PAN or deselect state set', () => {
    mockUiState.panSettings.rightClickPan = false;
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(makeEvent({ button: 2 }));
    });
    // Always consumed — prevents Cursor.mousedown/mouseup from firing the context menu
    expect(returned).toBe(true);
    // No PAN mode entered and no deferred pan state set
    expect(mockSetMode).not.toHaveBeenCalled();
  });

  test('6. left-click + ctrlKey + ctrlClickPan=true → startPan and returns true', () => {
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(
        makeEvent({ button: 0, ctrlKey: true })
      );
    });
    expect(returned).toBe(true);
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAN' })
    );
  });

  test('7. left-click + altKey + altClickPan=true → startPan and returns true', () => {
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(
        makeEvent({ button: 0, altKey: true })
      );
    });
    expect(returned).toBe(true);
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAN' })
    );
  });

  test('8. left-click + emptyAreaClickPan=true + rendererEl matches target + no item → startPan', () => {
    const fakeEl = {} as EventTarget;
    mockUiState.rendererEl = fakeEl;
    mockUiState.panSettings.emptyAreaClickPan = true;
    mockGetItemAtTile.mockReturnValue(null);
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(
        makeEvent({ button: 0, target: fakeEl })
      );
    });
    expect(returned).toBe(true);
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAN' })
    );
  });

  test('9. regular left-click, no modifiers, all pan settings default off → returns false', () => {
    mockUiState.panSettings.ctrlClickPan = false;
    mockUiState.panSettings.altClickPan = false;
    mockUiState.panSettings.emptyAreaClickPan = false;
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(makeEvent({ button: 0 }));
    });
    expect(returned).toBe(false);
    expect(mockSetMode).not.toHaveBeenCalled();
  });
});

describe('usePanHandlers.handleMouseMove — deferred right-drag pan', () => {
  test('right-drag beyond threshold → enters PAN mode, returns false (processMouseUpdate runs)', () => {
    const { result } = setup();
    act(() => {
      result.current.handleMouseDown(
        makeEvent({ button: 2, clientX: 100, clientY: 100 })
      );
    });
    mockSetMode.mockClear();
    let consumed = false;
    // Move beyond threshold
    act(() => {
      consumed = result.current.handleMouseMove(
        makeEvent({ clientX: 106, clientY: 100 })
      );
    });
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAN' })
    );
    expect(consumed).toBe(false); // Pan.mousemove must run
  });

  test('right-drag below threshold → does NOT enter PAN, returns true (suppresses processMouseUpdate)', () => {
    const { result } = setup();
    act(() => {
      result.current.handleMouseDown(
        makeEvent({ button: 2, clientX: 100, clientY: 100 })
      );
    });
    mockSetMode.mockClear();
    let consumed = false;
    // Move below threshold
    act(() => {
      consumed = result.current.handleMouseMove(
        makeEvent({ clientX: 102, clientY: 101 })
      );
    });
    expect(mockSetMode).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAN' })
    );
    // Must suppress processMouseUpdate to prevent Cursor.mousemove triggering lasso
    expect(consumed).toBe(true);
  });

  test('mousemove without prior right-down → returns false (no suppression)', () => {
    const { result } = setup();
    let consumed = false;
    act(() => {
      consumed = result.current.handleMouseMove(
        makeEvent({ clientX: 200, clientY: 200 })
      );
    });
    expect(mockSetMode).not.toHaveBeenCalled();
    expect(consumed).toBe(false);
  });

  test('mousemove after pan has started → returns false (Pan.mousemove must run)', () => {
    const { result } = setup();
    act(() => {
      result.current.handleMouseDown(
        makeEvent({ button: 2, clientX: 100, clientY: 100 })
      );
    });
    act(() => {
      result.current.handleMouseMove(makeEvent({ clientX: 110, clientY: 100 }));
    }); // starts pan
    mockSetMode.mockClear();
    let consumed = false;
    act(() => {
      consumed = result.current.handleMouseMove(
        makeEvent({ clientX: 115, clientY: 100 })
      );
    });
    expect(consumed).toBe(false);
  });
});

describe('usePanHandlers.handleMouseUp', () => {
  test('returns false if not panning and no prior right-down', () => {
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseUp(makeEvent({ button: 0 }));
    });
    expect(returned).toBe(false);
  });

  test('right-click without drag → deselect: closes itemControls, clears mousedown, returns true', () => {
    const { result } = setup();
    act(() => {
      result.current.handleMouseDown(makeEvent({ button: 2 }));
    });
    mockSetMode.mockClear();
    mockSetItemControls.mockClear();
    mockSetMouse.mockClear();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseUp(makeEvent({ button: 2 }));
    });
    expect(returned).toBe(true);
    expect(mockSetItemControls).toHaveBeenCalledWith(null);
    // Stale mousedown state must be cleared so Cursor.mousemove can't trigger lasso
    expect(mockSetMouse).toHaveBeenCalledWith(
      expect.objectContaining({ mousedown: null })
    );
    expect(mockSetMode).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAN' })
    );
  });

  test('right-drag then release → exits PAN and restores previous mode (CURSOR)', () => {
    const { result } = setup();
    // Start and cross threshold
    act(() => {
      result.current.handleMouseDown(
        makeEvent({ button: 2, clientX: 100, clientY: 100 })
      );
    });
    act(() => {
      result.current.handleMouseMove(makeEvent({ clientX: 110, clientY: 100 }));
    });
    mockSetMode.mockClear();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseUp(makeEvent({ button: 2 }));
    });
    expect(returned).toBe(true);
    // Should restore to CURSOR (was in CURSOR before right-click)
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  test('right-drag from CONNECTOR mode → restores CONNECTOR mode on release', () => {
    mockUiState.mode = { type: 'CONNECTOR', selection: null };
    const { result } = setup();
    act(() => {
      result.current.handleMouseDown(
        makeEvent({ button: 2, clientX: 100, clientY: 100 })
      );
    });
    act(() => {
      result.current.handleMouseMove(makeEvent({ clientX: 110, clientY: 100 }));
    });
    mockSetMode.mockClear();
    act(() => {
      result.current.handleMouseUp(makeEvent({ button: 2 }));
    });
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CONNECTOR' })
    );
  });

  test('middle-click pan ends on mouseup', () => {
    const { result } = setup();
    act(() => {
      result.current.handleMouseDown(makeEvent({ button: 1 }));
    });
    mockSetMode.mockClear();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseUp(makeEvent({ button: 1 }));
    });
    expect(returned).toBe(true);
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  test('right-click without drag on LASSO mode → clears lasso selection', () => {
    mockUiState.mode = {
      type: 'LASSO',
      selection: {
        startTile: { x: 0, y: 0 },
        endTile: { x: 5, y: 5 },
        items: []
      }
    } as any;
    const { result } = setup();
    act(() => {
      result.current.handleMouseDown(makeEvent({ button: 2 }));
    });
    mockSetMode.mockClear();
    act(() => {
      result.current.handleMouseUp(makeEvent({ button: 2 }));
    });
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LASSO', selection: null })
    );
  });
});
