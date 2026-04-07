/**
 * REGRESSION — ReconnectAnchor mode handler contracts (real module)
 *
 * Covers entry/exit cursors, mousemove live-preview (tile and item snapping),
 * and mouseup finalization (returns to CURSOR with connector still selected).
 */

import { ReconnectAnchor } from 'src/interaction/modes/ReconnectAnchor';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockSetWindowCursor = jest.fn();
const mockGetItemAtTile = jest.fn<any, any>(() => null);
const mockHasMovedTile = jest.fn(() => true);

jest.mock('src/utils', () => ({
  setWindowCursor: (...args: any[]) => mockSetWindowCursor(...args),
  getItemAtTile: (...args: any[]) => mockGetItemAtTile(...args),
  hasMovedTile: (...args: any[]) => mockHasMovedTile(...args)
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeUiState(overrides: any = {}) {
  return {
    mode: overrides.mode ?? {
      type: 'RECONNECT_ANCHOR',
      showCursor: true,
      connectorId: 'conn-1',
      anchorId: 'a1',
      anchorIndex: 0
    },
    mouse: overrides.mouse ?? {
      position: { tile: { x: 7, y: 3 } },
      mousedown: null,
      delta: null
    },
    actions: overrides.actions ?? {
      setMode: jest.fn(),
      setItemControls: jest.fn()
    }
  };
}

function makeScene(overrides: any = {}) {
  return {
    connectors: overrides.connectors ?? [
      {
        id: 'conn-1',
        anchors: [
          { id: 'a1', ref: { item: 'node-A' } },
          { id: 'a2', ref: { item: 'node-B' } }
        ]
      }
    ],
    items: overrides.items ?? [],
    updateConnector: overrides.updateConnector ?? jest.fn(),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// entry / exit
// ---------------------------------------------------------------------------
describe('ReconnectAnchor.entry / exit', () => {
  beforeEach(() => jest.clearAllMocks());

  it('entry sets crosshair cursor', () => {
    ReconnectAnchor.entry!({ uiState: makeUiState(), scene: makeScene() } as any);
    expect(mockSetWindowCursor).toHaveBeenCalledWith('crosshair');
  });

  it('exit sets default cursor', () => {
    ReconnectAnchor.exit!({ uiState: makeUiState(), scene: makeScene() } as any);
    expect(mockSetWindowCursor).toHaveBeenCalledWith('default');
  });
});

// ---------------------------------------------------------------------------
// mousemove — guards
// ---------------------------------------------------------------------------
describe('ReconnectAnchor.mousemove guards', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does nothing when mode type is not RECONNECT_ANCHOR', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true, mousedownItem: null } });
    const scene = makeScene();
    ReconnectAnchor.mousemove!({ uiState, scene } as any);
    expect(scene.updateConnector).not.toHaveBeenCalled();
  });

  it('does nothing when hasMovedTile is false', () => {
    mockHasMovedTile.mockReturnValue(false);
    const uiState = makeUiState();
    const scene = makeScene();
    ReconnectAnchor.mousemove!({ uiState, scene } as any);
    expect(scene.updateConnector).not.toHaveBeenCalled();
  });

  it('does nothing when connector is not found in scene', () => {
    const uiState = makeUiState();
    const scene = makeScene({ connectors: [] });
    ReconnectAnchor.mousemove!({ uiState, scene } as any);
    expect(scene.updateConnector).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// mousemove — live preview
// ---------------------------------------------------------------------------
describe('ReconnectAnchor.mousemove live preview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasMovedTile.mockReturnValue(true);
    mockGetItemAtTile.mockReturnValue(null);
  });

  it('updates anchor ref to tile when cursor is over empty space', () => {
    const updateConnector = jest.fn();
    const scene = makeScene({ updateConnector });
    const uiState = makeUiState({
      mouse: { position: { tile: { x: 7, y: 3 } } }
    });

    ReconnectAnchor.mousemove!({ uiState, scene } as any);

    expect(updateConnector).toHaveBeenCalledWith(
      'conn-1',
      expect.objectContaining({
        anchors: expect.arrayContaining([
          expect.objectContaining({ id: 'a1', ref: { tile: { x: 7, y: 3 } } })
        ])
      })
    );
  });

  it('updates anchor ref to item when cursor is over a node', () => {
    mockGetItemAtTile.mockReturnValue({ type: 'ITEM', id: 'node-C' });
    const updateConnector = jest.fn();
    const scene = makeScene({ updateConnector });
    const uiState = makeUiState({
      mouse: { position: { tile: { x: 10, y: 10 } } }
    });

    ReconnectAnchor.mousemove!({ uiState, scene } as any);

    expect(updateConnector).toHaveBeenCalledWith(
      'conn-1',
      expect.objectContaining({
        anchors: expect.arrayContaining([
          expect.objectContaining({ id: 'a1', ref: { item: 'node-C' } })
        ])
      })
    );
  });

  it('only updates the matching anchor — other anchors are unchanged', () => {
    const updateConnector = jest.fn();
    const scene = makeScene({ updateConnector });
    const uiState = makeUiState({
      mouse: { position: { tile: { x: 7, y: 3 } } }
    });

    ReconnectAnchor.mousemove!({ uiState, scene } as any);

    const { anchors } = updateConnector.mock.calls[0][1];
    const unchanged = anchors.find((a: any) => a.id === 'a2');
    expect(unchanged.ref).toEqual({ item: 'node-B' });
  });
});

// ---------------------------------------------------------------------------
// mouseup
// ---------------------------------------------------------------------------
describe('ReconnectAnchor.mouseup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does nothing when mode type is not RECONNECT_ANCHOR', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true, mousedownItem: null } });
    const actions = { setMode: jest.fn(), setItemControls: jest.fn() };
    uiState.actions = actions;
    ReconnectAnchor.mouseup!({ uiState, scene: makeScene(), isRendererInteraction: true } as any);
    expect(actions.setMode).not.toHaveBeenCalled();
  });

  it('does nothing when isRendererInteraction is false', () => {
    const uiState = makeUiState();
    ReconnectAnchor.mouseup!({ uiState, scene: makeScene(), isRendererInteraction: false } as any);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
    expect(uiState.actions.setItemControls).not.toHaveBeenCalled();
  });

  it('switches to CURSOR mode on mouseup', () => {
    const uiState = makeUiState();
    ReconnectAnchor.mouseup!({ uiState, scene: makeScene(), isRendererInteraction: true } as any);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR', showCursor: true, mousedownItem: null })
    );
  });

  it('keeps connector selected (setItemControls with connector id) on mouseup', () => {
    const uiState = makeUiState();
    ReconnectAnchor.mouseup!({ uiState, scene: makeScene(), isRendererInteraction: true } as any);
    expect(uiState.actions.setItemControls).toHaveBeenCalledWith({ type: 'CONNECTOR', id: 'conn-1' });
  });
});
