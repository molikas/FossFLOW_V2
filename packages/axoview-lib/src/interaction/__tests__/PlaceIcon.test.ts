// @ts-nocheck
import { PlaceIcon } from '../modes/PlaceIcon';

const mockGenerateId = jest.fn(() => 'generated-id');
const mockGetItemAtTile = jest.fn(() => null);
const mockFindNearestUnoccupiedTile = jest.fn();
const mockSetMode = jest.fn();
const mockSetItemControls = jest.fn();
const mockPlaceIcon = jest.fn();

jest.mock('src/utils', () => ({
  generateId: () => mockGenerateId(),
  getItemAtTile: (args: unknown) => mockGetItemAtTile(args),
  findNearestUnoccupiedTile: (tile: unknown, scene: unknown) =>
    mockFindNearestUnoccupiedTile(tile, scene)
}));

jest.mock('src/config', () => ({
  VIEW_ITEM_DEFAULTS: { zIndex: 0, labelHeight: 1 }
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
    mode: { type: 'PLACE_ICON', id: 'icon-1', showCursor: true },
    mouse: { position: { tile: { x: 2, y: 3 } } },
    actions: { setMode: mockSetMode, setItemControls: mockSetItemControls },
    ...overrides
  };
}

function makeScene(overrides: Record<string, unknown> = {}) {
  return {
    // F4/LAY-03: the placement modes read the view's layers to validate the
    // active layer before stamping it onto the new entity.
    currentView: { layers: [] },
    items: [],
    connectors: [],
    rectangles: [],
    textBoxes: [],
    placeIcon: mockPlaceIcon,
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFindNearestUnoccupiedTile.mockReturnValue({ x: 2, y: 3 });
});

describe('PlaceIcon.mousemove', () => {
  it('is a no-op', () => {
    expect(() =>
      PlaceIcon.mousemove?.({
        uiState: makeUiState() as any,
        scene: makeScene() as any,
        isRendererInteraction: true
      })
    ).not.toThrow();
    expect(mockSetMode).not.toHaveBeenCalled();
  });
});

describe('PlaceIcon.mousedown', () => {
  it('transitions to CURSOR mode with item at tile when mode.id is null and renderer interacted', () => {
    const mockItem = { type: 'ITEM', id: 'item-1' };
    mockGetItemAtTile.mockReturnValue(mockItem);
    const uiState = makeUiState({
      mode: { type: 'PLACE_ICON', id: null, showCursor: true }
    });

    PlaceIcon.mousedown?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: true
    });

    expect(mockSetMode).toHaveBeenCalledWith({
      type: 'CURSOR',
      mousedownItem: mockItem,
      showCursor: true
    });
    expect(mockSetItemControls).toHaveBeenCalledWith(null);
  });

  it('does nothing when mode.id is set (icon is being placed)', () => {
    const uiState = makeUiState({
      mode: { type: 'PLACE_ICON', id: 'icon-1', showCursor: true }
    });

    PlaceIcon.mousedown?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: true
    });

    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('does nothing when not a renderer interaction', () => {
    const uiState = makeUiState({
      mode: { type: 'PLACE_ICON', id: null, showCursor: true }
    });

    PlaceIcon.mousedown?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: false
    });

    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('does nothing when mode type is not PLACE_ICON', () => {
    const uiState = makeUiState({
      mode: { type: 'CURSOR', showCursor: true, mousedownItem: null }
    });

    PlaceIcon.mousedown?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: true
    });

    expect(mockSetMode).not.toHaveBeenCalled();
  });
});

describe('PlaceIcon.mouseup', () => {
  it('places icon at nearest unoccupied tile and returns to CURSOR', () => {
    const targetTile = { x: 2, y: 3 };
    mockFindNearestUnoccupiedTile.mockReturnValue(targetTile);
    const uiState = makeUiState();

    PlaceIcon.mouseup?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: true
    });

    expect(mockPlaceIcon).toHaveBeenCalledWith({
      modelItem: expect.objectContaining({
        id: 'generated-id',
        name: 'Untitled',
        icon: 'icon-1'
      }),
      viewItem: expect.objectContaining({
        id: 'generated-id',
        tile: targetTile
      })
    });
    // After placing, return to Select mode (no lingering placement cursor).
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  it('B1: a no-move tap on the panel icon arms but does not place (off-canvas, not moved)', () => {
    // The arming tap's own pointer-up lands on the panel icon
    // (isRendererInteraction=false) and the gesture did not move. Ungated, it
    // placed a node at the panel-projected tile and nulled mode.id, so the real
    // canvas click did nothing. It must be a no-op that leaves mode.id armed.
    const uiState = makeUiState();

    PlaceIcon.mouseup?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: false
    });

    expect(mockPlaceIcon).not.toHaveBeenCalled();
    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('B1: a drag-from-panel release places when the drop POINT is over the canvas', () => {
    // Capture makes the release TARGET the panel icon, so isRendererInteraction
    // is false even though the cursor is over the canvas. The drop POINT is what
    // identifies the drag-to-place — travelling alone is not enough (CTX-01).
    const targetTile = { x: 2, y: 3 };
    mockFindNearestUnoccupiedTile.mockReturnValue(targetTile);
    const uiState = makeUiState({
      mouse: {
        position: { tile: { x: 2, y: 3 }, screen: { x: 500, y: 500 } },
        mousedown: { screen: { x: 0, y: 0 } }
      }
    });

    PlaceIcon.mouseup?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: false,
      rendererRef: makeRenderer(true) as any
    });

    expect(mockPlaceIcon).toHaveBeenCalled();
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  // Promoted from the exploratory lane (I5/CTX-01) — the mouse twin of TCH-05.
  it('a drag-from-panel release back OVER THE PANEL places nothing', () => {
    mockFindNearestUnoccupiedTile.mockReturnValue({ x: -8, y: 4 });
    const uiState = makeUiState({
      mouse: {
        position: { tile: { x: -8, y: 4 }, screen: { x: 60, y: 200 } },
        mousedown: { screen: { x: 0, y: 0 } }
      }
    });

    PlaceIcon.mouseup?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: false,
      rendererRef: makeRenderer(false) as any
    });

    expect(mockPlaceIcon).not.toHaveBeenCalled();
    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('does not place icon when no unoccupied tile is found, but still returns to CURSOR', () => {
    mockFindNearestUnoccupiedTile.mockReturnValue(null);
    const uiState = makeUiState();

    PlaceIcon.mouseup?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: true
    });

    expect(mockPlaceIcon).not.toHaveBeenCalled();
    // A placement was attempted (id was armed) → still leave placement mode.
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  it('does not call placeIcon when mode.id is null', () => {
    const uiState = makeUiState({
      mode: { type: 'PLACE_ICON', id: null, showCursor: true }
    });

    PlaceIcon.mouseup?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: true
    });

    expect(mockPlaceIcon).not.toHaveBeenCalled();
  });

  it('does nothing when mode type is not PLACE_ICON', () => {
    const uiState = makeUiState({
      mode: { type: 'CURSOR', showCursor: true, mousedownItem: null }
    });

    PlaceIcon.mouseup?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: true
    });

    expect(mockPlaceIcon).not.toHaveBeenCalled();
    expect(mockSetMode).not.toHaveBeenCalled();
  });
});
