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
    scroll: overrides.scroll ?? {
      position: { x: 0, y: 0 },
      offset: { x: 0, y: 0 }
    },
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

  it('entry sets grab cursor in EDITABLE mode', () => {
    Pan.entry!({
      uiState: makeUiState({ editorMode: 'EDITABLE' }),
      scene: makeScene()
    } as any);
    expect(mockSetWindowCursor).toHaveBeenCalledWith('grab');
  });

  // MQA #25 (3rd pass): EXPLORABLE_READONLY uses the default cursor so the
  // grab affordance no longer suggests left-drag panning. Right-drag still
  // pans via usePanHandlers.
  it('entry sets default cursor in EXPLORABLE_READONLY mode', () => {
    Pan.entry!({
      uiState: makeUiState({ editorMode: 'EXPLORABLE_READONLY' }),
      scene: makeScene()
    } as any);
    expect(mockSetWindowCursor).toHaveBeenCalledWith('default');
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

  it('sets grabbing cursor when isRendererInteraction is true (EDITABLE)', () => {
    const uiState = makeUiState({ editorMode: 'EDITABLE' });
    Pan.mousedown!({
      uiState,
      scene: makeScene(),
      isRendererInteraction: true
    } as any);
    expect(mockSetWindowCursor).toHaveBeenCalledWith('grabbing');
  });

  // MQA #25 (3rd pass): EXPLORABLE_READONLY reserves left-click for opening
  // the details panel — flipping to grabbing on mousedown would visually
  // suggest a drag-pan when the user actually just clicked a node.
  it('does NOT flip to grabbing cursor in EXPLORABLE_READONLY mode', () => {
    const uiState = makeUiState({ editorMode: 'EXPLORABLE_READONLY' });
    Pan.mousedown!({
      uiState,
      scene: makeScene(),
      isRendererInteraction: true
    } as any);
    expect(mockSetWindowCursor).not.toHaveBeenCalled();
  });

  it('does nothing when isRendererInteraction is false (toolbar click guard)', () => {
    const uiState = makeUiState();
    Pan.mousedown!({
      uiState,
      scene: makeScene(),
      isRendererInteraction: false
    } as any);
    expect(mockSetWindowCursor).not.toHaveBeenCalled();
  });

  it('does nothing when mode type is not PAN', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true } });
    Pan.mousedown!({
      uiState,
      scene: makeScene(),
      isRendererInteraction: true
    } as any);
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
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: null,
        delta: null
      }
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

  // M2 (UX sweep 2026-06-30): in EXPLORABLE_READONLY a left-press is a click
  // (opens the node popover); a sub-threshold wobble must NOT pan or it flings
  // the diagram. Past the slop the pan engages normally.
  it('M2: does NOT scroll on sub-threshold left travel in EXPLORABLE_READONLY', () => {
    const uiState = makeUiState({
      editorMode: 'EXPLORABLE_READONLY',
      mouse: {
        position: { tile: { x: 5, y: 5 }, screen: { x: 52, y: 51 } }, // ~2.2px
        mousedown: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        delta: { screen: { x: 2, y: 1 } }
      }
    });
    Pan.mousemove!({ uiState, scene: makeScene() } as any);
    expect(uiState.actions.setScroll).not.toHaveBeenCalled();
  });

  it('M2: scrolls once past the slop threshold in EXPLORABLE_READONLY', () => {
    const uiState = makeUiState({
      editorMode: 'EXPLORABLE_READONLY',
      scroll: { position: { x: 100, y: 200 }, offset: { x: 0, y: 0 } },
      mouse: {
        position: { tile: { x: 5, y: 5 }, screen: { x: 60, y: 50 } }, // 10px
        mousedown: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        delta: { screen: { x: 10, y: 0 } }
      }
    });
    Pan.mousemove!({ uiState, scene: makeScene() } as any);
    expect(uiState.actions.setScroll).toHaveBeenCalledWith(
      expect.objectContaining({ position: { x: 110, y: 200 } })
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

  // MQA #25 (3rd pass): EXPLORABLE_READONLY body click opens the readOnly
  // NodePanel for any node carrying content (link / headerLink / description /
  // notes). Empty-content nodes dismiss the panel.
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
    const model = makeModel([
      { id: 'n1', description: 'Hello world', notes: '' }
    ]);
    Pan.mouseup!({
      uiState,
      scene: makeScene([{ type: 'ITEM', id: 'n1' }]),
      model,
      isRendererInteraction: true
    } as any);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith({
      type: 'ITEM',
      id: 'n1'
    });
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
    const model = makeModel([
      { id: 'n2', description: '', notes: 'Some notes here' }
    ]);
    Pan.mouseup!({ uiState, scene: makeScene(), model, isRendererInteraction: true } as any);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith({
      type: 'ITEM',
      id: 'n2'
    });
  });

  it('EXPLORABLE_READONLY: opens panel when item has a linked diagram even with no description/notes', () => {
    mockGetItemAtTile.mockReturnValue({ type: 'ITEM', id: 'n5' });
    const uiState = makeUiState({
      editorMode: 'EXPLORABLE_READONLY',
      mouse: {
        position: { tile: { x: 3, y: 4 } },
        mousedown: { tile: { x: 3, y: 4 } }
      }
    });
    const model = makeModel([
      { id: 'n5', description: '', notes: '', link: 'other-diagram-id' } as any
    ]);
    Pan.mouseup!({ uiState, scene: makeScene(), model, isRendererInteraction: true } as any);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith({
      type: 'ITEM',
      id: 'n5'
    });
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
    Pan.mouseup!({ uiState, scene: makeScene(), model, isRendererInteraction: true } as any);
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
    const model = makeModel([
      { id: 'n4', description: '<p></p>', notes: '<br/>' }
    ]);
    Pan.mouseup!({ uiState, scene: makeScene(), model, isRendererInteraction: true } as any);
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
    Pan.mouseup!({ uiState, scene: makeScene(), model, isRendererInteraction: true } as any);
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
    Pan.mouseup!({
      uiState,
      scene: makeScene(),
      model: makeModel(),
      isRendererInteraction: true
    } as any);
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
    Pan.mouseup!({
      uiState,
      scene: makeScene(),
      model: makeModel(),
      isRendererInteraction: true
    } as any);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith(null);
  });

  // I5/CTX-15 follow-up (`44b8dda4`). The pointer listener is WINDOW-bound
  // (ADR 0018), so this handler also sees mouseups over the right sidebar, the
  // toolbar and every portaled overlay — and a tile resolves for ANY screen
  // point, so an off-canvas release looks exactly like a click on empty canvas.
  // It dismissed the read-only panel and unmounted the NodePanel's
  // linked-diagram link mid-click, so the link's own handler never ran (the
  // J5.3 journey). `Pan.mousedown` has always had this guard.
  it('EXPLORABLE_READONLY: ignores a release that did NOT land on the canvas', () => {
    mockGetItemAtTile.mockReturnValue(null);
    const uiState = makeUiState({
      editorMode: 'EXPLORABLE_READONLY',
      mouse: {
        position: { tile: { x: 3, y: 4 } },
        mousedown: { tile: { x: 3, y: 4 } }
      }
    });
    Pan.mouseup!({
      uiState,
      scene: makeScene(),
      model: makeModel(),
      isRendererInteraction: false
    } as any);
    // The panel survives a click on app chrome — nothing was dismissed.
    expect(uiState.actions.setItemControls).not.toHaveBeenCalled();
    // …and the cursor reset still runs, so the guard is scoped to the panel
    // decision rather than short-circuiting the whole handler.
    expect(mockSetWindowCursor).toHaveBeenCalledWith('default');
  });
});
