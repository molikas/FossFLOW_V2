/**
 * REGRESSION — usePanHandlers.handleMouseDown
 *
 * The pan handler is the "bypass path" in the interaction system: when it
 * returns true, processMouseUpdate is skipped entirely. All 6 pan-trigger
 * conditions must be tested to ensure the bypass fires (or doesn't) correctly.
 *
 * Conditions:
 *  1. Left-click while already in PAN mode → endPan(), return true
 *  2. Middle-click + middleClickPan=true → startPan('middle'), return true
 *  3. Middle-click + middleClickPan=false → return false
 *  4. Right-click + rightClickPan=true → startPan('right'), return true
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
const mockUiState = {
  mode: { type: 'CURSOR' as string },
  actions: { setMode: mockSetMode },
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

const mockGetItemAtTile = jest.fn(() => null);
const mockSetWindowCursor = jest.fn();

jest.mock('src/utils', () => ({
  getItemAtTile: (...args: unknown[]) => mockGetItemAtTile(...args),
  setWindowCursor: (...args: unknown[]) => mockSetWindowCursor(...args),
  CoordsUtils: { zero: () => ({ x: 0, y: 0 }) }
}));

jest.mock('src/hooks/useScene', () => ({
  useScene: jest.fn(() => ({ items: [], connectors: [], rectangles: [], textBoxes: [] }))
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeEvent(overrides: Partial<{
  button: number; ctrlKey: boolean; altKey: boolean; target: EventTarget | null;
  preventDefault: jest.Mock;
}> = {}) {
  return {
    button: 0,
    ctrlKey: false,
    altKey: false,
    target: null,
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
  mockUiState.mode.type = 'CURSOR';
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
    // Contract: when modeType === 'PAN', any left-click returns true so the canvas
    // interaction manager does not process it. The actual mode reset (endPan → setMode CURSOR)
    // only fires if isPanningRef was set by a prior startPan call.
    mockUiState.mode.type = 'PAN';
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(makeEvent({ button: 0 }));
    });
    expect(returned).toBe(true);
  });

  test('1b. full cycle: middle-click starts pan, left-click ends pan → setMode CURSOR', () => {
    // Start pan from CURSOR mode so isPanningRef is set
    mockUiState.mode.type = 'CURSOR';
    const { result } = setup();
    act(() => { result.current.handleMouseDown(makeEvent({ button: 1 })); });
    expect(mockSetMode).toHaveBeenCalledWith(expect.objectContaining({ type: 'PAN' }));
    mockSetMode.mockClear();
    // Now simulate left-click to end pan (mouseUp path since isPanningRef=true)
    act(() => { result.current.handleMouseUp(makeEvent({ button: 0 })); });
    expect(mockSetMode).toHaveBeenCalledWith(expect.objectContaining({ type: 'CURSOR' }));
  });

  test('2. middle-click + middleClickPan=true → startPan and returns true', () => {
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(makeEvent({ button: 1 }));
    });
    expect(returned).toBe(true);
    expect(mockSetMode).toHaveBeenCalledWith(expect.objectContaining({ type: 'PAN' }));
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

  test('4. right-click + rightClickPan=true → startPan and returns true', () => {
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(makeEvent({ button: 2 }));
    });
    expect(returned).toBe(true);
    expect(mockSetMode).toHaveBeenCalledWith(expect.objectContaining({ type: 'PAN' }));
  });

  test('5. right-click + rightClickPan=false → returns false', () => {
    mockUiState.panSettings.rightClickPan = false;
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(makeEvent({ button: 2 }));
    });
    expect(returned).toBe(false);
    expect(mockSetMode).not.toHaveBeenCalled();
  });

  test('6. left-click + ctrlKey + ctrlClickPan=true → startPan and returns true', () => {
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(makeEvent({ button: 0, ctrlKey: true }));
    });
    expect(returned).toBe(true);
    expect(mockSetMode).toHaveBeenCalledWith(expect.objectContaining({ type: 'PAN' }));
  });

  test('7. left-click + altKey + altClickPan=true → startPan and returns true', () => {
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(makeEvent({ button: 0, altKey: true }));
    });
    expect(returned).toBe(true);
    expect(mockSetMode).toHaveBeenCalledWith(expect.objectContaining({ type: 'PAN' }));
  });

  test('8. left-click + emptyAreaClickPan=true + rendererEl matches target + no item → startPan', () => {
    const fakeEl = {} as EventTarget;
    mockUiState.rendererEl = fakeEl;
    mockUiState.panSettings.emptyAreaClickPan = true;
    mockGetItemAtTile.mockReturnValue(null); // empty area
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseDown(makeEvent({ button: 0, target: fakeEl }));
    });
    expect(returned).toBe(true);
    expect(mockSetMode).toHaveBeenCalledWith(expect.objectContaining({ type: 'PAN' }));
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

describe('usePanHandlers.handleMouseUp', () => {
  test('returns false if not currently panning', () => {
    const { result } = setup();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseUp(makeEvent({ button: 0 }));
    });
    expect(returned).toBe(false);
  });

  test('right-click pan is a toggle — mouseup on right button does NOT end pan', () => {
    const { result } = setup();
    // Start right-click pan
    act(() => { result.current.handleMouseDown(makeEvent({ button: 2 })); });
    mockSetMode.mockClear();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseUp(makeEvent({ button: 2 }));
    });
    // Right-click pan is toggle: mouseup on right button stays in pan
    expect(returned).toBe(false);
    expect(mockSetMode).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'CURSOR' }));
  });

  test('middle-click pan ends on mouseup', () => {
    const { result } = setup();
    act(() => { result.current.handleMouseDown(makeEvent({ button: 1 })); });
    mockSetMode.mockClear();
    let returned: boolean = false;
    act(() => {
      returned = result.current.handleMouseUp(makeEvent({ button: 1 }));
    });
    expect(returned).toBe(true);
    expect(mockSetMode).toHaveBeenCalledWith(expect.objectContaining({ type: 'CURSOR' }));
  });
});
