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

export const useDiagramUtils = () => {
  const scene = useScene();
  // rendererSize is kept in sync with the single ResizeObserver in useInteractionManager
  const rendererSize = useUiStateStore((state) => state.rendererSize);
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const { getTilePosition } = useCanvasMode();

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
    const { zoom, scroll } = getFitToViewParams(rendererSize);

    uiStateActions.setScroll({
      position: scroll,
      offset: CoordsUtils.zero()
    });
    uiStateActions.setZoom(zoom);
  }, [uiStateActions, getFitToViewParams, rendererSize]);

  return {
    getUnprojectedBounds,
    getVisualBounds,
    fitToView,
    getFitToViewParams
  };
};
