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
  it('places icon at nearest unoccupied tile and clears mode.id', () => {
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
    // mode.id should be nulled out
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ id: null })
    );
  });

  it('does not place icon when no unoccupied tile is found', () => {
    mockFindNearestUnoccupiedTile.mockReturnValue(null);
    const uiState = makeUiState();

    PlaceIcon.mouseup?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: true
    });

    expect(mockPlaceIcon).not.toHaveBeenCalled();
    // Still clears mode.id
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ id: null })
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
