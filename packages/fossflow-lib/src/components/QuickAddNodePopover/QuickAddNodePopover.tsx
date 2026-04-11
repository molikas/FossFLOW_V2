import React, { useState, useEffect, useCallback } from 'react';
import { Popover, Box, Typography, Button, Divider } from '@mui/material';
import { CropLandscapeOutlined as RectangleIcon } from '@mui/icons-material';
import { Coords } from 'src/types';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { generateId } from 'src/utils';
import { VIEW_ITEM_DEFAULTS } from 'src/config';
import { QuickIconSelector } from 'src/components/ItemControls/NodeControls/QuickIconSelector';
import { useTranslation } from 'src/stores/localeStore';

interface DblClickDetail {
  tile: Coords;
  screenX: number;
  screenY: number;
}

export const QuickAddNodePopover = () => {
  const { t } = useTranslation('quickAddNodePopover');
  const [anchorPosition, setAnchorPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [targetTile, setTargetTile] = useState<Coords | null>(null);
  const scene = useScene();
  const icons = useModelStore((state) => state.icons);
  const colors = useModelStore((state) => state.colors);
  const uiStateActions = useUiStateStore((state) => state.actions);

  useEffect(() => {
    const handler = (e: Event) => {
      const { tile, screenX, screenY } = (e as CustomEvent<DblClickDetail>)
        .detail;
      setTargetTile(tile);
      setAnchorPosition({ top: screenY, left: screenX });
    };

    window.addEventListener('canvasEmptyDblClick', handler);
    return () => window.removeEventListener('canvasEmptyDblClick', handler);
  }, []);

  const handleClose = useCallback(() => {
    // Move focus out before the Popover applies aria-hidden on the modal root.
    (document.activeElement as HTMLElement | null)?.blur();
    setAnchorPosition(null);
    setTargetTile(null);
  }, []);

  const handleIconSelected = useCallback(
    (icon: { id: string }) => {
      if (!targetTile) return;

      const modelItemId = generateId();
      scene.placeIcon({
        modelItem: {
          id: modelItemId,
          name: '',
          icon: icon.id
        },
        viewItem: {
          ...VIEW_ITEM_DEFAULTS,
          id: modelItemId,
          tile: targetTile
        }
      });

      // Open controls panel for the new node so user can name it immediately
      uiStateActions.setItemControls({ type: 'ITEM', id: modelItemId });
      handleClose();
    },
    [targetTile, scene, uiStateActions, handleClose]
  );

  const handleAddRectangle = useCallback(() => {
    if (!targetTile || colors.length === 0) return;
    scene.createRectangle({
      id: generateId(),
      color: colors[0].id,
      from: targetTile,
      to: targetTile
    });
    handleClose();
  }, [targetTile, colors, scene, handleClose]);

  if (!anchorPosition || icons.length === 0) return null;

  return (
    <Popover
      open
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition}
      onClose={handleClose}
      PaperProps={{
        sx: {
          width: 300,
          maxHeight: 480,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }
      }}
    >
      <Box
        sx={{
          px: 2,
          pt: 1.5,
          pb: 0.5,
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={600}
          sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          {t('add')}
        </Typography>
      </Box>
      <Box sx={{ px: 1.5, pt: 1, pb: 0.5 }}>
        <Button
          fullWidth
          size="small"
          variant="outlined"
          startIcon={<RectangleIcon />}
          onClick={handleAddRectangle}
          sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
        >
          {t('rectangle')}
        </Button>
      </Box>
      <Divider sx={{ mx: 1.5, mt: 0.5 }} />
      <Box sx={{ overflowY: 'auto', flex: 1 }}>
        <QuickIconSelector
          onIconSelected={handleIconSelected}
          onClose={handleClose}
        />
      </Box>
    </Popover>
  );
};
