import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useInteractionManager } from 'src/interaction/useInteractionManager';
import { Grid } from 'src/components/Grid/Grid';
import { Cursor } from 'src/components/Cursor/Cursor';
import { Nodes } from 'src/components/SceneLayers/Nodes/Nodes';
import { Rectangles } from 'src/components/SceneLayers/Rectangles/Rectangles';
import { Connectors } from 'src/components/SceneLayers/Connectors/Connectors';
import { ConnectorLabels } from 'src/components/SceneLayers/ConnectorLabels/ConnectorLabels';
import { TextBoxes } from 'src/components/SceneLayers/TextBoxes/TextBoxes';
import { SizeIndicator } from 'src/components/DebugUtils/SizeIndicator';
import { SceneLayer } from 'src/components/SceneLayer/SceneLayer';
import { TransformControlsManager } from 'src/components/TransformControlsManager/TransformControlsManager';
import { Lasso } from 'src/components/Lasso/Lasso';
import { FreehandLasso } from 'src/components/FreehandLasso/FreehandLasso';
import { useScene } from 'src/hooks/useScene';
import { RendererProps } from 'src/types/rendererProps';
import { Scroll, Size } from 'src/types';
import { screenToIso } from 'src/utils';

// Extra tiles of padding around the screen edges to avoid visible pop-in.
const VIEWPORT_TILE_PADDING = 4;

interface TileBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const computeTileBounds = (
  scroll: Scroll,
  zoom: number,
  rendererSize: Size
): TileBounds => {
  if (rendererSize.width === 0 || rendererSize.height === 0) {
    return { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity };
  }

  const corners = [
    { x: 0, y: 0 },
    { x: rendererSize.width, y: 0 },
    { x: 0, y: rendererSize.height },
    { x: rendererSize.width, y: rendererSize.height }
  ].map((mouse) => screenToIso({ mouse, zoom, scroll, rendererSize }));

  const xs = corners.map((t) => t.x);
  const ys = corners.map((t) => t.y);

  return {
    minX: Math.min(...xs) - VIEWPORT_TILE_PADDING,
    maxX: Math.max(...xs) + VIEWPORT_TILE_PADDING,
    minY: Math.min(...ys) - VIEWPORT_TILE_PADDING,
    maxY: Math.max(...ys) + VIEWPORT_TILE_PADDING
  };
};

const tileBoundsEqual = (a: TileBounds, b: TileBounds) =>
  a.minX === b.minX && a.maxX === b.maxX && a.minY === b.minY && a.maxY === b.maxY;

export const Renderer = ({ showGrid, backgroundColor }: RendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionsRef = useRef<HTMLDivElement>(null);
  const uiStateApi = useUiStateStoreApi();
  const enableDebugTools = useUiStateStore((state) => state.enableDebugTools);
  const showCursor = useUiStateStore((state) => state.mode.showCursor);
  const uiStateActions = useUiStateStore((state) => state.actions);
  const { setInteractionsElement } = useInteractionManager();
  const { items, rectangles, connectors, textBoxes, currentView } = useScene();

  // Tile-space visible bounds — updated by the store subscriber (no React renders on pan/zoom
  // unless the tile range actually changes). Coarse equality means re-renders only fire when
  // the user pans far enough to expose new tiles, not on every pixel.
  const [coarseBounds, setCoarseBounds] = useState<TileBounds>(() => {
    const s = uiStateApi.getState();
    return computeTileBounds(s.scroll, s.zoom, s.rendererSize);
  });

  useEffect(() => {
    const unsubscribe = uiStateApi.subscribe((state, prev) => {
      if (
        state.scroll === prev.scroll &&
        state.zoom === prev.zoom &&
        state.rendererSize === prev.rendererSize
      ) {
        return;
      }
      const newBounds = computeTileBounds(state.scroll, state.zoom, state.rendererSize);
      setCoarseBounds((cur) => (tileBoundsEqual(cur, newBounds) ? cur : newBounds));
    });
    return unsubscribe;
  }, [uiStateApi]);

  useEffect(() => {
    if (!containerRef.current || !interactionsRef.current) return;
    setInteractionsElement(interactionsRef.current);
    uiStateActions.setRendererEl(containerRef.current);
  }, [setInteractionsElement, uiStateActions]);

  const isShowGrid = useMemo(() => showGrid === undefined || showGrid, [showGrid]);

  const visibleItems = useMemo(() => {
    const { minX, maxX, minY, maxY } = coarseBounds;
    if (minX === -Infinity) return items; // bounds not yet computed
    return items.filter(
      (item) =>
        item.tile.x >= minX &&
        item.tile.x <= maxX &&
        item.tile.y >= minY &&
        item.tile.y <= maxY
    );
  }, [items, coarseBounds]);

  const visibleConnectors = useMemo(() => {
    const { minX, maxX, minY, maxY } = coarseBounds;
    if (minX === -Infinity) return connectors;
    return connectors.filter((connector) => {
      // connector.path may be undefined on the first render pass before pathfinding runs
      if (!connector.path?.rectangle) return true;
      const { from, to } = connector.path.rectangle;
      // Connector bounding box (from/to may be swapped — take the union)
      const cMinX = Math.min(from.x, to.x);
      const cMaxX = Math.max(from.x, to.x);
      const cMinY = Math.min(from.y, to.y);
      const cMaxY = Math.max(from.y, to.y);
      return cMaxX >= minX && cMinX <= maxX && cMaxY >= minY && cMinY <= maxY;
    });
  }, [connectors, coarseBounds]);

  return (
    <Box
      ref={containerRef}
      data-testid="fossflow-canvas"
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        bgcolor: (theme) =>
          backgroundColor === 'transparent'
            ? 'transparent'
            : backgroundColor ?? theme.customVars.customPalette.diagramBg
      }}
    >
      <SceneLayer>
        <Rectangles rectangles={rectangles} />
      </SceneLayer>
      <SceneLayer>
        <Lasso />
      </SceneLayer>
      <FreehandLasso />
      <Box
        sx={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          top: 0,
          left: 0
        }}
      >
        {isShowGrid && <Grid />}
      </Box>
      {showCursor && (
        <SceneLayer>
          <Cursor />
        </SceneLayer>
      )}
      <SceneLayer>
        <Connectors connectors={visibleConnectors} currentView={currentView} />
      </SceneLayer>
      <SceneLayer>
        <TextBoxes textBoxes={textBoxes} />
      </SceneLayer>
      <SceneLayer>
        <ConnectorLabels connectors={visibleConnectors} />
      </SceneLayer>
      {enableDebugTools && (
        <SceneLayer>
          <SizeIndicator />
        </SceneLayer>
      )}
      {/* Interaction layer: this is where events are detected */}
      <Box
        ref={interactionsRef}
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%'
        }}
      />
      <SceneLayer>
        <Nodes nodes={visibleItems} />
      </SceneLayer>
      <SceneLayer>
        <TransformControlsManager />
      </SceneLayer>
    </Box>
  );
};
