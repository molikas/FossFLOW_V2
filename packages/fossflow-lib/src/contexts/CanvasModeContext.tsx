// CanvasModeContext — provides the active coordinate transform strategy and
// pre-bound helper functions derived from the current canvasMode in uiStateStore.
//
// Mount <CanvasModeContext.Provider> once inside the UiStateProvider tree.
// Consumers call useCanvasMode() to get mode-aware tile/screen helpers.

import React, { createContext, useContext, useMemo } from 'react';
import { useUiStateStore } from 'src/stores/uiStateStore';
import {
  CoordinateTransformStrategy,
  isometricStrategy,
  cartesian2DStrategy,
  makeTilePositionFn,
  makeScreenToTileFn
} from 'src/utils/coordinateTransforms';
import type { Coords, Scroll, Size, TileOrigin } from 'src/types';

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

export interface CanvasModeContextValue {
  /** The raw strategy object — carry if you need gridTileUrl or projectionName */
  strategy: CoordinateTransformStrategy;

  /**
   * Mode-aware getTilePosition.
   * Drop-in replacement for isoMath.getTilePosition at component level.
   */
  getTilePosition: (args: { tile: Coords; origin?: TileOrigin }) => Coords;

  /**
   * Mode-aware screenToTile.
   * Drop-in replacement for isoMath.screenToIso at component level.
   */
  screenToTile: (args: {
    mouse: Coords;
    zoom: number;
    scroll: Scroll;
    rendererSize: Size;
  }) => Coords;

  /**
   * Returns the ISO projection CSS matrix string when in ISOMETRIC mode,
   * or an empty string in 2D mode (no projection transform needed).
   */
  getProjectionCss: (orientation?: 'X' | 'Y') => string;
}

// ---------------------------------------------------------------------------
// Context + Provider
// ---------------------------------------------------------------------------

const CanvasModeContext = createContext<CanvasModeContextValue | null>(null);

interface ProviderProps {
  children: React.ReactNode;
}

export const CanvasModeProvider = ({ children }: ProviderProps) => {
  const canvasMode = useUiStateStore((state) => state.canvasMode);

  const value = useMemo<CanvasModeContextValue>(() => {
    const strategy =
      canvasMode === '2D' ? cartesian2DStrategy : isometricStrategy;

    const getTilePosition = makeTilePositionFn(strategy);
    const screenToTile = makeScreenToTileFn(strategy);

    const getProjectionCss = (orientation?: 'X' | 'Y'): string => {
      if (strategy.projectionName === '2D') return '';
      // Isometric CSS matrix — mirrors getIsoProjectionCss from isoMath.ts
      const base = [0.707, -0.409, 0.707, 0.409, 0, -0.816];
      if (orientation === 'Y') {
        return `matrix(${[base[0], -base[1], -base[2], base[3], base[4], base[5]].join(', ')})`;
      }
      return `matrix(${base.join(', ')})`;
    };

    return { strategy, getTilePosition, screenToTile, getProjectionCss };
  }, [canvasMode]);

  return (
    <CanvasModeContext.Provider value={value}>
      {children}
    </CanvasModeContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export const useCanvasMode = (): CanvasModeContextValue => {
  const ctx = useContext(CanvasModeContext);
  if (ctx === null) {
    throw new Error('useCanvasMode must be used within a CanvasModeProvider');
  }
  return ctx;
};
