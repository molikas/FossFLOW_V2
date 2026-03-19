import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { Size } from 'src/types';
import gridTileSvg from 'src/assets/grid-tile-bg.svg';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { PROJECTED_TILE_SIZE } from 'src/config';
import { SizeUtils } from 'src/utils/SizeUtils';
import { useResizeObserver } from 'src/hooks/useResizeObserver';

export const Grid = () => {
  const elementRef = useRef<HTMLDivElement>(null);
  const { size } = useResizeObserver(elementRef.current);
  const scroll = useUiStateStore((state) => {
    return state.scroll;
  });
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });

  useEffect(() => {
    if (!elementRef.current) return;

    const el = elementRef.current;
    const tileSize = SizeUtils.multiply(PROJECTED_TILE_SIZE, zoom);
    const elSize = el.getBoundingClientRect();
    const backgroundPosition: Size = {
      width: elSize.width / 2 + scroll.position.x + tileSize.width / 2,
      height: elSize.height / 2 + scroll.position.y
    };

    el.style.backgroundSize = `${tileSize.width}px ${tileSize.height * 2}px`;
    el.style.backgroundPosition = `${backgroundPosition.width}px ${backgroundPosition.height}px`;
  }, [scroll, zoom, size]);

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
