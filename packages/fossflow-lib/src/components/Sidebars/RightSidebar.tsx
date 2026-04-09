import React from 'react';
import { Box, Typography } from '@mui/material';
import { TuneOutlined } from '@mui/icons-material';
import { EditorModeEnum } from 'src/types';
import { ItemControlsManager } from 'src/components/ItemControls/ItemControlsManager';
import { useUiStateStore } from 'src/stores/uiStateStore';

interface Props {
  open: boolean;
  editorMode: string;
}

export const RightSidebar = ({ open, editorMode }: Props) => {
  const itemControls = useUiStateStore((s) => s.itemControls);

  const readOnly = editorMode === EditorModeEnum.EXPLORABLE_READONLY;
  const hasSelection = itemControls !== null;

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 300,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.2s ease',
        borderLeft: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
        boxShadow: open ? 3 : 0
      }}
    >
      {hasSelection ? (
        <Box sx={{ height: '100%', overflowY: 'auto' }}>
          <ItemControlsManager readOnly={readOnly} />
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            px: 3,
            color: 'text.disabled'
          }}
        >
          <TuneOutlined sx={{ fontSize: 32, opacity: 0.4 }} />
          <Typography
            variant="body2"
            color="text.disabled"
            textAlign="center"
            sx={{ lineHeight: 1.5 }}
          >
            Select a node, connector or shape to view its properties
          </Typography>
        </Box>
      )}
    </Box>
  );
};
