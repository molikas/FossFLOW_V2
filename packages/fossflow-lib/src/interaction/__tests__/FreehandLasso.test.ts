// @ts-nocheck
import { FreehandLasso } from '../modes/FreehandLasso';

const mockSetMode = jest.fn();
// screenToTile is now injected via state — no longer imported from src/utils.
const mockScreenToTile = jest.fn((args: { mouse: { x: number; y: number } }) => ({
  x: args.mouse.x / 10,
  y: args.mouse.y / 10
}));
const mockIsPointInPolygon = jest.fn(() => false);
const mockGetItemByIdOrThrow = jest.fn();

jest.mock('src/utils', () => ({
  isPointInPolygon: (point: unknown, path: unknown) =>
    mockIsPointInPolygon(point, path),
  getItemByIdOrThrow: (items: unknown[], id: string) =>
    mockGetItemByIdOrThrow(items, id)
}));

function makeBoundingRect() {
  return { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
}

function makeUiState(overrides: Record<string, unknown> = {}) {
  return {
    mode: {
      type: 'FREEHAND_LASSO',
      path: [],
      selection: null,
      isDragging: false,
      showCursor: true
    },
    mouse: {
      position: {
        tile: { x: 5, y: 5 },
        screen: { x: 50, y: 50 }
      },
      mousedown: { tile: { x: 5, y: 5 } }
    },
    zoom: 1,
    scroll: { x: 0, y: 0 },
    rendererEl: makeBoundingRect(),
    actions: { setMode: mockSetMode },
    ...overrides
  };
}

function makeScene(overrides: Record<string, unknown> = {}) {
  return {
    items: [],
    connectors: [],
    rectangles: [],
    textBoxes: [],
    ...overrides
  };
}

/** Build the base State shape expected by FreehandLasso mode actions. */
function makeState(
  uiStateOverrides: Record<string, unknown> = {},
  sceneOverrides: Record<string, unknown> = {}
) {
  return {
    uiState: makeUiState(uiStateOverrides),
    scene: makeScene(sceneOverrides),
    isRendererInteraction: true,
    screenToTile: mockScreenToTile
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsPointInPolygon.mockReturnValue(false);
});

describe('FreehandLasso.mousedown', () => {
  it('starts a new path on renderer interaction with no selection', () => {
    FreehandLasso.mousedown?.(makeState() as any);

    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'FREEHAND_LASSO',
        path: [{ x: 50, y: 50 }],
        selection: null,
        isDragging: false
      })
    );
  });

  it('does nothing on non-renderer interaction with no selection', () => {
    const state = { ...makeState(), isRendererInteraction: false };
    FreehandLasso.mousedown?.(state as any);

    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('sets isDragging when click is within an existing selection', () => {
    mockIsPointInPolygon.mockReturnValue(true);
    const state = makeState({
      mode: {
        type: 'FREEHAND_LASSO',
        path: [],
        selection: {
          pathTiles: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }],
          items: []
        },
        isDragging: false,
        showCursor: true
      }
    });

    FreehandLasso.mousedown?.(state as any);

    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ isDragging: true })
    );
  });

  it('clears selection and starts new path when clicking outside existing selection on canvas', () => {
    mockIsPointInPolygon.mockReturnValue(false);
    const state = makeState({
      mode: {
        type: 'FREEHAND_LASSO',
        path: [],
        selection: {
          pathTiles: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 2 }],
          items: []
        },
        isDragging: false,
        showCursor: true
      }
    });

    FreehandLasso.mousedown?.(state as any);

    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({
        path: [{ x: 50, y: 50 }],
        selection: null,
        isDragging: false
      })
    );
  });

  it('preserves selection on non-renderer click outside selection bounds', () => {
    mockIsPointInPolygon.mockReturnValue(false);
    const state = {
      ...makeState({
        mode: {
          type: 'FREEHAND_LASSO',
          path: [],
          selection: {
            pathTiles: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 2 }],
            items: []
          },
          isDragging: false,
          showCursor: true
        }
      }),
      isRendererInteraction: false
    };

    FreehandLasso.mousedown?.(state as any);

    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('does nothing when mode type is not FREEHAND_LASSO', () => {
    const state = makeState({
      mode: { type: 'CURSOR', showCursor: true, mousedownItem: null }
    });

    FreehandLasso.mousedown?.(state as any);

    expect(mockSetMode).not.toHaveBeenCalled();
  });
});

describe('FreehandLasso.mousemove', () => {
  it('appends screen point to path while drawing', () => {
    const state = makeState({
      mode: {
        type: 'FREEHAND_LASSO',
        path: [{ x: 40, y: 40 }],
        selection: null,
        isDragging: false,
        showCursor: true
      },
      mouse: {
        position: {
          tile: { x: 6, y: 6 },
          screen: { x: 60, y: 60 }
        },
        mousedown: { tile: { x: 5, y: 5 } }
      }
    });

    FreehandLasso.mousemove?.(state as any);

    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.arrayContaining([
          { x: 40, y: 40 },
          { x: 60, y: 60 }
        ])
      })
    );
  });

  it('does nothing when mousedown is null (not dragging)', () => {
    const state = makeState({
      mouse: {
        position: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        mousedown: null
      }
    });

    FreehandLasso.mousemove?.(state as any);

    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('does not add a point when movement is below throttle threshold', () => {
    const state = makeState({
      mode: {
        type: 'FREEHAND_LASSO',
        path: [{ x: 50, y: 50 }],
        selection: null,
        isDragging: false,
        showCursor: true
      },
      mouse: {
        position: {
          tile: { x: 5, y: 5 },
          screen: { x: 52, y: 50 } // only 2px away — below the 5px threshold
        },
        mousedown: { tile: { x: 5, y: 5 } }
      }
    });

    FreehandLasso.mousemove?.(state as any);

    // setMode is called but path length stays 1 (point not added)
    const call = mockSetMode.mock.calls[0]?.[0];
    expect(call?.path).toHaveLength(1);
  });

  it('switches to DRAG_ITEMS mode when isDragging is true with a selection', () => {
    mockGetItemByIdOrThrow.mockReturnValue({ value: { tile: { x: 3, y: 3 } }, index: 0 });
    const state = makeState(
      {
        mode: {
          type: 'FREEHAND_LASSO',
          path: [],
          selection: { items: [{ type: 'ITEM', id: 'item-1' }], pathTiles: [] },
          isDragging: true,
          showCursor: true
        }
      },
      { items: [{ id: 'item-1', tile: { x: 3, y: 3 } }] }
    );

    FreehandLasso.mousemove?.(state as any);

    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DRAG_ITEMS' })
    );
  });
});

describe('FreehandLasso.mouseup', () => {
  it('does nothing when mousedown is null', () => {
    const state = makeState({
      mouse: {
        position: { tile: { x: 5, y: 5 }, screen: { x: 50, y: 50 } },
        mousedown: null
      }
    });

    FreehandLasso.mouseup?.(state as any);

    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('does not create a selection when path has fewer than 3 points', () => {
    const state = makeState({
      mode: {
        type: 'FREEHAND_LASSO',
        path: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
        selection: null,
        isDragging: false,
        showCursor: true
      }
    });

    FreehandLasso.mouseup?.(state as any);

    // selection should not have been set (path too short to form a polygon)
    const call = mockSetMode.mock.calls[0]?.[0];
    expect(call?.selection).toBeNull();
  });

  it('uses injected screenToTile to convert path and sets selection when path has 3+ points', () => {
    const state = makeState({
      mode: {
        type: 'FREEHAND_LASSO',
        path: [
          { x: 10, y: 10 },
          { x: 100, y: 10 },
          { x: 55, y: 100 }
        ],
        selection: null,
        isDragging: false,
        showCursor: true
      }
    });

    FreehandLasso.mouseup?.(state as any);

    // The injected screenToTile (mockScreenToTile) should have been called once per path point.
    expect(mockScreenToTile).toHaveBeenCalledTimes(3);
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: expect.objectContaining({
          items: [],
          pathTiles: expect.any(Array)
        })
      })
    );
  });

  it('does nothing when mode type is not FREEHAND_LASSO', () => {
    const state = makeState({
      mode: { type: 'CURSOR', showCursor: true, mousedownItem: null }
    });

    FreehandLasso.mouseup?.(state as any);

    expect(mockSetMode).not.toHaveBeenCalled();
  });
});
