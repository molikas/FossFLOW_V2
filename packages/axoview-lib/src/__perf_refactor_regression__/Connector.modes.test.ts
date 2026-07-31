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
const mockHasMovedTile = jest.fn<any, any>(() => true);
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
    deleteConnector: jest.fn(),
    beginDragTransaction: jest.fn(),
    commitDragTransaction: jest.fn(),
    ...overrides
  };
}

function makeUiState(overrides: any = {}) {
  return {
    mode: overrides.mode ?? { type: 'CONNECTOR', showCursor: true, id: null },
    mouse: overrides.mouse ?? { position: { tile: { x: 5, y: 5 } } },
    connectorInteractionMode: overrides.connectorInteractionMode ?? 'click',
    connectorDefaults: overrides.connectorDefaults ?? {},
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

  it('arms a free-floating (tile-anchored) connector on empty space (ADR 0022 addendum)', () => {
    // Empty start is allowed so the user can draw a line on the canvas. The
    // stray-click guard now lives on mouseup: a lone click that started on empty
    // is reverted; a deliberate drag draws the line. Here the press ARMS a
    // tile-anchored connector and opens the transaction.
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

    expect(scene.beginDragTransaction).toHaveBeenCalledTimes(1);
    expect(scene.createConnector).toHaveBeenCalledTimes(1);
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

  // #8 (2026-07-01): committing via the second click resets connectorDefaults
  // so the next connector draws with the baseline style (one-shot pre-draw).
  it('resets connectorDefaults after the second click (click mode)', () => {
    const resetConnectorDefaults = jest.fn();
    const existingConnector = {
      id: 'conn-1',
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
        id: 'conn-1',
        startAnchor: { tile: { x: 2, y: 2 } },
        isConnecting: true
      },
      connectorInteractionMode: 'click',
      connectorDefaults: { style: 'DASHED' },
      actions: { setMode: jest.fn(), resetConnectorDefaults }
    });
    Connector.mousedown!({
      uiState,
      scene: makeScene({ connectors: [existingConnector] }),
      isRendererInteraction: true
    } as any);
    expect(resetConnectorDefaults).toHaveBeenCalledTimes(1);
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
        returnToCursor: true // set by the LeftDock 'Connector' tool button (CommonElements.handleConnectorMouseDown)
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

  it('applies connectorDefaults (pre-draw style) to the new connector', () => {
    const uiState = makeUiState({
      mode: { type: 'CONNECTOR', showCursor: true, id: null },
      connectorInteractionMode: 'drag',
      connectorDefaults: {
        color: 'color-9',
        style: 'DASHED',
        lineType: 'DOUBLE',
        width: 25,
        showArrow: false
      }
    });
    const scene = makeScene();
    Connector.mousedown!({
      uiState,
      scene,
      isRendererInteraction: true
    } as any);

    const [created] = scene.createConnector.mock.calls[0];
    expect(created).toMatchObject({
      color: 'color-9',
      style: 'DASHED',
      lineType: 'DOUBLE',
      width: 25,
      showArrow: false
    });
  });

  it('preserves returnToCursor across drag-start (palette one-shot tool)', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: null,
        returnToCursor: true
      },
      connectorInteractionMode: 'drag'
    });
    Connector.mousedown!({
      uiState,
      scene: makeScene(),
      isRendererInteraction: true
    } as any);

    // Without preserving this, the dragged connector would leave the tool armed
    // instead of resetting to the pointer on release.
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CONNECTOR', returnToCursor: true })
    );
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

  // I4/CONN-07: a drag-mode release only commits when the gesture actually
  // TRAVELLED and the result has two distinct ends. Before wave 3 this handler
  // committed whatever `anchors[1]` last resolved to with no tap-slop check, so
  // a zero-travel press-release on empty canvas committed the start tile twice.
  // These helpers supply the real drawn connector + travelled gesture the
  // commit path now requires.
  const drawnConnector = (overrides: any = {}) => ({
    id: 'conn-1',
    anchors: [
      { id: 'a1', ref: { tile: { x: 1, y: 1 } } },
      { id: 'a2', ref: { tile: { x: 5, y: 5 } } }
    ],
    ...overrides
  });
  const travelledMouse = {
    position: { tile: { x: 5, y: 5 }, screen: { x: 400, y: 400 } },
    mousedown: { tile: { x: 1, y: 1 }, screen: { x: 100, y: 100 } }
  };

  it('resets id to null in drag mode', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: 'conn-1',
        isConnecting: false
      },
      mouse: travelledMouse,
      connectorInteractionMode: 'drag'
    });
    const scene = makeScene({ connectors: [drawnConnector()] });
    Connector.mouseup!({ uiState, scene } as any);
    expect(scene.deleteConnector).not.toHaveBeenCalled();
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CONNECTOR', id: null })
    );
  });

  it('returns to CURSOR on release in drag mode when returnToCursor is set', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: 'conn-1',
        returnToCursor: true
      },
      mouse: travelledMouse,
      connectorInteractionMode: 'drag'
    });
    Connector.mouseup!({
      uiState,
      scene: makeScene({ connectors: [drawnConnector()] })
    } as any);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      })
    );
  });

  // #8 (2026-07-01): a pre-draw style is one-shot — committing a connector
  // resets connectorDefaults so the NEXT draw uses the baseline (no sticky
  // last-used style). Drag-mode commit path.
  it('resets connectorDefaults after committing (drag mode)', () => {
    const resetConnectorDefaults = jest.fn();
    const uiState = makeUiState({
      mode: { type: 'CONNECTOR', showCursor: true, id: 'conn-1' },
      mouse: travelledMouse,
      connectorInteractionMode: 'drag',
      connectorDefaults: { style: 'DASHED' },
      actions: { setMode: jest.fn(), resetConnectorDefaults }
    });
    Connector.mouseup!({
      uiState,
      scene: makeScene({ connectors: [drawnConnector()] })
    } as any);
    expect(resetConnectorDefaults).toHaveBeenCalledTimes(1);
  });

  // Promoted from the exploratory lane (I4/CONN-07 + CONN-10).
  it('CONN-07: a zero-travel drag-mode release reverts instead of committing', () => {
    const uiState = makeUiState({
      mode: { type: 'CONNECTOR', showCursor: true, id: 'conn-1' },
      // Pressed and released on the same spot — no travel.
      mouse: {
        position: { tile: { x: 5, y: 5 }, screen: { x: 100, y: 100 } },
        mousedown: { tile: { x: 5, y: 5 }, screen: { x: 100, y: 100 } }
      },
      connectorInteractionMode: 'drag'
    });
    const scene = makeScene({
      connectors: [
        drawnConnector({
          anchors: [
            { id: 'a1', ref: { tile: { x: 5, y: 5 } } },
            { id: 'a2', ref: { tile: { x: 5, y: 5 } } }
          ]
        })
      ]
    });

    Connector.mouseup!({ uiState, scene } as any);

    expect(scene.deleteConnector).toHaveBeenCalledWith('conn-1');
    expect(scene.commitDragTransaction).toHaveBeenCalled();
  });

  it('CONN-10: a travelled drag whose ends coincide reverts too (self-loop)', () => {
    const uiState = makeUiState({
      mode: { type: 'CONNECTOR', showCursor: true, id: 'conn-1' },
      mouse: travelledMouse,
      connectorInteractionMode: 'drag'
    });
    const scene = makeScene({
      connectors: [
        drawnConnector({
          anchors: [
            { id: 'a1', ref: { item: 'node-1' } },
            { id: 'a2', ref: { item: 'node-1' } }
          ]
        })
      ]
    });

    Connector.mouseup!({ uiState, scene } as any);

    expect(scene.deleteConnector).toHaveBeenCalledWith('conn-1');
  });

  it('click mode, press-DRAG-release (travel past slop): completes the connector on mouseup', () => {
    // Regression: the connector hint advertises "drag between items to connect",
    // but in the default click mode a drag only ARMED the connector on mousedown
    // and the release was a no-op — leaving a provisional connector glued to the
    // cursor (the "connector is locked / left-click won't place it" bug). A drag
    // must now commit on release.
    const connector = {
      id: 'conn-1',
      color: 'color-1',
      anchors: [
        { id: 'a0', ref: { item: 'node-A' } },
        { id: 'a1', ref: { tile: { x: 5, y: 5 } } }
      ]
    };
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: 'conn-1',
        isConnecting: true,
        startAnchor: { itemId: 'node-A' }
      },
      connectorInteractionMode: 'click',
      // down far from up → drag → must complete.
      mouse: {
        position: { screen: { x: 200, y: 160 }, tile: { x: 9, y: 7 } },
        mousedown: { screen: { x: 10, y: 10 }, tile: { x: 5, y: 5 } }
      }
    });
    const scene = makeScene({ connectors: [connector] });
    Connector.mouseup!({ uiState, scene } as any);
    expect(scene.updateConnector).toHaveBeenCalledWith('conn-1', expect.any(Object));
    expect(scene.commitDragTransaction).toHaveBeenCalled();
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CONNECTOR', id: null, isConnecting: false })
    );
  });

  it('click mode, DRAG from EMPTY (free line): commits the free-floating connector on release', () => {
    // ADR 0022 addendum: a deliberate drag that started on empty canvas draws a
    // free-floating line and commits on release — same completion path as a node
    // start, just with a tile start anchor.
    const connector = {
      id: 'conn-1',
      color: 'color-1',
      anchors: [
        { id: 'a0', ref: { tile: { x: 1, y: 1 } } },
        { id: 'a1', ref: { tile: { x: 5, y: 5 } } }
      ]
    };
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: 'conn-1',
        isConnecting: true,
        startAnchor: { tile: { x: 1, y: 1 } }
      },
      connectorInteractionMode: 'click',
      mouse: {
        position: { screen: { x: 220, y: 180 }, tile: { x: 9, y: 7 } },
        mousedown: { screen: { x: 10, y: 10 }, tile: { x: 1, y: 1 } }
      }
    });
    const scene = makeScene({ connectors: [connector] });
    Connector.mouseup!({ uiState, scene } as any);
    expect(scene.updateConnector).toHaveBeenCalledWith('conn-1', expect.any(Object));
    expect(scene.commitDragTransaction).toHaveBeenCalled();
    expect(scene.deleteConnector).not.toHaveBeenCalled();
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CONNECTOR', id: null, isConnecting: false })
    );
  });

  it('click mode, lone CLICK that started on EMPTY: reverts the provisional connector (stray-click guard)', () => {
    // The stray-click guard: a click (no travel) that started on empty canvas
    // must leave NOTHING behind — the provisional connector is deleted and the
    // transaction closed, so no free-floating junk is saved (ADR 0022).
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: 'conn-1',
        isConnecting: true,
        startAnchor: { tile: { x: 5, y: 5 } }
      },
      connectorInteractionMode: 'click',
      mouse: {
        position: { screen: { x: 12, y: 11 }, tile: { x: 5, y: 5 } },
        mousedown: { screen: { x: 10, y: 10 }, tile: { x: 5, y: 5 } }
      }
    });
    const scene = makeScene();
    Connector.mouseup!({ uiState, scene } as any);
    expect(scene.deleteConnector).toHaveBeenCalledWith('conn-1');
    expect(scene.commitDragTransaction).toHaveBeenCalled();
    expect(scene.updateConnector).not.toHaveBeenCalled();
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CONNECTOR', id: null, isConnecting: false })
    );
  });

  it('click mode, lone CLICK that started on a NODE: stays armed (no revert)', () => {
    const uiState = makeUiState({
      mode: {
        type: 'CONNECTOR',
        showCursor: true,
        id: 'conn-1',
        isConnecting: true,
        startAnchor: { itemId: 'node-A' }
      },
      connectorInteractionMode: 'click',
      mouse: {
        position: { screen: { x: 12, y: 11 }, tile: { x: 5, y: 5 } },
        mousedown: { screen: { x: 10, y: 10 }, tile: { x: 5, y: 5 } }
      }
    });
    const scene = makeScene();
    Connector.mouseup!({ uiState, scene } as any);
    expect(scene.deleteConnector).not.toHaveBeenCalled();
    expect(scene.commitDragTransaction).not.toHaveBeenCalled();
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
