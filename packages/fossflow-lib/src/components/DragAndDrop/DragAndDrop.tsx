import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { Coords } from 'src/types';
import { PROJECTED_TILE_SIZE } from 'src/config';
import { useIcon } from 'src/hooks/useIcon';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';

interface Props {
  iconId: string;
  tile: Coords;
}

const HALF_H = PROJECTED_TILE_SIZE.height / 2;

export const DragAndDrop = ({ iconId, tile }: Props) => {
  const { iconComponent } = useIcon(iconId);
  const { getTilePosition } = useCanvasMode();

  // Mirror Node.tsx exactly: getTilePosition(BOTTOM) then subtract halfH = tile CENTER.
  const tilePosition = useMemo(() => {
    const pos = getTilePosition({ tile, origin: 'BOTTOM' });
    return { x: pos.x, y: pos.y - HALF_H };
  }, [getTilePosition, tile]);

  return (
    <Box
      sx={{
        position: 'absolute',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        left: tilePosition.x,
        top: tilePosition.y
      }}
    >
      {iconComponent}
    </Box>
  );
};
