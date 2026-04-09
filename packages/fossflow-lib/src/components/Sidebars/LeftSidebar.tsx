import React from 'react';
import { Box } from '@mui/material';
import { LayersPanel } from 'src/components/LayersPanel/LayersPanel';

interface Props {
  open: boolean;
}

export const LeftSidebar = ({ open }: Props) => {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: 240,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.2s ease',
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
        boxShadow: open ? 3 : 0
      }}
    >
      <LayersPanel />
    </Box>
  );
};
