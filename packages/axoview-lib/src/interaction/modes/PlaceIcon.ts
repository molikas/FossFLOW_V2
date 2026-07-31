import { produce } from 'immer';
import { ModeActions } from 'src/types';
import {
  generateId,
  getItemAtTile,
  findNearestUnoccupiedTile
} from 'src/utils';
import {
  resolvePlacement,
  cursorTileResidual,
  activeLayerPatch
} from 'src/utils/resolvePlacement';
import { isCanvasDrop } from 'src/utils/canvasDropTarget';
import { VIEW_ITEM_DEFAULTS } from 'src/config';
import { exceedsTapSlop } from 'src/config/tapGesture';

export const PlaceIcon: ModeActions = {
  mousemove: () => {},
  mousedown: ({ uiState, scene, isRendererInteraction }) => {
    if (uiState.mode.type !== 'PLACE_ICON' || !isRendererInteraction) return;

    if (!uiState.mode.id) {
      const itemAtTile = getItemAtTile({
        tile: uiState.mouse.position.tile,
        scene
      });

      uiState.actions.setMode({
        type: 'CURSOR',
        mousedownItem: itemAtTile,
        showCursor: true
      });

      uiState.actions.setItemControls(null);
    }
  },
  mouseup: ({ uiState, scene, isRendererInteraction, rendererRef }) => {
    if (uiState.mode.type !== 'PLACE_ICON') return;

    // B1 / Decision #2: a plain TAP on an Elements-panel icon must only ARM
    // placement — it must NOT place a node (the old ungated mouseup placed one
    // at the panel-projected tile, then nulled mode.id, so the real canvas click
    // did nothing). Two gestures legitimately place; two must not:
    //   • canvas tap (after arming): its mousedown is on the canvas → captured →
    //     the release reports isRendererInteraction → place.
    //   • drag-from-panel released OVER the canvas: the release targets the panel
    //     icon (so isRendererInteraction can't see it), so the drop point is
    //     hit-tested instead → place.
    //   • arming tap on the icon: neither a renderer release nor a move → arm only.
    //   • drag-from-panel released back OVER THE PANEL → nothing (I5/CTX-01).
    //
    // That last case is the fix. This used to commit on `moved` alone, on the
    // reasoning — recorded here and wrong — that "a hit-test can't help: capture
    // makes both e.target AND elementFromPoint resolve to the icon mid-drag."
    // Capture retargets EVENTS, not `document.elementFromPoint`, which stays a
    // true stacking-aware hit-test; and when the release really is over the
    // panel, resolving to the icon is the correct answer, not a false one.
    // `isCanvasDrop` is now shared with TextBox / Label, which had the same gate.
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

    if (uiState.mode.id !== null) {
      const globalSnap = uiState.snapToGrid ?? true;
      const cursorTile = uiState.mouse.position.tile;
      // Snapped placement avoids occupied tiles (today's behaviour). Off-grid
      // placement (global snap off, ADR 0023 #12) lands exactly under the cursor
      // with a px residual — no collision search; route both through the one
      // resolvePlacement chokepoint.
      const targetTile = globalSnap
        ? findNearestUnoccupiedTile(cursorTile, scene)
        : cursorTile;

      if (targetTile) {
        const residual = globalSnap
          ? undefined
          : cursorTileResidual(
              uiState.canvasMode,
              uiState.mouse.position.screen,
              targetTile,
              uiState.zoom,
              uiState.scroll,
              uiState.rendererSize
            );
        const placement = resolvePlacement(
          targetTile,
          residual,
          undefined,
          globalSnap
        );
        const modelItemId = generateId();

        scene.placeIcon({
          modelItem: {
            id: modelItemId,
            name: 'Untitled',
            icon: uiState.mode.id
          },
          viewItem: {
            ...VIEW_ITEM_DEFAULTS,
            id: modelItemId,
            tile: placement.tile,
            offset: placement.offset,
            // F4/LAY-03: join the layer the panel has selected, if any.
            ...activeLayerPatch(
              uiState.activeLayerId,
              scene.currentView?.layers
            )
          }
        });
      }

      // After a placement attempt, return to Select mode instead of lingering in
      // PLACE_ICON. The leftover placement cursor (a node-like diamond tracking
      // the pointer) read as "clicking keeps adding"; re-arm by clicking another
      // icon. The next canvas click is then a normal select/clear. (User feedback.)
      uiState.actions.setMode({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      });
      return;
    }

    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        draft.id = null;
      })
    );
  }
};
