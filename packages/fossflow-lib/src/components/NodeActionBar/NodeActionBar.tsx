import React, { useCallback, useState } from 'react';
import { Box, Paper, Tooltip, IconButton, Menu, MenuItem, Divider } from '@mui/material';
import {
  PaletteOutlined as StyleIcon,
  EditOutlined as EditIcon,
  LinkOutlined as LinkIcon,
  StickyNote2Outlined as NotesIcon,
  DeleteOutlined as DeleteIcon,
  CallMadeOutlined as ConnectorIcon,
  LayersOutlined as LayersIcon,
  ArrowUpwardOutlined as BringForwardIcon,
  ArrowDownwardOutlined as SendBackIcon
} from '@mui/icons-material';
import { getTilePosition, generateId } from 'src/utils';
import { useViewItem } from 'src/hooks/useViewItem';
import { useModelItem } from 'src/hooks/useModelItem';
import { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useTranslation } from 'src/stores/localeStore';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { useLayerActions } from 'src/hooks/useLayerActions';

const dispatch = (action: string) =>
  window.dispatchEvent(new CustomEvent('nodePanel', { detail: action }));

interface Props {
  id: string;
}

export const NodeActionBar = ({ id }: Props) => {
  const { t } = useTranslation('nodeActionBar');
  const viewItem = useViewItem(id);
  const modelItem = useModelItem(id);
  const { deleteViewItem, createConnector, updateViewItem, colors } = useScene();
  const uiStateActions = useUiStateStore((state) => state.actions);
  const { layers } = useLayerContext();
  const { assignLayerToItems } = useLayerActions();
  const [layerMenuAnchor, setLayerMenuAnchor] = useState<HTMLElement | null>(null);

  const handleDelete = useCallback(() => {
    uiStateActions.setItemControls(null);
    deleteViewItem(id);
  }, [uiStateActions, deleteViewItem, id]);

  const handleStartConnector = useCallback(() => {
    const newConnector = {
      id: generateId(),
      color: colors[0]?.id ?? '',
      anchors: [
        { id: generateId(), ref: { item: id } },
        { id: generateId(), ref: { item: id } }
      ]
    };
    createConnector(newConnector);
    uiStateActions.setItemControls(null);
    uiStateActions.setMode({
      type: 'CONNECTOR',
      showCursor: true,
      id: newConnector.id,
      startAnchor: { itemId: id },
      isConnecting: true,
      returnToCursor: true
    });
  }, [id, colors, createConnector, uiStateActions]);

  const handleBringForward = useCallback(() => {
    if (!viewItem) return;
    const currentZ = (viewItem as any).zIndex ?? 0;
    updateViewItem(id, { zIndex: currentZ + 1 });
  }, [id, viewItem, updateViewItem]);

  const handleSendBack = useCallback(() => {
    if (!viewItem) return;
    const currentZ = (viewItem as any).zIndex ?? 0;
    updateViewItem(id, { zIndex: currentZ - 1 });
  }, [id, viewItem, updateViewItem]);

  const handleAssignLayer = useCallback((layerId: string | undefined) => {
    assignLayerToItems(layerId, [{ type: 'ITEM', id }]);
    setLayerMenuAnchor(null);
  }, [assignLayerToItems, id]);

  if (!viewItem || !modelItem) return null;

  const hasNotes =
    !!modelItem.notes && modelItem.notes.replace(/<[^>]*>/g, '').trim() !== '';

  const pos = getTilePosition({ tile: viewItem.tile, origin: 'TOP' });
  const currentLayerId = (viewItem as any).layerId as string | undefined;

  return (
    <Box
      sx={{
        position: 'absolute',
        left: pos.x,
        top: pos.y - 40,
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
          px: 0.75,
          py: 0.25,
          gap: 0,
          bgcolor: 'background.paper'
        }}
      >
        <Tooltip title={t('style')} placement="top">
          <IconButton
            size="small"
            onClick={() => dispatch('scrollToAppearance')}
            sx={{ p: 0.75 }}
          >
            <StyleIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title={t('editName')} placement="top">
          <IconButton
            size="small"
            onClick={() => dispatch('focusName')}
            sx={{ p: 0.75 }}
          >
            <EditIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip
          title={modelItem.headerLink ? t('editLink') : t('addLink')}
          placement="top"
        >
          <IconButton
            size="small"
            onClick={() => dispatch('focusLink')}
            color={modelItem.headerLink ? 'primary' : 'default'}
            sx={{ p: 0.75 }}
          >
            <LinkIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip
          title={hasNotes ? t('editNotes') : t('addNotes')}
          placement="top"
        >
          <IconButton
            size="small"
            onClick={() => dispatch('focusNotes')}
            color={hasNotes ? 'primary' : 'default'}
            sx={{ p: 0.75 }}
          >
            <NotesIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title={t('startConnector')} placement="top">
          <IconButton
            size="small"
            onClick={handleStartConnector}
            sx={{ p: 0.75 }}
          >
            <ConnectorIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        {/* Layer assignment — always shown so users discover layers */}
        <Tooltip title="Assign to layer" placement="top">
          <IconButton
            size="small"
            onClick={(e) => setLayerMenuAnchor(e.currentTarget)}
            color={currentLayerId ? 'primary' : 'default'}
            sx={{ p: 0.75 }}
          >
            <LayersIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        {/* Z-order */}
        <Tooltip title="Bring forward (Ctrl+])" placement="top">
          <IconButton size="small" onClick={handleBringForward} sx={{ p: 0.75 }}>
            <BringForwardIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Send back (Ctrl+[)" placement="top">
          <IconButton size="small" onClick={handleSendBack} sx={{ p: 0.75 }}>
            <SendBackIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title={t('delete')} placement="top">
          <IconButton
            size="small"
            onClick={handleDelete}
            color="error"
            sx={{ p: 0.75 }}
          >
            <DeleteIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Paper>

      {/* Layer assignment popover */}
      <Menu
        anchorEl={layerMenuAnchor}
        open={!!layerMenuAnchor}
        onClose={() => setLayerMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {layers.length === 0 ? (
          <MenuItem disabled sx={{ fontSize: 13 }}>
            No layers — open the Layers panel to add one
          </MenuItem>
        ) : (
          [
            currentLayerId && (
              <MenuItem key="remove" onClick={() => handleAssignLayer(undefined)} sx={{ fontSize: 13 }}>
                Remove from layer
              </MenuItem>
            ),
            currentLayerId && <Divider key="divider" />,
            ...[...layers]
              .sort((a, b) => b.order - a.order)
              .map((layer) => (
                <MenuItem
                  key={layer.id}
                  onClick={() => handleAssignLayer(layer.id)}
                  selected={layer.id === currentLayerId}
                  sx={{ fontSize: 13 }}
                >
                  {layer.name}
                </MenuItem>
              ))
          ]
        )}
      </Menu>
    </Box>
  );
};
