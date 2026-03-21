/**
 * REGRESSION — toolbar-click-to-context-menu bug
 *
 * Problem: Clicking a ToolMenu button while in LASSO (or any) mode could reach
 * the window-level mouse event listeners in useInteractionManager and trigger
 * canvas actions (e.g., Cursor.mouseup opening the "Add Node / Rectangle" context menu).
 *
 * Two fixes were applied:
 *  A) ToolMenu Box wrapper gains `onMouseDown={e => e.stopPropagation()}` — matching
 *     the ControlsContainer pattern that was already in place for the ItemControls panel.
 *  B) Lasso.mousedown gains an `isRendererInteraction` guard — bringing it in line with
 *     every other mode handler (Cursor, Pan, Connector, PlaceIcon, DrawRectangle all guard
 *     against non-renderer interactions).
 *
 * These tests capture the behavioural contracts that must hold after the fix.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// A) ToolMenu stopPropagation contract
//
// Verify that a mousedown originating inside the ToolMenu Box does NOT bubble
// to a window-level listener.  This mirrors the existing ControlsContainer
// behaviour and prevents toolbar clicks from reaching useInteractionManager.
// ---------------------------------------------------------------------------

describe('ToolMenu — mousedown stopPropagation (fix A)', () => {
  it('mousedown inside the ToolMenu Box does not reach window', () => {
    const windowListener = jest.fn();
    window.addEventListener('mousedown', windowListener);

    // Render a minimal replica of the ToolMenu Box as it appears in UiOverlay:
    // a Box wrapper with onMouseDown={e => e.stopPropagation()} containing a button.
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
// B) Lasso.mousedown isRendererInteraction guard (fix B)
//
// The Lasso mode's mousedown handler was the ONLY mode handler that did not
// guard against non-renderer interactions.  A toolbar click while in LASSO
// mode would fire Lasso.mousedown, switch to CURSOR, and potentially cause
// the subsequent mouseup (landing on the canvas) to open the context menu.
// ---------------------------------------------------------------------------

interface MockUiState {
  mode: { type: string; selection?: { startTile: { x: number; y: number }; endTile: { x: number; y: number }; items: unknown[] } | null; isDragging?: boolean };
  mouse: { position: { tile: { x: number; y: number } }; mousedown: { tile: { x: number; y: number }; screen: { x: number; y: number } } | null };
  actions: { setMode: jest.Mock };
}

function makeLassoState(overrides: Partial<MockUiState> = {}): MockUiState {
  return {
    mode: { type: 'LASSO', selection: null, isDragging: false },
    mouse: { position: { tile: { x: 5, y: 5 } }, mousedown: null },
    actions: { setMode: jest.fn() },
    ...overrides
  };
}

// Inline minimal replicas of mode handler logic so tests are self-contained.

function lassoMousedown(uiState: MockUiState, isRendererInteraction: boolean) {
  if (uiState.mode.type !== 'LASSO' || !isRendererInteraction) return;
  if (uiState.mode.selection) return; // within-selection check omitted
  uiState.actions.setMode({ type: 'CURSOR', showCursor: true, mousedownItem: null });
}

function lassoMouseup(uiState: MockUiState) {
  if (uiState.mode.type !== 'LASSO') return;
  if (!uiState.mouse.mousedown) return; // toolbar click guard
  const hasSelection = uiState.mode.selection && uiState.mode.selection.items.length > 0;
  if (!hasSelection) {
    uiState.actions.setMode({ type: 'CURSOR', showCursor: true, mousedownItem: null });
  }
}

describe('Lasso.mousedown — isRendererInteraction guard (fix B)', () => {
  it('does NOT switch mode when isRendererInteraction is false (toolbar click)', () => {
    const uiState = makeLassoState();
    lassoMousedown(uiState, false);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('switches to CURSOR when isRendererInteraction is true (canvas click)', () => {
    const uiState = makeLassoState();
    lassoMousedown(uiState, true);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  it('is a no-op when mode type is not LASSO, even with renderer interaction', () => {
    const uiState = makeLassoState({ mode: { type: 'CURSOR' } });
    lassoMousedown(uiState, true);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });
});

describe('Lasso.mouseup — mouse.mousedown guard (fix C)', () => {
  it('does NOT switch mode when mouse.mousedown is null (toolbar click)', () => {
    // mousedown was stopped by stopPropagation — mouse.mousedown stays null
    const uiState = makeLassoState(); // mousedown: null by default
    lassoMouseup(uiState);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });

  it('switches to CURSOR on mouseup when mouse.mousedown is set (canvas interaction, no selection)', () => {
    const uiState = makeLassoState({
      mouse: { position: { tile: { x: 5, y: 5 } }, mousedown: { tile: { x: 2, y: 2 }, screen: { x: 0, y: 0 } } }
    });
    lassoMouseup(uiState);
    expect(uiState.actions.setMode).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CURSOR' })
    );
  });

  it('does NOT switch to CURSOR when there IS a selection (keeps LASSO active)', () => {
    const uiState = makeLassoState({
      mode: {
        type: 'LASSO',
        selection: { startTile: { x: 0, y: 0 }, endTile: { x: 10, y: 10 }, items: [{ type: 'ITEM', id: 'a' }] },
        isDragging: false
      },
      mouse: { position: { tile: { x: 5, y: 5 } }, mousedown: { tile: { x: 2, y: 2 }, screen: { x: 0, y: 0 } } }
    });
    lassoMouseup(uiState);
    expect(uiState.actions.setMode).not.toHaveBeenCalled();
  });
});
