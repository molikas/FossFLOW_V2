import React, { useCallback, useState } from 'react';
import { Box, Paper, Typography, Button, Menu, MenuItem, Divider } from '@mui/material';
import { LayersOutlined } from '@mui/icons-material';
import { getTilePosition } from 'src/utils';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { useLayerActions } from 'src/hooks/useLayerActions';
import { ItemReference } from 'src/types';

/** Derive an approximate "top-center" tile of the current lasso selection */
const useSelectionInfo = (): { items: ItemReference[]; centerTile: { x: number; y: number } } | null => {
  const mode = useUiStateStore((s) => s.mode);

  if (mode.type === 'LASSO' && mode.selection) {
    const { startTile, endTile, items } = mode.selection;
    if (!items.length) return null;
    const centerX = Math.round((startTile.x + endTile.x) / 2);
    const minY = Math.min(startTile.y, endTile.y);
    return { items, centerTile: { x: centerX, y: minY } };
  }

  if (mode.type === 'FREEHAND_LASSO' && mode.selection) {
    const { pathTiles, items } = mode.selection;
    if (!items.length || !pathTiles.length) return null;
    const minY = Math.min(...pathTiles.map((p) => p.y));
    const sumX = pathTiles.reduce((acc, p) => acc + p.x, 0);
    const centerX = Math.round(sumX / pathTiles.length);
    return { items, centerTile: { x: centerX, y: minY } };
  }

  return null;
};

export const LassoLayerBar = () => {
  const selectionInfo = useSelectionInfo();
  const { layers } = useLayerContext();
  const { assignLayerToItems } = useLayerActions();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const handleAssign = useCallback(
    (layerId: string | undefined) => {
      if (!selectionInfo) return;
      assignLayerToItems(layerId, selectionInfo.items);
      setMenuAnchor(null);
    },
    [assignLayerToItems, selectionInfo]
  );

  if (!selectionInfo) return null;

  const pos = getTilePosition({ tile: selectionInfo.centerTile, origin: 'TOP' });
  const count = selectionInfo.items.length;

  return (
    <Box
      sx={{
        position: 'absolute',
        left: pos.x,
        top: pos.y - 44,
        transform: 'translateX(-50%)',
        pointerEvents: 'auto',
        zIndex: 10
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Paper
        elevation={4}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: '20px',
          px: 1.25,
          py: 0.5,
          gap: 1,
          bgcolor: 'background.paper'
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {count} {count === 1 ? 'item' : 'items'}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<LayersOutlined sx={{ fontSize: 14 }} />}
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={{ fontSize: 11, py: 0.25, px: 1, borderRadius: '12px', textTransform: 'none', minWidth: 0 }}
        >
          Assign layer
        </Button>
      </Paper>

      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {layers.length === 0 ? (
          <MenuItem disabled sx={{ fontSize: 13 }}>
            No layers — open the Layers panel to add one
          </MenuItem>
        ) : (
          [
            <MenuItem key="remove" onClick={() => handleAssign(undefined)} sx={{ fontSize: 13 }}>
              Remove from layer
            </MenuItem>,
            <Divider key="divider" />,
            ...[...layers]
              .sort((a, b) => b.order - a.order)
              .map((layer) => (
                <MenuItem key={layer.id} onClick={() => handleAssign(layer.id)} sx={{ fontSize: 13 }}>
                  {layer.name}
                </MenuItem>
              ))
          ]
        )}
      </Menu>
    </Box>
  );
};
