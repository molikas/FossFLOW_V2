/**
 * REGRESSION — Pan mode handler contracts (real module)
 *
 * Covers entry/exit cursors, mousedown grabbing state, scroll update on
 * mousemove, and EXPLORABLE_READONLY content-check logic in mouseup.
 */

import { Pan } from 'src/interaction/modes/Pan';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockSetWindowCursor = jest.fn();
const mockGetItemAtTile = jest.fn<any, any>(() => null);

jest.mock('src/utils', () => ({
  setWindowCursor: (...args: any[]) => mockSetWindowCursor(...args),
  getItemAtTile: (...args: any[]) => mockGetItemAtTile(...args),
  CoordsUtils: {
    add: (a: any, b: any) => ({ x: a.x + b.x, y: a.y + b.y }),
    isEqual: (a: any, b: any) => a.x === b.x && a.y === b.y
  }
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeUiState(overrides: any = {}) {
  return {
    mode: overrides.mode ?? { type: 'PAN' },
    mouse: overrides.mouse ?? {
      position: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
      mousedown: null,
      delta: null
    },
    scroll: overrides.scroll ?? { position: { x: 0, y: 0 }, offset: { x: 0, y: 0 } },
    editorMode: overrides.editorMode ?? 'EDIT',
    actions: overrides.actions ?? {
      setMode: jest.fn(),
      setScroll: jest.fn(),
      setItemControls: jest.fn()
    }
  };
}

function makeScene(items: any[] = []) {
  return { items, textBoxes: [], connectors: [], rectangles: [] };
}

function makeModel(items: any[] = []) {
  return { items, views: [], colors: [], icons: [] };
}

// ---------------------------------------------------------------------------
// entry / exit
// ---------------------------------------------------------------------------
describe('Pan.entry / exit', () => {
  beforeEach(() => jest.clearAllMocks());

  it('entry sets grab cursor', () => {
    Pan.entry!({ uiState: makeUiState(), scene: makeScene() } as any);
    expect(mockSetWindowCursor).toHaveBeenCalledWith('grab');
  });

  it('exit sets default cursor', () => {
    Pan.exit!({ uiState: makeUiState(), scene: makeScene() } as any);
    expect(mockSetWindowCursor).toHaveBeenCalledWith('default');
  });
});

// ---------------------------------------------------------------------------
// mousedown
// ---------------------------------------------------------------------------
describe('Pan.mousedown', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets grabbing cursor when isRendererInteraction is true', () => {
    const uiState = makeUiState();
    Pan.mousedown!({ uiState, scene: makeScene(), isRendererInteraction: true } as any);
    expect(mockSetWindowCursor).toHaveBeenCalledWith('grabbing');
  });

  it('does nothing when isRendererInteraction is false (toolbar click guard)', () => {
    const uiState = makeUiState();
    Pan.mousedown!({ uiState, scene: makeScene(), isRendererInteraction: false } as any);
    expect(mockSetWindowCursor).not.toHaveBeenCalled();
  });

  it('does nothing when mode type is not PAN', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true } });
    Pan.mousedown!({ uiState, scene: makeScene(), isRendererInteraction: true } as any);
    expect(mockSetWindowCursor).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// mousemove
// ---------------------------------------------------------------------------
describe('Pan.mousemove', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does nothing when mode type is not PAN', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true } });
    Pan.mousemove!({ uiState, scene: makeScene() } as any);
    expect(uiState.actions.setScroll).not.toHaveBeenCalled();
  });

  it('does nothing when mousedown is null (no active drag)', () => {
    const uiState = makeUiState({
      mouse: { position: { tile: { x: 5, y: 5 } }, mousedown: null, delta: null }
    });
    Pan.mousemove!({ uiState, scene: makeScene() } as any);
    expect(uiState.actions.setScroll).not.toHaveBeenCalled();
  });

  it('updates scroll position by delta.screen when mousedown is active', () => {
    const uiState = makeUiState({
      scroll: { position: { x: 100, y: 200 }, offset: { x: 0, y: 0 } },
      mouse: {
        position: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        mousedown: { tile: { x: 3, y: 3 }, screen: { x: 30, y: 30 } },
        delta: { screen: { x: -5, y: -10 } }
      }
    });
    Pan.mousemove!({ uiState, scene: makeScene() } as any);
    expect(uiState.actions.setScroll).toHaveBeenCalledWith(
      expect.objectContaining({
        position: { x: 95, y: 190 } // 100 + (-5), 200 + (-10)
      })
    );
  });

  it('keeps scroll position unchanged when delta is null', () => {
    const uiState = makeUiState({
      scroll: { position: { x: 100, y: 200 }, offset: { x: 0, y: 0 } },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 3, y: 3 } },
        delta: null
      }
    });
    Pan.mousemove!({ uiState, scene: makeScene() } as any);
    expect(uiState.actions.setScroll).toHaveBeenCalledWith(
      expect.objectContaining({ position: { x: 100, y: 200 } })
    );
  });
});

// ---------------------------------------------------------------------------
// mouseup
// ---------------------------------------------------------------------------
describe('Pan.mouseup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAtTile.mockReturnValue(null);
  });

  it('does nothing when mode type is not PAN', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true } });
    Pan.mouseup!({ uiState, scene: makeScene(), model: makeModel() } as any);
    expect(uiState.actions.setItemControls).not.toHaveBeenCalled();
    // Only the grab cursor reset should NOT happen for wrong mode
    expect(mockSetWindowCursor).not.toHaveBeenCalled();
  });

  it('resets to grab cursor', () => {
    const uiState = makeUiState();
    Pan.mouseup!({ uiState, scene: makeScene(), model: makeModel() } as any);
    expect(mockSetWindowCursor).toHaveBeenCalledWith('grab');
  });

  it('does not open item panel in EDIT mode', () => {
    mockGetItemAtTile.mockReturnValue({ type: 'ITEM', id: 'n1' });
    const uiState = makeUiState({
      editorMode: 'EDIT',
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 5, y: 5 } },
        delta: null
      }
    });
    Pan.mouseup!({ uiState, scene: makeScene(), model: makeModel() } as any);
    expect(uiState.actions.setItemControls).not.toHaveBeenCalled();
  });

  it('EXPLORABLE_READONLY: opens panel when item has description content', () => {
    mockGetItemAtTile.mockReturnValue({ type: 'ITEM', id: 'n1' });
    const uiState = makeUiState({
      editorMode: 'EXPLORABLE_READONLY',
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 5, y: 5 } },
        delta: null
      }
    });
    const model = makeModel([{ id: 'n1', description: 'Hello world', notes: '' }]);
    Pan.mouseup!({ uiState, scene: makeScene([{ type: 'ITEM', id: 'n1' }]), model } as any);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith({ type: 'ITEM', id: 'n1' });
  });

  it('EXPLORABLE_READONLY: opens panel when item has notes content', () => {
    mockGetItemAtTile.mockReturnValue({ type: 'ITEM', id: 'n2' });
    const uiState = makeUiState({
      editorMode: 'EXPLORABLE_READONLY',
      mouse: {
        position: { tile: { x: 3, y: 4 } },
        mousedown: { tile: { x: 3, y: 4 } }
      }
    });
    const model = makeModel([{ id: 'n2', description: '', notes: 'Some notes here' }]);
    Pan.mouseup!({ uiState, scene: makeScene(), model } as any);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith({ type: 'ITEM', id: 'n2' });
  });

  it('EXPLORABLE_READONLY: clears panel when item has no description or notes', () => {
    mockGetItemAtTile.mockReturnValue({ type: 'ITEM', id: 'n3' });
    const uiState = makeUiState({
      editorMode: 'EXPLORABLE_READONLY',
      mouse: {
        position: { tile: { x: 3, y: 4 } },
        mousedown: { tile: { x: 3, y: 4 } }
      }
    });
    const model = makeModel([{ id: 'n3', description: '', notes: '' }]);
    Pan.mouseup!({ uiState, scene: makeScene(), model } as any);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith(null);
  });

  it('EXPLORABLE_READONLY: clears panel when item has only HTML tags (stripped to empty)', () => {
    mockGetItemAtTile.mockReturnValue({ type: 'ITEM', id: 'n4' });
    const uiState = makeUiState({
      editorMode: 'EXPLORABLE_READONLY',
      mouse: {
        position: { tile: { x: 3, y: 4 } },
        mousedown: { tile: { x: 3, y: 4 } }
      }
    });
    const model = makeModel([{ id: 'n4', description: '<p></p>', notes: '<br/>' }]);
    Pan.mouseup!({ uiState, scene: makeScene(), model } as any);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith(null);
  });

  it('EXPLORABLE_READONLY: clears panel when click position differs from mousedown (was a pan)', () => {
    mockGetItemAtTile.mockReturnValue({ type: 'ITEM', id: 'n1' });
    const uiState = makeUiState({
      editorMode: 'EXPLORABLE_READONLY',
      mouse: {
        position: { tile: { x: 7, y: 7 } }, // different tile
        mousedown: { tile: { x: 5, y: 5 } },
        delta: null
      }
    });
    const model = makeModel([{ id: 'n1', description: 'Hello', notes: '' }]);
    Pan.mouseup!({ uiState, scene: makeScene(), model } as any);
    // Since tiles differ, the content check block is skipped
    expect(uiState.actions.setItemControls).not.toHaveBeenCalled();
  });

  it('EXPLORABLE_READONLY: clears panel when no item at tile', () => {
    mockGetItemAtTile.mockReturnValue(null);
    const uiState = makeUiState({
      editorMode: 'EXPLORABLE_READONLY',
      mouse: {
        position: { tile: { x: 3, y: 4 } },
        mousedown: { tile: { x: 3, y: 4 } }
      }
    });
    Pan.mouseup!({ uiState, scene: makeScene(), model: makeModel() } as any);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith(null);
  });

  it('EXPLORABLE_READONLY: clears panel when tile has non-ITEM content (e.g. rectangle)', () => {
    mockGetItemAtTile.mockReturnValue({ type: 'RECTANGLE', id: 'rect1' });
    const uiState = makeUiState({
      editorMode: 'EXPLORABLE_READONLY',
      mouse: {
        position: { tile: { x: 3, y: 4 } },
        mousedown: { tile: { x: 3, y: 4 } }
      }
    });
    Pan.mouseup!({ uiState, scene: makeScene(), model: makeModel() } as any);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith(null);
  });
});
