/**
 * PERF + CORRECTNESS — rectangle DRAW / TRANSFORM modes (real modules)
 *
 * Drawing and resizing a rectangle used to call updateRectangle per tile with
 * NO drag transaction → a full-state immer `produce` every frame (jank) AND one
 * undo entry per tile. The fix routes the per-frame geometry write through the
 * immer-free batchUpdateRectangles inside a drag transaction. This pins:
 *   - draw/resize open exactly one drag transaction and commit it once,
 *   - the per-frame write goes through batchUpdateRectangles, NOT updateRectangle,
 *   - the computed bounds are correct.
 */

import { DrawRectangle } from 'src/interaction/modes/Rectangle/DrawRectangle';
import { TransformRectangle } from 'src/interaction/modes/Rectangle/TransformRectangle';

const mockSetWindowCursor = jest.fn();
const mockGenerateId = jest.fn(() => 'rect-new');

jest.mock('src/utils', () => {
  const actual = jest.requireActual('src/utils');
  return {
    ...actual,
    setWindowCursor: (...a: any[]) => mockSetWindowCursor(...a),
    generateId: () => mockGenerateId()
  };
});

function makeScene(overrides: any = {}) {
  return {
    // F4/LAY-03: the placement modes read the view's layers to validate the
    // active layer before stamping it onto the new entity.
    currentView: { layers: [] },
    rectangles: overrides.rectangles ?? [],
    colors: [{ id: 'c1', value: '#000' }],
    beginDragTransaction: jest.fn(),
    commitDragTransaction: jest.fn(),
    createRectangle: jest.fn(),
    updateRectangle: jest.fn(),
    batchUpdateRectangles: jest.fn(),
    ...overrides
  };
}

function makeUiState(overrides: any = {}) {
  return {
    mode: overrides.mode,
    mouse: overrides.mouse ?? {
      position: { tile: { x: 5, y: 5 } },
      mousedown: { tile: { x: 1, y: 1 } },
      delta: { tile: { x: 1, y: 1 } }
    },
    actions: { setMode: jest.fn(), ...overrides.actions }
  };
}

describe('DrawRectangle — immer-free draw (perf)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mousedown opens a drag transaction then creates the rectangle', () => {
    const scene = makeScene();
    const uiState = makeUiState({
      mode: { type: 'RECTANGLE.DRAW', showCursor: true, id: null }
    });
    DrawRectangle.mousedown!({
      uiState,
      scene,
      isRendererInteraction: true
    } as any);

    expect(scene.beginDragTransaction).toHaveBeenCalledTimes(1);
    expect(scene.createRectangle).toHaveBeenCalledTimes(1);
    // begin must precede create so the create lands inside the transaction.
    expect(
      scene.beginDragTransaction.mock.invocationCallOrder[0]
    ).toBeLessThan(scene.createRectangle.mock.invocationCallOrder[0]);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RECTANGLE.DRAW', id: 'rect-new' })
    );
  });

  it('mousemove resizes via batchUpdateRectangles (NOT the per-frame immer updateRectangle)', () => {
    const scene = makeScene({
      rectangles: [{ id: 'rect-new', from: { x: 1, y: 1 }, to: { x: 1, y: 1 } }]
    });
    const uiState = makeUiState({
      mode: { type: 'RECTANGLE.DRAW', showCursor: true, id: 'rect-new' },
      mouse: {
        position: { tile: { x: 5, y: 4 } },
        mousedown: { tile: { x: 1, y: 1 } },
        delta: { tile: { x: 1, y: 1 } }
      }
    });
    DrawRectangle.mousemove!({ uiState, scene } as any);

    expect(scene.batchUpdateRectangles).toHaveBeenCalledWith([
      { id: 'rect-new', from: { x: 1, y: 1 }, to: { x: 5, y: 4 } }
    ]);
    expect(scene.updateRectangle).not.toHaveBeenCalled();
  });

  it('mouseup commits the drag transaction and returns to CURSOR', () => {
    const scene = makeScene();
    const uiState = makeUiState({
      mode: { type: 'RECTANGLE.DRAW', showCursor: true, id: 'rect-new' }
    });
    DrawRectangle.mouseup!({ uiState, scene } as any);

    expect(scene.commitDragTransaction).toHaveBeenCalledTimes(1);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  it('exit commits any open transaction (abandon-draw safety net)', () => {
    const scene = makeScene();
    DrawRectangle.exit!({ scene } as any);
    expect(scene.commitDragTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('TransformRectangle — immer-free resize (perf)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('entry opens a drag transaction (one undo entry for the whole resize)', () => {
    const scene = makeScene();
    TransformRectangle.entry!({ scene } as any);
    expect(scene.beginDragTransaction).toHaveBeenCalledTimes(1);
  });

  it('mousemove resizes via batchUpdateRectangles (NOT updateRectangle)', () => {
    const scene = makeScene({
      rectangles: [{ id: 'r1', from: { x: 0, y: 0 }, to: { x: 4, y: 4 } }]
    });
    const uiState = makeUiState({
      mode: {
        type: 'RECTANGLE.TRANSFORM',
        showCursor: true,
        id: 'r1',
        selectedAnchor: 'BOTTOM_LEFT'
      },
      mouse: {
        position: { tile: { x: -2, y: 6 } },
        mousedown: { tile: { x: 0, y: 0 } },
        delta: { tile: { x: 1, y: 1 } }
      }
    });
    TransformRectangle.mousemove!({ uiState, scene } as any);

    expect(scene.batchUpdateRectangles).toHaveBeenCalledTimes(1);
    expect(scene.updateRectangle).not.toHaveBeenCalled();
    // The dragged corner moved; the write carries both from + to bounds.
    const arg = scene.batchUpdateRectangles.mock.calls[0][0][0];
    expect(arg.id).toBe('r1');
    expect(arg.from).toBeDefined();
    expect(arg.to).toBeDefined();
  });

  it('mouseup commits the resize before switching to CURSOR', () => {
    const scene = makeScene();
    const uiState = makeUiState({
      mode: {
        type: 'RECTANGLE.TRANSFORM',
        showCursor: true,
        id: 'r1',
        selectedAnchor: 'BOTTOM_LEFT'
      }
    });
    TransformRectangle.mouseup!({ uiState, scene } as any);

    expect(scene.commitDragTransaction).toHaveBeenCalledTimes(1);
    const commitOrder = scene.commitDragTransaction.mock.invocationCallOrder[0];
    const setModeOrder = uiState.actions.setMode.mock.invocationCallOrder[0];
    expect(commitOrder).toBeLessThan(setModeOrder);
  });

  it('exit commits any open transaction (abandon-resize safety net)', () => {
    const scene = makeScene();
    TransformRectangle.exit!({ scene } as any);
    expect(scene.commitDragTransaction).toHaveBeenCalledTimes(1);
  });
});
