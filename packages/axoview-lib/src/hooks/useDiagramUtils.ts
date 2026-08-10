import { useCallback } from 'react';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { Size, Coords } from 'src/types';
import {
  getUnprojectedBounds as getUnprojectedBoundsUtil,
  getVisualBounds as getVisualBoundsUtil,
  getFitToViewParams as getFitToViewParamsUtil,
  CoordsUtils
} from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';

// R4/RND-06 — the opaque chrome fit-to-view must not frame the diagram behind.
// Mirrors the widths the docks lay themselves out with (LeftDock's STRIP_WIDTH /
// PANEL_WIDTH, RightSidebar's 300). Duplicated rather than imported because
// those live in component modules and importing a component into a hook to read
// a number is the worse coupling; if a dock is ever resizable this becomes a
// measurement instead.
//
// The file-explorer column is NOT subtracted: its open state is a PROP the app
// passes to LeftDock, not uiState, so this hook cannot see it. A fit taken with
// the explorer open is therefore still ~280px too wide — narrower than the bug
// this fixes, and recorded in the entry rather than papered over.
const LEFT_STRIP_PX = 40;
const LEFT_PANEL_PX = 240;
const RIGHT_SIDEBAR_PX = 300;
/** Never inset below this — a narrow window must still produce a usable fit. */
const MIN_FIT_VIEWPORT_PX = 200;

export const useDiagramUtils = () => {
  const scene = useScene();
  // rendererSize is kept in sync with the single ResizeObserver in useInteractionManager
  const rendererSize = useUiStateStore((state) => state.rendererSize);
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const { getTilePosition } = useCanvasMode();

  // Width the opaque docks currently take out of the canvas.
  const dockInsetPx = useUiStateStore((state) => {
    let inset = LEFT_STRIP_PX;
    if (state.activeLeftTab !== null) inset += LEFT_PANEL_PX;
    if (state.rightSidebarOpen) inset += RIGHT_SIDEBAR_PX;
    return inset;
  });

  const getUnprojectedBounds = useCallback((): Size & Coords => {
    return getUnprojectedBoundsUtil(scene.currentView, getTilePosition);
  }, [scene.currentView, getTilePosition]);

  const getVisualBounds = useCallback((): Size & Coords => {
    return getVisualBoundsUtil(scene.currentView, getTilePosition);
  }, [scene.currentView, getTilePosition]);

  const getFitToViewParams = useCallback(
    (viewportSize: Size) => {
      return getFitToViewParamsUtil(scene.currentView, viewportSize, getTilePosition);
    },
    [scene.currentView, getTilePosition]
  );

  const fitToView = useCallback(async () => {
    // R4/RND-06: fit used to be given the whole container rect, docks included,
    // so a "fitted" diagram was partly behind the open Elements/Layers panel and
    // the properties deck — the user asked to see everything and could not.
    //
    // Decided here rather than left implicit (the campaign flagged it as a
    // product call): fit targets the VISIBLE canvas. Some tools fit to the full
    // surface and let panels overlap, which is defensible when panels are
    // translucent or transient; ours are opaque and persistent, so anything
    // behind them is simply not shown.
    //
    // Only the WIDTH is inset. The docks are full-height columns on the left and
    // right; nothing opaque is stacked above or below the canvas, so subtracting
    // height would shrink the fit for no reason.
    const { zoom, scroll } = getFitToViewParams({
      width: Math.max(MIN_FIT_VIEWPORT_PX, rendererSize.width - dockInsetPx),
      height: rendererSize.height
    });

    uiStateActions.setScroll({
      position: scroll,
      offset: CoordsUtils.zero()
    });
    uiStateActions.setZoom(zoom);
  }, [uiStateActions, getFitToViewParams, rendererSize, dockInsetPx]);

  return {
    getUnprojectedBounds,
    getVisualBounds,
    fitToView,
    getFitToViewParams
  };
};
