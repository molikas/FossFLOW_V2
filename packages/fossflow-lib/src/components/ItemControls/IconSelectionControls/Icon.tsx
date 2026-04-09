import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { Icon as IconI } from 'src/types';

const GRID_SIZE = 36;
const PREVIEW_SIZE = 56;

// Tooltip content: larger icon preview + full name
const IconTooltipContent = ({ icon }: { icon: IconI }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, p: 0.5 }}>
    <Box
      component="img"
      src={icon.url}
      alt={icon.name}
      sx={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, objectFit: 'contain' }}
    />
    <Typography variant="caption" sx={{ fontSize: 11, color: 'inherit', textAlign: 'center', maxWidth: 120 }}>
      {icon.name}
    </Typography>
  </Box>
);

interface Props {
  icon: IconI;
  onClick?: () => void;
  onMouseDown?: () => void;
  onDoubleClick?: () => void;
}

export const Icon = ({ icon, onClick, onMouseDown, onDoubleClick }: Props) => {
  return (
    <Tooltip
      title={<IconTooltipContent icon={icon} />}
      placement="right"
      arrow
      enterDelay={400}
      enterNextDelay={200}
    >
      <Box
        onClick={onClick}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        sx={{
          width: GRID_SIZE,
          height: GRID_SIZE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 1,
          cursor: 'pointer',
          userSelect: 'none',
          '&:hover': { bgcolor: 'action.hover' }
        }}
      >
        <Box
          component="img"
          draggable={false}
          src={icon.url}
          alt={icon.name}
          sx={{ width: 28, height: 28, objectFit: 'contain', pointerEvents: 'none' }}
        />
      </Box>
    </Tooltip>
  );
};
