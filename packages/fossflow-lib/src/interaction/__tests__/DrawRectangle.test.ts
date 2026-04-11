// @ts-nocheck
import { DrawRectangle } from '../modes/Rectangle/DrawRectangle';

const mockSetWindowCursor = jest.fn();
const mockGenerateId = jest.fn(() => 'new-rect-id');
const mockHasMovedTile = jest.fn(() => false);
const mockCreateRectangle = jest.fn();
const mockUpdateRectangle = jest.fn();
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
    colors: [{ id: 'color1', value: '#ff0000' }],
    createRectangle: mockCreateRectangle,
    updateRectangle: mockUpdateRectangle,
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
  it('updates rectangle to position when mode.id is set and tile has moved', () => {
    mockHasMovedTile.mockReturnValue(true);
    const uiState = makeUiState({
      mode: { type: 'RECTANGLE.DRAW', id: 'rect-1', showCursor: true },
      mouse: { position: { tile: { x: 7, y: 8 } }, mousedown: { tile: { x: 3, y: 4 } } }
    });
    const scene = makeScene();

    DrawRectangle.mousemove?.({ uiState: uiState as any, scene: scene as any, isRendererInteraction: true });

    expect(mockUpdateRectangle).toHaveBeenCalledWith('rect-1', { to: { x: 7, y: 8 } });
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
