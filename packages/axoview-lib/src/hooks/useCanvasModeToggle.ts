// useCanvasModeToggle — the iso↔2D switch, shared by the editor ToolMenu and
// the view-only present chrome (owner 2026-07-28: viewers need to switch
// projection too). `canvasMode` is a uiState/localStorage concern only — it is
// never written to the document — so a viewer toggling it changes their OWN
// view and nothing else.
//
// The viewport-preservation effect lives here rather than at a call site so
// both surfaces get it: previously it sat inside ToolMenu, which view-only mode
// never mounts, so surfacing the button alone would have made a viewer's zoom
// pop on every switch.
//
// The effect assumes ONE live consumer at a time — two mounted simultaneously
// would each apply the scroll correction. That holds today: EDITOR_MODE_MAPPING
// (UiOverlay) grants TOOL_MENU to EDITABLE only, and the present chrome renders
// only in EXPLORABLE_READONLY.

import { useCallback, useEffect, useRef } from 'react';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import {
  isometricStrategy,
  cartesian2DStrategy,
  getCanvasModeSwitchScroll
} from 'src/utils/coordinateTransforms';
import { CoordsUtils } from 'src/utils';
import type { CanvasMode } from 'src/types/ui';

export const useCanvasModeToggle = (): {
  canvasMode: CanvasMode;
  toggleCanvasMode: () => void;
} => {
  const canvasMode = useUiStateStore((state) => state.canvasMode);
  const uiStateStoreActions = useUiStateStore((state) => state.actions);
  const uiStateApi = useUiStateStoreApi();

  // Iso↔2D switch preserves the user's zoom and viewport center (ADR locked
  // decision #6): re-project the tile under the viewport center and recompute
  // scroll so it stays centered. (The old `fitToView()` force-fit here is what
  // made zoom "pop" — 65%→80%→97% — and recentred the whole diagram.)
  const prevCanvasModeRef = useRef(canvasMode);
  useEffect(() => {
    const prevCanvasMode = prevCanvasModeRef.current;
    if (prevCanvasMode === canvasMode) return;
    prevCanvasModeRef.current = canvasMode;

    const { zoom, scroll, actions } = uiStateApi.getState();
    const fromStrategy =
      prevCanvasMode === '2D' ? cartesian2DStrategy : isometricStrategy;
    const toStrategy =
      canvasMode === '2D' ? cartesian2DStrategy : isometricStrategy;

    actions.setScroll({
      position: getCanvasModeSwitchScroll(fromStrategy, toStrategy, zoom, scroll),
      offset: CoordsUtils.zero()
    });
  }, [canvasMode, uiStateApi]);

  const toggleCanvasMode = useCallback(() => {
    uiStateStoreActions.setCanvasMode(
      canvasMode === 'ISOMETRIC' ? '2D' : 'ISOMETRIC'
    );
  }, [canvasMode, uiStateStoreActions]);

  return { canvasMode, toggleCanvasMode };
};
