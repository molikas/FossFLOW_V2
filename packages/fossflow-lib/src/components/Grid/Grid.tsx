import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import gridTileSvg from 'src/assets/grid-tile-bg.svg';
import { useUiStateStoreApi } from 'src/stores/uiStateStore';
import { PROJECTED_TILE_SIZE } from 'src/config';
import { SizeUtils } from 'src/utils/SizeUtils';
import { useResizeObserver } from 'src/hooks/useResizeObserver';

export const Grid = () => {
  const elementRef = useRef<HTMLDivElement>(null);
  const { size } = useResizeObserver(elementRef.current);
  const storeApi = useUiStateStoreApi();

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    const applyBackground = (
      scrollX: number,
      scrollY: number,
      zoom: number
    ) => {
      const tileSize = SizeUtils.multiply(PROJECTED_TILE_SIZE, zoom);
      const elSize = el.getBoundingClientRect();
      el.style.backgroundSize = `${tileSize.width}px ${tileSize.height * 2}px`;
      el.style.backgroundPosition = `${elSize.width / 2 + scrollX + tileSize.width / 2}px ${elSize.height / 2 + scrollY}px`;
    };

    // Apply immediately on mount / resize
    const { scroll, zoom } = storeApi.getState();
    applyBackground(scroll.position.x, scroll.position.y, zoom);

    // Subscribe to scroll/zoom changes — bypasses React render cycle entirely
    const unsubscribe = storeApi.subscribe((state, prev) => {
      if (state.scroll === prev.scroll && state.zoom === prev.zoom) return;
      applyBackground(
        state.scroll.position.x,
        state.scroll.position.y,
        state.zoom
      );
    });

    return unsubscribe;
  }, [storeApi, size]); // size triggers recalculation on window resize

  return (
    <Box
      sx={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'none'
      }}
    >
      <Box
        ref={elementRef}
        sx={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          background: `repeat url("${gridTileSvg}")`
        }}
      />
    </Box>
  );
};
