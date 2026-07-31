// @ts-nocheck
import { TextBox } from '../modes/TextBox';

// Contract test for the TEXTBOX placement mode (arm-then-drop, mirrors
// PlaceIcon). The load-bearing invariant: the arming tap on the Elements deck
// card must NOT create a box — only a real canvas release (or a drag-from-panel
// past tap-slop) does — so pressing `t` then clicking yields EXACTLY ONE box.

const mockGenerateId = jest.fn(() => 'generated-id');
const mockSetWindowCursor = jest.fn();
const mockResolvePlacement = jest.fn(() => ({ tile: { x: 2, y: 3 }, offset: undefined }));
const mockCursorTileResidual = jest.fn();
const mockExceedsTapSlop = jest.fn(() => false);

const mockSetMode = jest.fn();
const mockSetItemControls = jest.fn();
const mockCreateTextBox = jest.fn();

jest.mock('src/utils', () => ({
  generateId: () => mockGenerateId(),
  setWindowCursor: (c: unknown) => mockSetWindowCursor(c)
}));

jest.mock('src/utils/resolvePlacement', () => ({
  // F4/LAY-03 chokepoint — no active layer in these fixtures.
  activeLayerPatch: () => ({}),
  resolvePlacement: (...args: unknown[]) => mockResolvePlacement(...args),
  cursorTileResidual: (...args: unknown[]) => mockCursorTileResidual(...args)
}));

jest.mock('src/config', () => ({
  TEXTBOX_DEFAULTS: { text: 'Text' }
}));

jest.mock('src/config/tapGesture', () => ({
  exceedsTapSlop: (a: unknown, b: unknown) => mockExceedsTapSlop(a, b)
}));

// I5/CTX-01: a drag-from-panel release is a placement only when it ENDS OVER
// the canvas. `isCanvasDrop` hit-tests the release point, so these cases need a
// renderer element and a stubbed `elementFromPoint` (jsdom has no layout).
const CANVAS_CHILD = { nodeType: 1, tag: 'canvas-child' };
const PANEL_CHILD = { nodeType: 1, tag: 'panel-child' };
const makeRenderer = (dropOverCanvas: boolean) => {
  document.elementFromPoint = jest.fn(() =>
    dropOverCanvas ? CANVAS_CHILD : PANEL_CHILD
  );
  return {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: 1280,
      bottom: 720,
      width: 1280,
      height: 720
    }),
    contains: (node: unknown) => node === CANVAS_CHILD
  };
};

function makeUiState(overrides: Record<string, unknown> = {}) {
  return {
    mode: { type: 'TEXTBOX', showCursor: true, id: null },
    mouse: {
      position: { tile: { x: 2, y: 3 }, screen: { x: 100, y: 100 } },
      mousedown: undefined
    },
    snapToGrid: true,
    actions: { setMode: mockSetMode, setItemControls: mockSetItemControls },
    ...overrides
  };
}

// `beginDragTransaction` opens the session's history bracket BEFORE the create,
// so placement + the empty-box discard are one logical action (TXT-04).
const mockBeginDragTransaction = jest.fn();

function makeScene(overrides: Record<string, unknown> = {}) {
  return {
    // F4/LAY-03: the placement modes read the view's layers to validate the
    // active layer before stamping it onto the new entity.
    currentView: { layers: [] },
    createTextBox: mockCreateTextBox,
    beginDragTransaction: mockBeginDragTransaction,
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolvePlacement.mockReturnValue({ tile: { x: 2, y: 3 }, offset: undefined });
  mockExceedsTapSlop.mockReturnValue(false);
});

describe('TextBox.entry / exit', () => {
  it('entry sets the crosshair cursor; exit restores default', () => {
    TextBox.entry?.({ uiState: makeUiState() as any, scene: makeScene() as any });
    expect(mockSetWindowCursor).toHaveBeenCalledWith('crosshair');
    TextBox.exit?.({ uiState: makeUiState() as any, scene: makeScene() as any });
    expect(mockSetWindowCursor).toHaveBeenCalledWith('default');
  });
});

describe('TextBox.mousemove', () => {
  it('is a no-op (placement commits on mouseup, not per-frame)', () => {
    expect(() =>
      TextBox.mousemove?.({
        uiState: makeUiState() as any,
        scene: makeScene() as any,
        isRendererInteraction: true
      })
    ).not.toThrow();
    expect(mockCreateTextBox).not.toHaveBeenCalled();
    expect(mockSetMode).not.toHaveBeenCalled();
  });
});

describe('TextBox.mouseup', () => {
  it('a canvas release creates EXACTLY ONE text box, selects it (deck stays closed), and returns to CURSOR', () => {
    TextBox.mouseup?.({
      uiState: makeUiState() as any,
      scene: makeScene() as any,
      isRendererInteraction: true
    });

    expect(mockCreateTextBox).toHaveBeenCalledTimes(1);
    expect(mockCreateTextBox).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'generated-id', tile: { x: 2, y: 3 } })
    );
    // Place-and-type: selected (so the strip targets it) but the deck does NOT
    // open — openPanel:false — the box drops into inline canvas edit next frame.
    expect(mockSetItemControls).toHaveBeenCalledWith(
      { type: 'TEXTBOX', id: 'generated-id' },
      { openPanel: false }
    );
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR', mousedownItem: null })
    );
  });

  it('the arming tap (off-canvas release, no move) ARMS ONLY — no box, no mode change', () => {
    // The regression this pins: press `t` arms TEXTBOX; the arming pointer-up
    // lands off the renderer and didn't move, so it must NOT eager-create a box
    // (else the following canvas click makes a SECOND one — the two-box bug).
    TextBox.mouseup?.({
      uiState: makeUiState() as any,
      scene: makeScene() as any,
      isRendererInteraction: false
    });

    expect(mockCreateTextBox).not.toHaveBeenCalled();
    expect(mockSetMode).not.toHaveBeenCalled();
    expect(mockSetItemControls).not.toHaveBeenCalled();
  });

  it('a drag-from-panel release that ends OVER THE CANVAS places one box', () => {
    mockExceedsTapSlop.mockReturnValue(true);
    const uiState = makeUiState({
      mouse: {
        position: { tile: { x: 2, y: 3 }, screen: { x: 500, y: 500 } },
        mousedown: { screen: { x: 0, y: 0 } }
      }
    });

    TextBox.mouseup?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: false,
      rendererRef: makeRenderer(true) as any
    });

    expect(mockCreateTextBox).toHaveBeenCalledTimes(1);
    expect(mockSetMode).toHaveBeenCalledWith(expect.objectContaining({ type: 'CURSOR' }));
  });

  // Promoted from the exploratory lane (I5/CTX-01). "Did the pointer travel?"
  // used to be the whole gate, so a drag released back onto the panel dropped a
  // box at the tile behind it.
  it('a drag-from-panel release back OVER THE PANEL places nothing', () => {
    mockExceedsTapSlop.mockReturnValue(true);
    const uiState = makeUiState({
      mouse: {
        position: { tile: { x: 2, y: 3 }, screen: { x: 60, y: 200 } },
        mousedown: { screen: { x: 0, y: 0 } }
      }
    });

    TextBox.mouseup?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: false,
      rendererRef: makeRenderer(false) as any
    });

    expect(mockCreateTextBox).not.toHaveBeenCalled();
    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('does nothing when the mode is not TEXTBOX', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true, mousedownItem: null } });

    TextBox.mouseup?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: true
    });

    expect(mockCreateTextBox).not.toHaveBeenCalled();
    expect(mockSetMode).not.toHaveBeenCalled();
  });
});
