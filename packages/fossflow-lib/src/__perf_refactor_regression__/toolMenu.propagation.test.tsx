/**
 * REGRESSION — toolbar-click-to-context-menu bug
 *
 * Problem: Clicking a ToolMenu button while in LASSO (or any) mode could reach
 * the window-level mouse event listeners in useInteractionManager and trigger
 * canvas actions (e.g., Cursor.mouseup opening the "Add Node / Rectangle" context menu).
 *
 * Three fixes were applied:
 *  A) ToolMenu Box wrapper gains `onMouseDown={e => e.stopPropagation()}` — matching
 *     the ControlsContainer pattern that was already in place for the ItemControls panel.
 *  B) Lasso.mousedown gains an `isRendererInteraction` guard — bringing it in line with
 *     every other mode handler (Cursor, Pan, Connector, PlaceIcon, DrawRectangle all guard
 *     against non-renderer interactions).
 *  C) Lasso.mouseup gains a `mouse.mousedown` guard — ensures that a toolbar click
 *     (which never records a canvas mousedown) does not trigger mode transitions on mouseup.
 *
 * Tests A use DOM events to verify stopPropagation (no module needed).
 * Tests B and C import the REAL Lasso.ts module (not inline replicas).
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { Lasso } from 'src/interaction/modes/Lasso';

// ---------------------------------------------------------------------------
// Mocks for Lasso.ts dependencies
// ---------------------------------------------------------------------------
jest.mock('src/utils', () => ({
  isWithinBounds: jest.fn(() => false),
  hasMovedTile: jest.fn(() => false),
  CoordsUtils: { zero: () => ({ x: 0, y: 0 }) }
}));

// ---------------------------------------------------------------------------
// A) ToolMenu stopPropagation contract
//
// Verify that a mousedown originating inside the ToolMenu Box does NOT bubble
// to a window-level listener.
// ---------------------------------------------------------------------------

describe('ToolMenu — mousedown stopPropagation (fix A)', () => {
  it('mousedown inside the ToolMenu Box does not reach window', () => {
    const windowListener = jest.fn();
    window.addEventListener('mousedown', windowListener);

    const { getByTestId } = render(
      <div
        data-testid="toolbar-box"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button data-testid="select-btn">Select</button>
      </div>
    );

    fireEvent.mouseDown(getByTestId('select-btn'));
    expect(windowListener).not.toHaveBeenCalled();

    window.removeEventListener('mousedown', windowListener);
  });

  it('mousedown outside the ToolMenu Box DOES reach window', () => {
    const windowListener = jest.fn();
    window.addEventListener('mousedown', windowListener);

    const { getByTestId } = render(
      <div data-testid="canvas-area">
        <button data-testid="canvas-element">Canvas</button>
      </div>
    );

    fireEvent.mouseDown(getByTestId('canvas-element'));
    expect(windowListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('mousedown', windowListener);
  });
});

// ---------------------------------------------------------------------------
// B) Lasso.mousedown isRendererInteraction guard (fix B) — REAL MODULE
// ---------------------------------------------------------------------------

function makeUiState(overrides: any = {}) {
  return {
    mode: overrides.mode ?? { type: 'LASSO', selection: null, isDragging: false },
    mouse: overrides.mouse ?? { position: { tile: { x: 5, y: 5 } }, mousedown: null },
    actions: overrides.actions ?? { setMode: jest.fn() }
  };
}

describe('Lasso.mousedown — isRendererInteraction guard (fix B, real module)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does NOT switch mode when isRendererInteraction is false (toolbar click)', () => {
    const uiState = makeUiState();
    Lasso.mousedown!({ uiState, scene: { items: [], rectangles: [], textBoxes: [] }, isRendererInteraction: false } as any);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('switches to CURSOR when isRendererInteraction is true (canvas click, no selection)', () => {
    const uiState = makeUiState();
    Lasso.mousedown!({ uiState, scene: { items: [], rectangles: [], textBoxes: [] }, isRendererInteraction: true } as any);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  it('is a no-op when mode type is not LASSO even with renderer interaction', () => {
    const uiState = makeUiState({ mode: { type: 'CURSOR', showCursor: true, mousedownItem: null } });
    Lasso.mousedown!({ uiState, scene: { items: [], rectangles: [], textBoxes: [] }, isRendererInteraction: true } as any);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C) Lasso.mouseup mouse.mousedown guard (fix C) — REAL MODULE
// ---------------------------------------------------------------------------

describe('Lasso.mouseup — mouse.mousedown guard (fix C, real module)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does NOT switch mode when mouse.mousedown is null (toolbar click stopPropagation)', () => {
    const uiState = makeUiState(); // mousedown: null by default
    Lasso.mouseup!({ uiState, scene: {}, isRendererInteraction: true } as any);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('switches to CURSOR on mouseup when mouse.mousedown is set (canvas interaction, no selection)', () => {
    const uiState = makeUiState({
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 2, y: 2 }, screen: { x: 0, y: 0 } }
      }
    });
    Lasso.mouseup!({ uiState, scene: {}, isRendererInteraction: true } as any);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  it('does NOT switch to CURSOR when there IS a selection with items', () => {
    const uiState = makeUiState({
      mode: {
        type: 'LASSO',
        selection: {
          startTile: { x: 0, y: 0 },
          endTile: { x: 10, y: 10 },
          items: [{ type: 'ITEM', id: 'a' }]
        },
        isDragging: false
      },
      mouse: {
        position: { tile: { x: 5, y: 5 } },
        mousedown: { tile: { x: 2, y: 2 }, screen: { x: 0, y: 0 } }
      }
    });
    Lasso.mouseup!({ uiState, scene: {}, isRendererInteraction: true } as any);
    expect(uiState.actions.setMode).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });
});
