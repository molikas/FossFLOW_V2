// PreviewCanvasModeToggle — iso↔2D switch for view-only mode (owner
// 2026-07-28). Sits in the top-left present chrome next to PreviewLayerSwitcher
// and borrows its visual contract: recedes to 0.7 opacity at rest so it stays
// out of the way during a presentation, full opacity on hover.
//
// Viewer-local by construction: canvasMode is uiState + localStorage only
// (config/persistedSettings.ts), never document data — a viewer switching
// projection changes their own view and cannot dirty or save the diagram.
//
// Strings come from the toolMenu namespace deliberately — this is the same
// affordance as the editor's toggle, so it must read identically.

import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import {
  ViewInArOutlined as IsometricIcon,
  GridOnOutlined as CartesianIcon
} from '@mui/icons-material';
import { useCanvasModeToggle } from 'src/hooks/useCanvasModeToggle';
import { useTranslation } from 'src/stores/localeStore';

export const PreviewCanvasModeToggle = () => {
  const { t } = useTranslation('toolMenu');
  const { canvasMode, toggleCanvasMode } = useCanvasModeToggle();

  const label = canvasMode === 'ISOMETRIC' ? t('switchTo2D') : t('switchToIsometric');

  return (
    <Box
      data-axoview-id="preview-canvas-mode-toggle"
      // Without this the press falls through to the canvas and starts a pan.
      onMouseDown={(e) => e.stopPropagation()}
      sx={{
        borderRadius: 2,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'grey.400',
        boxShadow: 2,
        p: 0.5,
        opacity: 0.7,
        transition: 'opacity 120ms ease',
        '&:hover': { opacity: 1 }
      }}
    >
      <Tooltip title={label} placement="right">
        <IconButton size="small" onClick={toggleCanvasMode} aria-label={label}>
          {canvasMode === 'ISOMETRIC' ? (
            <CartesianIcon fontSize="small" />
          ) : (
            <IsometricIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
    </Box>
  );
};
