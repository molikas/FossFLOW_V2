// @ts-nocheck
import { DrawRectangle } from '../modes/Rectangle/DrawRectangle';

const mockSetWindowCursor = jest.fn();
const mockGenerateId = jest.fn(() => 'new-rect-id');
const mockHasMovedTile = jest.fn(() => false);
const mockCreateRectangle = jest.fn();
const mockUpdateRectangle = jest.fn();
const mockBatchUpdateRectangles = jest.fn();
const mockBeginDragTransaction = jest.fn();
const mockCommitDragTransaction = jest.fn();
const mockSetMode = jest.fn();

jest.mock('src/utils', () => ({
  setWindowCursor: (c: string) => mockSetWindowCursor(c),
  generateId: () => mockGenerateId(),
  hasMovedTile: (mouse: unknown) => mockHasMovedTile(mouse)
}));

function makeUiState(overrides: Record<string, unknown> = {}) {
  return {
    mode: { type: 'RECTANGLE.DRAW', id: null, showCursor: true },
    mouse: {
      position: { tile: { x: 3, y: 4 } },
      mousedown: null
    },
    actions: { setMode: mockSetMode },
    ...overrides
  };
}

function makeScene(overrides: Record<string, unknown> = {}) {
  return {
    // F4/LAY-03: the placement modes read the view's layers to validate the
    // active layer before stamping it onto the new entity.
    currentView: { layers: [] },
    colors: [{ id: 'color1', value: '#ff0000' }],
    rectangles: [],
    createRectangle: mockCreateRectangle,
    updateRectangle: mockUpdateRectangle,
    batchUpdateRectangles: mockBatchUpdateRectangles,
    beginDragTransaction: mockBeginDragTransaction,
    commitDragTransaction: mockCommitDragTransaction,
    ...overrides
  };
}

const callArgs = {
  isRendererInteraction: true
};

beforeEach(() => {
  jest.clearAllMocks();
  mockHasMovedTile.mockReturnValue(false);
});

describe('DrawRectangle.entry', () => {
  it('sets cursor to crosshair on entry', () => {
    DrawRectangle.entry?.({ uiState: makeUiState() as any, scene: makeScene() as any, isRendererInteraction: false });
    expect(mockSetWindowCursor).toHaveBeenCalledWith('crosshair');
  });
});

describe('DrawRectangle.exit', () => {
  it('restores cursor to default on exit', () => {
    DrawRectangle.exit?.({ uiState: makeUiState() as any, scene: makeScene() as any, isRendererInteraction: false });
    expect(mockSetWindowCursor).toHaveBeenCalledWith('default');
  });

  it('commits any open draw transaction (abandon-draw safety net)', () => {
    DrawRectangle.exit?.({ uiState: makeUiState() as any, scene: makeScene() as any, isRendererInteraction: false });
    expect(mockCommitDragTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('DrawRectangle.mousedown', () => {
  it('creates a rectangle and updates mode id when interacting with renderer', () => {
    const uiState = makeUiState();
    const scene = makeScene();

    DrawRectangle.mousedown?.({ uiState: uiState as any, scene: scene as any, ...callArgs });

    expect(mockCreateRectangle).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-rect-id',
        color: 'color1',
        from: { x: 3, y: 4 },
        to: { x: 3, y: 4 }
      })
    );
    expect(mockSetMode).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-rect-id' })
    );
    // Opens the draw transaction before creating, so create+draw collapse to
    // one undo entry.
    expect(mockBeginDragTransaction).toHaveBeenCalledTimes(1);
    expect(mockBeginDragTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateRectangle.mock.invocationCallOrder[0]
    );
  });

  it('does nothing when mode type is not RECTANGLE.DRAW', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true, mousedownItem: null } });

    DrawRectangle.mousedown?.({ uiState: uiState as any, scene: makeScene() as any, ...callArgs });

    expect(mockCreateRectangle).not.toHaveBeenCalled();
    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('does nothing when not a renderer interaction', () => {
    const uiState = makeUiState();

    DrawRectangle.mousedown?.({
      uiState: uiState as any,
      scene: makeScene() as any,
      isRendererInteraction: false
    });

    expect(mockCreateRectangle).not.toHaveBeenCalled();
  });
});

describe('DrawRectangle.mousemove', () => {
  it('resizes via the immer-free batch path (not the per-frame updateRectangle)', () => {
    mockHasMovedTile.mockReturnValue(true);
    const uiState = makeUiState({
      mode: { type: 'RECTANGLE.DRAW', id: 'rect-1', showCursor: true },
      mouse: { position: { tile: { x: 7, y: 8 } }, mousedown: { tile: { x: 3, y: 4 } } }
    });
    // The `from` corner is fixed at the mousedown tile (read from the model).
    const scene = makeScene({
      rectangles: [{ id: 'rect-1', from: { x: 3, y: 4 }, to: { x: 3, y: 4 } }]
    });

    DrawRectangle.mousemove?.({ uiState: uiState as any, scene: scene as any, isRendererInteraction: true });

    expect(mockBatchUpdateRectangles).toHaveBeenCalledWith([
      { id: 'rect-1', from: { x: 3, y: 4 }, to: { x: 7, y: 8 } }
    ]);
    // The old full-state-immer-per-frame path must NOT run.
    expect(mockUpdateRectangle).not.toHaveBeenCalled();
  });

  it('does nothing when tile has not moved', () => {
    mockHasMovedTile.mockReturnValue(false);
    const uiState = makeUiState({
      mode: { type: 'RECTANGLE.DRAW', id: 'rect-1', showCursor: true },
      mouse: { position: { tile: { x: 3, y: 4 } }, mousedown: { tile: { x: 3, y: 4 } } }
    });

    DrawRectangle.mousemove?.({ uiState: uiState as any, scene: makeScene() as any, isRendererInteraction: true });

    expect(mockUpdateRectangle).not.toHaveBeenCalled();
  });

  it('does nothing when mode.id is null (no rectangle started yet)', () => {
    mockHasMovedTile.mockReturnValue(true);
    const uiState = makeUiState({
      mode: { type: 'RECTANGLE.DRAW', id: null, showCursor: true },
      mouse: { position: { tile: { x: 7, y: 8 } }, mousedown: { tile: { x: 3, y: 4 } } }
    });

    DrawRectangle.mousemove?.({ uiState: uiState as any, scene: makeScene() as any, isRendererInteraction: true });

    expect(mockUpdateRectangle).not.toHaveBeenCalled();
  });

  it('does nothing when mousedown is null', () => {
    mockHasMovedTile.mockReturnValue(true);
    const uiState = makeUiState({
      mode: { type: 'RECTANGLE.DRAW', id: 'rect-1', showCursor: true },
      mouse: { position: { tile: { x: 7, y: 8 } }, mousedown: null }
    });

    DrawRectangle.mousemove?.({ uiState: uiState as any, scene: makeScene() as any, isRendererInteraction: true });

    expect(mockUpdateRectangle).not.toHaveBeenCalled();
  });
});

describe('DrawRectangle.mouseup', () => {
  it('transitions to CURSOR mode when mode.id is set', () => {
    const uiState = makeUiState({
      mode: { type: 'RECTANGLE.DRAW', id: 'rect-1', showCursor: true }
    });

    DrawRectangle.mouseup?.({ uiState: uiState as any, scene: makeScene() as any, isRendererInteraction: false });

    expect(mockCommitDragTransaction).toHaveBeenCalledTimes(1);
    expect(mockSetMode).toHaveBeenCalledWith({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  });

  it('does nothing when mode.id is null (no rectangle was drawn)', () => {
    const uiState = makeUiState({
      mode: { type: 'RECTANGLE.DRAW', id: null, showCursor: true }
    });

    DrawRectangle.mouseup?.({ uiState: uiState as any, scene: makeScene() as any, isRendererInteraction: false });

    expect(mockSetMode).not.toHaveBeenCalled();
  });

  it('does nothing when mode type is not RECTANGLE.DRAW', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true, mousedownItem: null } });

    DrawRectangle.mouseup?.({ uiState: uiState as any, scene: makeScene() as any, isRendererInteraction: false });

    expect(mockSetMode).not.toHaveBeenCalled();
  });
});
