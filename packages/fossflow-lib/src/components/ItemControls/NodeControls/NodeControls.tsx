import React, { useState, useCallback, useEffect } from 'react';
import { Box, Tabs, Tab, Button } from '@mui/material';
import { Close as CloseIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useScene } from 'src/hooks/useScene';
import { useViewItem } from 'src/hooks/useViewItem';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelItem } from 'src/hooks/useModelItem';
import { useIcon } from 'src/hooks/useIcon';
import { ControlsContainer } from '../components/ControlsContainer';
import { NodeInfoTab } from './NodeInfoTab/NodeInfoTab';
import { NodeStyleTab } from './NodeStyleTab/NodeStyleTab';

interface Props {
  id: string;
  readOnly?: boolean;
}

export const NodeControls = ({ id, readOnly }: Props) => {
  const [tab, setTab] = useState(0);
  const [showLink, setShowLink] = useState(false);
  const { updateModelItem, updateViewItem, deleteViewItem } = useScene();
  const uiStateActions = useUiStateStore((state) => state.actions);
  const viewItem = useViewItem(id);
  const modelItem = useModelItem(id);
  const { icon } = useIcon(modelItem?.icon || '');

  // 'i' hotkey → jump to Style tab (icon picker) — only in editable mode
  useEffect(() => {
    if (readOnly) return;
    const handleQuickIconChange = () => setTab(1);
    window.addEventListener('quickIconChange', handleQuickIconChange);
    return () => window.removeEventListener('quickIconChange', handleQuickIconChange);
  }, [readOnly]);

  const handleClose = useCallback(() => {
    uiStateActions.setItemControls(null);
  }, [uiStateActions]);

  const handleDelete = useCallback(() => {
    uiStateActions.setItemControls(null);
    deleteViewItem(viewItem!.id);
  }, [uiStateActions, deleteViewItem, viewItem]);

  if (!viewItem || !modelItem) return null;

  return (
    <ControlsContainer>
      {/* Header: tabs + close */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider',
          pr: 0.5
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ flex: 1, minHeight: 36 }}
          TabIndicatorProps={{ style: { height: 2 } }}
        >
          <Tab label="Info" sx={{ minHeight: 36, py: 0, fontSize: 13 }} />
          {!readOnly && <Tab label="Style" sx={{ minHeight: 36, py: 0, fontSize: 13 }} />}
        </Tabs>
        {!readOnly && (
          <Button
            size="small"
            color="error"
            variant="text"
            startIcon={<DeleteIcon sx={{ width: 14, height: 14 }} />}
            onClick={handleDelete}
            sx={{ fontSize: 11, px: 1, minWidth: 0, whiteSpace: 'nowrap' }}
          >
            Delete
          </Button>
        )}
        <Box
          component="button"
          onClick={handleClose}
          aria-label="Close"
          sx={{
            ml: 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderRadius: 1,
            color: 'text.secondary',
            '&:hover': { bgcolor: 'action.hover' }
          }}
        >
          <CloseIcon sx={{ width: 16, height: 16 }} />
        </Box>
      </Box>

      {/* Tab panels */}
      {tab === 0 && (
        <NodeInfoTab
          node={viewItem}
          readOnly={readOnly}
          onModelItemUpdated={(updates) => updateModelItem(viewItem.id, updates)}
          showLink={showLink}
          onShowLinkChange={setShowLink}
        />
      )}
      {tab === 1 && !readOnly && (
        <NodeStyleTab
          node={viewItem}
          iconUrl={icon.url}
          onModelItemUpdated={(updates) => updateModelItem(viewItem.id, updates)}
          onViewItemUpdated={(updates) => updateViewItem(viewItem.id, updates)}
        />
      )}
    </ControlsContainer>
  );
};
