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
        width: open ? 240 : 0,
        flexShrink: 0,
        overflow: 'hidden',
        transition: 'width 0.2s ease',
        borderRight: open ? '1px solid' : 'none',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}
    >
      {open && <LayersPanel />}
    </Box>
  );
};
