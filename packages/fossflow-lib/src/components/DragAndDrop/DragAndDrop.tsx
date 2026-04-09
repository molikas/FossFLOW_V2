import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { Coords } from 'src/types';
import { getTilePosition } from 'src/utils';
import { PROJECTED_TILE_SIZE } from 'src/config';
import { useIcon } from 'src/hooks/useIcon';

interface Props {
  iconId: string;
  tile: Coords;
}

// Isometric icons have no built-in centering offset — shift by half their visual size.
// Non-isometric icons already have left:-halfW, top:-halfH inside NonIsometricIcon,
// so placing the container at tile CENTER is sufficient.
const HALF_ISO = PROJECTED_TILE_SIZE.width * 0.4;

export const DragAndDrop = ({ iconId, tile }: Props) => {
  const { icon, iconComponent } = useIcon(iconId);

  const tilePosition = useMemo(() => {
    return getTilePosition({ tile, origin: 'CENTER' });
  }, [tile]);

  const isIsometric = icon.isIsometric !== false;
  const offsetX = isIsometric ? -HALF_ISO : 0;
  const offsetY = isIsometric ? -HALF_ISO : 0;

  return (
    <Box
      sx={{ position: 'absolute' }}
      style={{
        left: tilePosition.x + offsetX,
        top: tilePosition.y + offsetY
      }}
    >
      {iconComponent}
    </Box>
  );
};
