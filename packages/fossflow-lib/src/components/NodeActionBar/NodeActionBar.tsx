import React, { useCallback } from 'react';
import { Box, Paper, Tooltip, IconButton } from '@mui/material';
import {
  PaletteOutlined as StyleIcon,
  EditOutlined as EditIcon,
  LinkOutlined as LinkIcon,
  StickyNote2Outlined as NotesIcon,
  DeleteOutlined as DeleteIcon,
  CallMadeOutlined as ConnectorIcon
} from '@mui/icons-material';
import { getTilePosition, generateId } from 'src/utils';
import { useViewItem } from 'src/hooks/useViewItem';
import { useModelItem } from 'src/hooks/useModelItem';
import { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useTranslation } from 'src/stores/localeStore';

const dispatch = (action: string) =>
  window.dispatchEvent(new CustomEvent('nodePanel', { detail: action }));

interface Props {
  id: string;
}

export const NodeActionBar = ({ id }: Props) => {
  const { t } = useTranslation('nodeActionBar');
  const viewItem = useViewItem(id);
  const modelItem = useModelItem(id);
  const { deleteViewItem, createConnector, colors } = useScene();
  const uiStateActions = useUiStateStore((state) => state.actions);

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

  if (!viewItem || !modelItem) return null;

  const hasNotes =
    !!modelItem.notes && modelItem.notes.replace(/<[^>]*>/g, '').trim() !== '';

  const pos = getTilePosition({ tile: viewItem.tile, origin: 'TOP' });

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
    </Box>
  );
};
