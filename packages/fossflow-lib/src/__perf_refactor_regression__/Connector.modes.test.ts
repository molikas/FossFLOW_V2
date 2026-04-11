/**
 * REGRESSION — Connector mode handler contracts (real module)
 *
 * Covers entry/exit cursors, click-mode first/second click flow,
 * drag-mode connector creation, and mouseup reset.
 */

import { Connector } from 'src/interaction/modes/Connector';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockSetWindowCursor = jest.fn();
const mockGetItemAtTile = jest.fn<any, any>(() => null);
const mockHasMovedTile = jest.fn(() => true);
let idCounter = 0;
const mockGenerateId = jest.fn(() => `id-${++idCounter}`);

jest.mock('src/utils', () => ({
  setWindowCursor: (...args: any[]) => mockSetWindowCursor(...args),
  getItemAtTile: (...args: any[]) => mockGetItemAtTile(...args),
  hasMovedTile: (...args: any[]) => mockHasMovedTile(...args),
  generateId: () => mockGenerateId(),
  getItemByIdOrThrow: jest.fn((arr: any[], id: string) => {
    const index = arr.findIndex((i: any) => i.id === id);
    if (index === -1) throw new Error(`Not found: ${id}`);
    return { index, value: arr[index] };
  })
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeScene(overrides: any = {}) {
  return {
    colors: [{ id: 'color-1' }],
    items: [],
    textBoxes: [],
    rectangles: [],
    connectors: [],
    currentView: { connectors: overrides.connectors ?? [] },
    createConnector: jest.fn(),
    updateConnector: jest.fn(),
    ...overrides
  };
}

function makeUiState(overrides: any = {}) {
  return {
    mode: overrides.mode ?? { type: 'CONNECTOR', showCursor: true, id: null },
    mouse: overrides.mouse ?? { position: { tile: { x: 5, y: 5 } } },
    connectorInteractionMode: overrides.connectorInteractionMode ?? 'click',
    actions: overrides.actions ?? { setMode: jest.fn() }
  };
}

// ---------------------------------------------------------------------------
// entry / exit
// ---------------------------------------------------------------------------
describe('Connector.entry / exit', () => {
  beforeEach(() => jest.clearAllMocks());

  it('entry sets crosshair cursor', () => {
    Connector.entry!({ uiState: makeUiState(), scene: makeScene() } as any);
    expect(mockSetWindowCursor).toHaveBeenCalledWith('crosshair');
  });

  it('exit sets default cursor', () => {
    Connector.exit!({ uiState: makeUiState(), scene: makeScene() } as any);
    expect(mockSetWindowCursor).toHaveBeenCalledWith('default');
  });
});

// ---------------------------------------------------------------------------
// mousedown — guards
// ---------------------------------------------------------------------------
describe('Connector.mousedown guards', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does nothing when mode type is not CONNECTOR', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true } });
    const scene = makeScene();
    Connector.mousedown!({
      uiState,
      scene,
      isRendererInteraction: true
    } as any);
    expect(scene.createConnector).not.toHaveBeenCalled();
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('does nothing when isRendererInteraction is false', () => {
    const uiState = makeUiState();
    const scene = makeScene();
    Connector.mousedown!({
      uiState,
      scene,
      isRendererInteraction: false
    } as any);
    expect(scene.createConnector).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// mousedown — click mode, first click
// ---------------------------------------------------------------------------
describe('Connector.mousedown click mode — first click', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    idCounter = 0;
    mockGetItemAtTile.mockReturnValue(null);
  });

  it('creates connector with tile anchors on empty space and sets isConnecting=true', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: null,
        startAnchor: undefined,
        isConnecting: false
      },
      connectorInteractionMode: 'click'
    });
    const scene = makeScene();
    Connector.mousedown!({
      uiState,
      scene,
      isRendererInteraction: true
    } as any);

    expect(scene.createConnector).toHaveBeenCalledWith(
      expect.objectContaining({
        anchors: expect.arrayContaining([
          expect.objectContaining({ ref: { tile: { x: 5, y: 5 } } })
        ])
      })
    );
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CONNECTOR',
        isConnecting: true,
        startAnchor: { tile: { x: 5, y: 5 } }
      })
    );
  });

  it('creates connector with item anchors when clicking on a node', () => {
    mockGetItemAtTile.mockReturnValue({ type: 'ITEM', id: 'node1' });
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: null,
        startAnchor: undefined,
        isConnecting: false
      },
      connectorInteractionMode: 'click'
    });
    const scene = makeScene();
    Connector.mousedown!({
      uiState,
      scene,
      isRendererInteraction: true
    } as any);

    expect(scene.createConnector).toHaveBeenCalledWith(
      expect.objectContaining({
        anchors: expect.arrayContaining([
          expect.objectContaining({ ref: { item: 'node1' } })
        ])
      })
    );
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ startAnchor: { itemId: 'node1' } })
    );
  });
});

// ---------------------------------------------------------------------------
// mousedown — click mode, second click
// ---------------------------------------------------------------------------
describe('Connector.mousedown click mode — second click', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    idCounter = 0;
    mockGetItemAtTile.mockReturnValue(null);
  });

  it('does nothing when connector id is null on second click (no active connector)', () => {
    // When id is null the `if (currentMode.id)` guard skips the finalize block.
    // This is a defensive guard — in practice id is always set when isConnecting=true.
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: null,
        startAnchor: { tile: { x: 2, y: 2 } }, // startAnchor defined → second click path
        isConnecting: true
      },
      connectorInteractionMode: 'click'
    });
    const scene = makeScene({ connectors: [] });
    Connector.mousedown!({
      uiState,
      scene,
      isRendererInteraction: true
    } as any);

    // id is null → the if (currentMode.id) guard fails → setMode not called
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('finalizes connector and resets mode on second click (tile anchor)', () => {
    const connectorId = 'conn-1';
    const existingConnector = {
      id: connectorId,
      color: 'color-1',
      anchors: [
        { id: 'a1', ref: { tile: { x: 2, y: 2 } } },
        { id: 'a2', ref: { tile: { x: 2, y: 2 } } }
      ]
    };
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: connectorId,
        startAnchor: { tile: { x: 2, y: 2 } },
        isConnecting: true
      },
      connectorInteractionMode: 'click'
    });
    const scene = makeScene({ connectors: [existingConnector] });
    Connector.mousedown!({
      uiState,
      scene,
      isRendererInteraction: true
    } as any);

    expect(scene.updateConnector).toHaveBeenCalledWith(
      connectorId,
      expect.objectContaining({
        anchors: expect.arrayContaining([
          expect.objectContaining({ ref: { tile: { x: 5, y: 5 } } })
        ])
      })
    );
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        isConnecting: false,
        id: null,
        startAnchor: undefined
      })
    );
  });

  it('switches to CURSOR mode on second click when returnToCursor is set', () => {
    const connectorId = 'conn-2';
    const existingConnector = {
      id: connectorId,
      color: 'color-1',
      anchors: [
        { id: 'a1', ref: { tile: { x: 2, y: 2 } } },
        { id: 'a2', ref: { tile: { x: 2, y: 2 } } }
      ]
    };
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: connectorId,
        startAnchor: { itemId: 'node-A' },
        isConnecting: true,
        returnToCursor: true // set by NodeActionBar "Start connector" button
      },
      connectorInteractionMode: 'click'
    });
    const scene = makeScene({ connectors: [existingConnector] });
    Connector.mousedown!({
      uiState,
      scene,
      isRendererInteraction: true
    } as any);

    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      })
    );
    // Must NOT reset back to CONNECTOR mode
    expect(uiState.actions.setMode).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CONNECTOR' })
    );
  });

  it('stays in CONNECTOR mode on second click when returnToCursor is not set', () => {
    const connectorId = 'conn-3';
    const existingConnector = {
      id: connectorId,
      color: 'color-1',
      anchors: [
        { id: 'a1', ref: { tile: { x: 2, y: 2 } } },
        { id: 'a2', ref: { tile: { x: 2, y: 2 } } }
      ]
    };
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: connectorId,
        startAnchor: { tile: { x: 2, y: 2 } },
        isConnecting: true
        // returnToCursor not set → normal toolbar-initiated connection
      },
      connectorInteractionMode: 'click'
    });
    const scene = makeScene({ connectors: [existingConnector] });
    Connector.mousedown!({
      uiState,
      scene,
      isRendererInteraction: true
    } as any);

    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CONNECTOR',
        id: null,
        isConnecting: false
      })
    );
    expect(uiState.actions.setMode).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });
});

// ---------------------------------------------------------------------------
// mousedown — drag mode
// ---------------------------------------------------------------------------
describe('Connector.mousedown drag mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    idCounter = 0;
    mockGetItemAtTile.mockReturnValue(null);
  });

  it('creates connector with tile anchors and sets mode with new connector id', () => {
    const uiState = makeUiState({
      mode: { type: 'CONNECTOR', showCursor: true, id: null },
      connectorInteractionMode: 'drag'
    });
    const scene = makeScene();
    Connector.mousedown!({
      uiState,
      scene,
      isRendererInteraction: true
    } as any);

    expect(scene.createConnector).toHaveBeenCalled();
    const [createdConnector] = scene.createConnector.mock.calls[0];
    expect(createdConnector.anchors).toHaveLength(2);
    expect(createdConnector.anchors[0].ref).toEqual({ tile: { x: 5, y: 5 } });

    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CONNECTOR', id: createdConnector.id })
    );
    // drag mode does NOT set isConnecting
    expect(uiState.actions.setMode).not.toHaveBeenCalledWith(
      expect.objectContaining({ isConnecting: true })
    );
  });

  it('creates connector with item anchors when clicking on a node', () => {
    mockGetItemAtTile.mockReturnValue({ type: 'ITEM', id: 'nodeA' });
    const uiState = makeUiState({
      mode: { type: 'CONNECTOR', showCursor: true, id: null },
      connectorInteractionMode: 'drag'
    });
    const scene = makeScene();
    Connector.mousedown!({
      uiState,
      scene,
      isRendererInteraction: true
    } as any);

    const [createdConnector] = scene.createConnector.mock.calls[0];
    expect(createdConnector.anchors[0].ref).toEqual({ item: 'nodeA' });
  });
});

// ---------------------------------------------------------------------------
// mouseup — drag mode
// ---------------------------------------------------------------------------
describe('Connector.mouseup drag mode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does nothing when mode type is not CONNECTOR', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true } });
    Connector.mouseup!({ uiState, scene: makeScene() } as any);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('does nothing when mode.id is null (no active connector)', () => {
    const uiState = makeUiState({
      mode: { type: 'CONNECTOR', showCursor: true, id: null },
      connectorInteractionMode: 'drag'
    });
    Connector.mouseup!({ uiState, scene: makeScene() } as any);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('resets id to null in drag mode', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: 'conn-1',
        isConnecting: false
      },
      connectorInteractionMode: 'drag'
    });
    Connector.mouseup!({ uiState, scene: makeScene() } as any);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CONNECTOR', id: null })
    );
  });

  it('does NOT reset mode in click mode (click mode completes on second mousedown)', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: 'conn-1',
        isConnecting: true
      },
      connectorInteractionMode: 'click'
    });
    Connector.mouseup!({ uiState, scene: makeScene() } as any);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// mousemove
// ---------------------------------------------------------------------------
describe('Connector.mousemove', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasMovedTile.mockReturnValue(true);
    mockGetItemAtTile.mockReturnValue(null);
  });

  it('does nothing when mode type is not CONNECTOR', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true } });
    const scene = makeScene();
    Connector.mousemove!({ uiState, scene } as any);
    expect(scene.updateConnector).not.toHaveBeenCalled();
  });

  it('does nothing when mode.id is null', () => {
    const uiState = makeUiState({
      mode: { type: 'CONNECTOR', showCursor: true, id: null }
    });
    const scene = makeScene();
    Connector.mousemove!({ uiState, scene } as any);
    expect(scene.updateConnector).not.toHaveBeenCalled();
  });

  it('does nothing when hasMovedTile is false', () => {
    mockHasMovedTile.mockReturnValue(false);
    const connectorId = 'conn-1';
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: connectorId,
        isConnecting: true
      },
      connectorInteractionMode: 'drag'
    });
    const existingConnector = {
      id: connectorId,
      color: 'color-1',
      anchors: [
        { id: 'a1', ref: { tile: { x: 2, y: 2 } } },
        { id: 'a2', ref: { tile: { x: 2, y: 2 } } }
      ]
    };
    const scene = makeScene({ connectors: [existingConnector] });
    Connector.mousemove!({ uiState, scene } as any);
    expect(scene.updateConnector).not.toHaveBeenCalled();
  });

  it('updates second anchor to tile position in drag mode when mouse has moved', () => {
    const connectorId = 'conn-1';
    const existingConnector = {
      id: connectorId,
      color: 'color-1',
      anchors: [
        { id: 'a1', ref: { tile: { x: 2, y: 2 } } },
        { id: 'a2', ref: { tile: { x: 2, y: 2 } } }
      ]
    };
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: connectorId,
        isConnecting: false
      },
      connectorInteractionMode: 'drag',
      mouse: { position: { tile: { x: 8, y: 8 } } }
    });
    const scene = makeScene({ connectors: [existingConnector] });
    Connector.mousemove!({ uiState, scene } as any);

    expect(scene.updateConnector).toHaveBeenCalledWith(
      connectorId,
      expect.objectContaining({
        anchors: expect.arrayContaining([
          expect.objectContaining({ ref: { tile: { x: 8, y: 8 } } })
        ])
      })
    );
  });

  it('snaps second anchor to item ref when cursor is over an item', () => {
    mockGetItemAtTile.mockReturnValue({ type: 'ITEM', id: 'target-node' });
    const connectorId = 'conn-1';
    const existingConnector = {
      id: connectorId,
      color: 'color-1',
      anchors: [
        { id: 'a1', ref: { tile: { x: 2, y: 2 } } },
        { id: 'a2', ref: { tile: { x: 2, y: 2 } } }
      ]
    };
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: connectorId,
        isConnecting: true
      },
      connectorInteractionMode: 'click',
      mouse: { position: { tile: { x: 8, y: 8 } } }
    });
    const scene = makeScene({ connectors: [existingConnector] });
    Connector.mousemove!({ uiState, scene } as any);

    expect(scene.updateConnector).toHaveBeenCalledWith(
      connectorId,
      expect.objectContaining({
        anchors: expect.arrayContaining([
          expect.objectContaining({ ref: { item: 'target-node' } })
        ])
      })
    );
  });
});
