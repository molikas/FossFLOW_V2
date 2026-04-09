import React from 'react';
import { Icon as IconI } from 'src/types';
import { Box } from '@mui/material';
import { Icon } from './Icon';

interface Props {
  icons: IconI[];
  onMouseDown?: (icon: IconI) => void;
  onClick?: (icon: IconI) => void;
  onDoubleClick?: (icon: IconI) => void;
  hoveredIndex?: number;
  onHover?: (index: number) => void;
}

export const IconGrid = ({ icons, onMouseDown, onClick, onDoubleClick }: Props) => {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 0.25
      }}
    >
      {icons.map((icon) => (
        <Icon
          key={icon.id}
          icon={icon}
          onClick={() => onClick?.(icon)}
          onMouseDown={() => onMouseDown?.(icon)}
          onDoubleClick={() => onDoubleClick?.(icon)}
        />
      ))}
    </Box>
  );
};
