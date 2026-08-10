// @ts-nocheck
import { Label } from '../modes/Label';

// Contract test for the LABEL placement mode (floating Label, ADR 0031). Same
// arm-then-drop invariant as TextBox/PlaceIcon: the arming tap on the Common
// deck card must NOT create a Label — only a real canvas release (or a
// drag-from-panel past tap-slop) does. Placement selects the Label WITHOUT
// opening the Details deck (owner 2026-07-02, openPanel:false).

const mockGenerateId = jest.fn(() => 'generated-id');
const mockSetWindowCursor = jest.fn();
const mockResolvePlacement = jest.fn(() => ({ tile: { x: 2, y: 3 }, offset: undefined }));
const mockCursorTileResidual = jest.fn();
const mockExceedsTapSlop = jest.fn(() => false);

const mockSetMode = jest.fn();
const mockSetItemControls = jest.fn();
const mockCreateLabel = jest.fn();

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
  LABEL_DEFAULTS: { text: 'Label' }
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
    mode: { type: 'LABEL', showCursor: true, id: null },
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
// so placement + an abandoned first edit are one logical action (TXT-04/07).
const mockBeginDragTransaction = jest.fn();

function makeScene(overrides: Record<string, unknown> = {}) {
  return {
    // F4/LAY-03: the placement modes read the view's layers to validate the
    // active layer before stamping it onto the new entity.
    currentView: { layers: [] },
    createLabel: mockCreateLabel,
    beginDragTransaction: mockBeginDragTransaction,
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolvePlacement.mockReturnValue({ tile: { x: 2, y: 3 }, offset: undefined });
  mockExceedsTapSlop.mockReturnValue(false);
});

describe('Label.entry / exit', () => {
  it('entry sets the crosshair cursor; exit restores default', () => {
    Label.entry?.({ uiState: makeUiState() as any, scene: makeScene() as any });
    expect(mockSetWindowCursor).toHaveBeenCalledWith('crosshair');
    Label.exit?.({ uiState: makeUiState() as any, scene: makeScene() as any });
    expect(mockSetWindowCursor).toHaveBeenCalledWith('default');
  });
});

describe('Label.mousemove', () => {
  it('is a no-op (placement commits on mouseup, not per-frame)', () => {
    expect(() =>
      Label.mousemove?.({
        uiState: makeUiState() as any,
        scene: makeScene() as any,
        isRendererInteraction: true
      })
    ).not.toThrow();
    expect(mockCreateLabel).not.toHaveBeenCalled();
    expect(mockSetMode).not.toHaveBeenCalled();
  });
});

describe('Label.mouseup', () => {
  it('a canvas release creates EXACTLY ONE Label, selects it without opening the panel, and returns to CURSOR', () => {
    Label.mouseup?.({
      uiState: makeUiState() as any,
      scene: makeScene() as any,
      isRendererInteraction: true
    });

    expect(mockCreateLabel).toHaveBeenCalledTimes(1);
    expect(mockCreateLabel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'generated-id', tile: { x: 2, y: 3 } })
    );
    // select-only: sets the target but does NOT auto-open the Details deck.
    expect(mockSetItemControls).toHaveBeenCalledWith(
      { type: 'LABEL', id: 'generated-id' },
      { openPanel: false }
    );
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR', mousedownItem: null })
    );
  });

  it('the arming tap (off-canvas release, no move) ARMS ONLY — no Label, no mode change', () => {
    Label.mouseup?.({
      uiState: makeUiState() as any,
      scene: makeScene() as any,
      isRendererInteraction: false
    });

    expect(mockCreateLabel).not.toHaveBeenCalled();
    expect(mockSetMode).not.toHaveBeenCalled();
    expect(mockSetItemControls).not.toHaveBeenCalled();
  });

  it('a drag-from-panel release that ends OVER THE CANVAS places one Label', () => {
    mockExceedsTapSlop.mockReturnValue(true);
    const uiState = makeUiState({
      mouse: {
        position: { tile: { x: 2, y: 3 }, screen: { x: 500, y: 500 } },
        mousedown: { screen: { x: 0, y: 0 } }
      }
    });

    Label.mouseup?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: false,
      rendererRef: makeRenderer(true) as any
    });

    expect(mockCreateLabel).toHaveBeenCalledTimes(1);
    expect(mockSetMode).toHaveBeenCalledWith(expect.objectContaining({ type: 'CURSOR' }));
  });

  // Promoted from the exploratory lane (I5/CTX-01).
  it('a drag-from-panel release back OVER THE PANEL places nothing', () => {
    mockExceedsTapSlop.mockReturnValue(true);
    const uiState = makeUiState({
      mouse: {
        position: { tile: { x: 2, y: 3 }, screen: { x: 60, y: 200 } },
        mousedown: { screen: { x: 0, y: 0 } }
      }
    });

    Label.mouseup?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: false,
      rendererRef: makeRenderer(false) as any
    });

    expect(mockCreateLabel).not.toHaveBeenCalled();
    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('does nothing when the mode is not LABEL', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true, mousedownItem: null } });

    Label.mouseup?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: true
    });

    expect(mockCreateLabel).not.toHaveBeenCalled();
    expect(mockSetMode).not.toHaveBeenCalled();
  });
});
