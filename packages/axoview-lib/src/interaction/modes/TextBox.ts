import { setWindowCursor, generateId } from 'src/utils';
import {
  resolvePlacement,
  cursorTileResidual,
  activeLayerPatch
} from 'src/utils/resolvePlacement';
import { isCanvasDrop } from 'src/utils/canvasDropTarget';
import { TEXTBOX_DEFAULTS } from 'src/config';
import { exceedsTapSlop } from 'src/config/tapGesture';
import { ModeActions } from 'src/types';

// Point-and-click placement (mirrors PlaceIcon): the Elements deck ARMS this
// mode with no element created; the next canvas click drops a text box at the
// cursor and returns to CURSOR. A right-click cancels (handled in usePanHandlers
// — the armed tool aborts to CURSOR without placing). The floating Label has its
// own mode (modes/Label.ts) — this mode is text-only (ADR 0031).
export const TextBox: ModeActions = {
  entry: () => {
    setWindowCursor('crosshair');
  },
  exit: () => {
    setWindowCursor('default');
  },
  mousemove: () => {},
  mouseup: ({ uiState, scene, isRendererInteraction, rendererRef }) => {
    if (uiState.mode.type !== 'TEXTBOX') return;

    // Distinguish the arming tap on the deck card (no renderer release, no move →
    // just arm) from a real placement: a canvas tap (renderer release) or a
    // drag from the panel that ENDS OVER the canvas. Same gating PlaceIcon uses
    // so the panel click only arms. (I5/CTX-01: "did the pointer travel?" alone
    // dropped elements behind the panel the drag was released over.)
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
    // TXT-04 — open the session's history bracket BEFORE the create, so
    // placement and the empty-box discard are one logical action rather than
    // two. With two entries, a single Ctrl+Z after abandoning a fresh box
    // landed between them and resurrected an invisible 1×1 ghost that every
    // save, export, lasso and Ctrl+A then carried. `TextBox.tsx` closes the
    // bracket on commit / cancel / discard (and on unmount, so a page switch
    // mid-session cannot leave it open); `beginDragTransaction` is idempotent,
    // so the component re-opening it for its own session is harmless.
    scene.beginDragTransaction();
    scene.createTextBox({
      ...TEXTBOX_DEFAULTS,
      id,
      tile: placement.tile,
      offset: placement.offset,
      // F4/LAY-03: join the layer the panel has selected, if any.
      ...activeLayerPatch(uiState.activeLayerId, scene.currentView?.layers)
    });

    // Place-and-type (owner 2026-07-02): select the box so the top strip targets
    // it, but DON'T open the Details deck; drop straight into inline edit on the
    // canvas next frame (once the box has mounted + attached its inline-edit
    // listener). Text is edited on-canvas and formatted from the strip — the deck
    // no longer carries a text editor. Matches Figma / draw.io.
    uiState.actions.setItemControls({ type: 'TEXTBOX', id }, { openPanel: false });
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
    // Open the on-canvas edit session for the just-placed box (store-based, so
    // it can't race the box's mount the way a one-shot event would). The box
    // renders its inline editor while editingTextBoxId points at it (ADR 0034).
    uiState.actions.setEditingTextBoxId?.(id);
  }
};
