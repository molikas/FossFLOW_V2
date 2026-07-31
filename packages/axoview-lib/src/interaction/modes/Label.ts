import { setWindowCursor, generateId } from 'src/utils';
import { resolvePlacement, cursorTileResidual } from 'src/utils/resolvePlacement';
import { isCanvasDrop } from 'src/utils/canvasDropTarget';
import { LABEL_DEFAULTS } from 'src/config';
import { exceedsTapSlop } from 'src/config/tapGesture';
import { ModeActions } from 'src/types';

// Point-and-click placement for the floating Label (ADR 0031), mirroring the
// TextBox / PlaceIcon arm-then-drop flow: the Common deck ARMS this mode with no
// element created; the next canvas click drops a Label at the cursor and returns
// to CURSOR. A right-click cancels (usePanHandlers aborts the armed tool to
// CURSOR without placing). Its own mode — not a TextBox variant.
export const Label: ModeActions = {
  entry: () => {
    setWindowCursor('crosshair');
  },
  exit: () => {
    setWindowCursor('default');
  },
  mousemove: () => {},
  mouseup: ({ uiState, scene, isRendererInteraction, rendererRef }) => {
    if (uiState.mode.type !== 'LABEL') return;

    // Distinguish the arming tap on the deck card (no renderer release, no move)
    // from a real placement: a canvas tap (renderer release) or a drag from the
    // panel that ENDS OVER the canvas. Same gating as TextBox / PlaceIcon
    // (I5/CTX-01 — travelling is not the same question as landing on canvas).
    const moved =
      !!uiState.mouse.mousedown &&
      exceedsTapSlop(
        uiState.mouse.mousedown.screen,
        uiState.mouse.position.screen
      );
    if (
      !isCanvasDrop(
        rendererRef,
        isRendererInteraction,
        uiState.mouse.position.screen,
        moved
      )
    ) {
      return;
    }

    const globalSnap = uiState.snapToGrid ?? true;
    const tile = uiState.mouse.position.tile;
    const residual = globalSnap
      ? undefined
      : cursorTileResidual(
          uiState.canvasMode,
          uiState.mouse.position.screen,
          tile,
          uiState.zoom,
          uiState.scroll,
          uiState.rendererSize
        );
    const placement = resolvePlacement(tile, residual, undefined, globalSnap);

    const id = generateId();
    scene.createLabel({
      ...LABEL_DEFAULTS,
      id,
      tile: placement.tile,
      offset: placement.offset
    });

    // Place-and-type (owner 2026-07-02): select the label so the top strip targets
    // it, but DON'T open the Details deck; drop straight into inline edit on the
    // canvas next frame (once the chip has mounted). A Label is just on-canvas
    // text — edited inline + styled from the strip, never via a deck editor.
    uiState.actions.setItemControls({ type: 'LABEL', id }, { openPanel: false });
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
    requestAnimationFrame(() => {
      uiState.actions.setInlineEditLabelId?.(id);
    });
  }
};
