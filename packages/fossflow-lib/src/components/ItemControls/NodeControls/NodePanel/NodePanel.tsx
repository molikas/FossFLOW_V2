import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Typography
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { ModelItem, ViewItem } from 'src/types';
import { useModelItem } from 'src/hooks/useModelItem';
import { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useIcon } from 'src/hooks/useIcon';
import { RichTextEditor } from 'src/components/RichTextEditor/RichTextEditor';
import { NodeInfoTab } from '../NodeInfoTab/NodeInfoTab';
import { NodeStyleTab } from '../NodeStyleTab/NodeStyleTab';

const PANEL_EVENT = 'nodePanel';

const TAB_DETAILS = 0;
const TAB_STYLE = 1;
const TAB_NOTES = 2;

// readonly mode only has Details + Notes
const TAB_READONLY_DETAILS = 0;
const TAB_READONLY_NOTES = 1;

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = ({ children, index, value }: TabPanelProps) => (
  <Box
    role="tabpanel"
    hidden={value !== index}
    sx={{ flex: 1, overflowY: 'auto', display: value === index ? 'flex' : 'none', flexDirection: 'column' }}
  >
    {value === index && children}
  </Box>
);

interface Props {
  viewItem: ViewItem;
  readOnly?: boolean;
}

export const NodePanel = ({ viewItem, readOnly }: Props) => {
  const modelItem = useModelItem(viewItem.id);
  const { updateModelItem, updateViewItem } = useScene();
  const uiStateActions = useUiStateStore((state) => state.actions);
  const { icon } = useIcon(modelItem?.icon || '');

  const [activeTab, setActiveTab] = useState(TAB_DETAILS);
  const [showLink, setShowLink] = useState(!!modelItem?.headerLink);
  const nameRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  // Listen for action-bar commands
  useEffect(() => {
    if (readOnly) return;

    const handler = (e: Event) => {
      const action = (e as CustomEvent<string>).detail;
      switch (action) {
        case 'focusName':
          setActiveTab(TAB_DETAILS);
          requestAnimationFrame(() => {
            nameRef.current?.focus();
            nameRef.current?.select();
          });
          break;
        case 'focusLink':
          setActiveTab(TAB_DETAILS);
          setShowLink(true);
          requestAnimationFrame(() => linkRef.current?.focus());
          break;
        case 'scrollToAppearance':
          setActiveTab(TAB_STYLE);
          break;
        case 'focusNotes':
          setActiveTab(readOnly ? TAB_READONLY_NOTES : TAB_NOTES);
          break;
      }
    };

    window.addEventListener(PANEL_EVENT, handler);
    return () => window.removeEventListener(PANEL_EVENT, handler);
  }, [readOnly]);

  const handleClose = useCallback(() => {
    uiStateActions.setItemControls(null);
  }, [uiStateActions]);

  const onModelUpdate = useCallback(
    (updates: Partial<ModelItem>) => updateModelItem(viewItem.id, updates),
    [updateModelItem, viewItem.id]
  );

  const onViewUpdate = useCallback(
    (updates: Partial<ViewItem>) => updateViewItem(viewItem.id, updates),
    [updateViewItem, viewItem.id]
  );

  if (!modelItem) return null;

  const hasNotes =
    !!modelItem.notes && modelItem.notes.replace(/<[^>]*>/g, '').trim() !== '';

  const iconUrl = icon.url || '';

  if (readOnly) {
    return (
      <Box
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
        sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.paper' }}
      >
        {/* Header: name row */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            pt: 1,
            pb: 0.5,
            flexShrink: 0
          }}
        >
          {iconUrl && (
            <Box component="img" src={iconUrl} sx={{ width: 22, height: 22, flexShrink: 0 }} />
          )}
          <Typography
            variant="subtitle2"
            fontWeight={700}
            sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {modelItem.name || '—'}
          </Typography>
          <Tooltip title="Close">
            <IconButton size="small" onClick={handleClose} sx={{ p: 0.5 }}>
              <CloseIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </Box>
        {/* Tab bar */}
        <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{
              minHeight: 32,
              '& .MuiTab-root': { minHeight: 32, fontSize: '0.72rem', py: 0.5, px: 1.5 }
            }}
          >
            <Tab label="Details" value={TAB_READONLY_DETAILS} />
            <Tab
              label={hasNotes ? 'Notes ●' : 'Notes'}
              value={TAB_READONLY_NOTES}
              sx={{ color: hasNotes ? 'primary.main' : undefined }}
            />
          </Tabs>
        </Box>

        <TabPanel value={activeTab} index={TAB_READONLY_DETAILS}>
          <NodeInfoTab
            node={viewItem}
            readOnly
            onModelItemUpdated={onModelUpdate}
            nameRef={nameRef}
            linkRef={linkRef}
            showLink={showLink}
            onShowLinkChange={setShowLink}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={TAB_READONLY_NOTES}>
          <Box sx={{ p: 2 }}>
            {hasNotes ? (
              <RichTextEditor value={modelItem.notes} readOnly height={300} />
            ) : (
              <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                No notes for this node.
              </Typography>
            )}
          </Box>
        </TabPanel>
      </Box>
    );
  }

  return (
    <Box
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.paper' }}
    >
      {/* Header: tab bar + close button */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
          pl: 0.5,
          pr: 0.5
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            flex: 1,
            minHeight: 36,
            '& .MuiTab-root': { minHeight: 36, fontSize: '0.72rem', py: 0.5, px: 1.5 }
          }}
        >
          <Tab label="Details" value={TAB_DETAILS} />
          <Tab label="Style" value={TAB_STYLE} />
          <Tab
            label={hasNotes ? 'Notes ●' : 'Notes'}
            value={TAB_NOTES}
            sx={{ color: hasNotes ? 'primary.main' : undefined }}
          />
        </Tabs>
        <Tooltip title="Close">
          <IconButton size="small" onClick={handleClose} sx={{ p: 0.5, flexShrink: 0 }}>
            <CloseIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Details tab */}
      <TabPanel value={activeTab} index={TAB_DETAILS}>
        <NodeInfoTab
          node={viewItem}
          onModelItemUpdated={onModelUpdate}
          nameRef={nameRef}
          linkRef={linkRef}
          showLink={showLink}
          onShowLinkChange={setShowLink}
        />
      </TabPanel>

      {/* Style tab */}
      <TabPanel value={activeTab} index={TAB_STYLE}>
        <NodeStyleTab
          node={viewItem}
          iconUrl={iconUrl}
          onModelItemUpdated={onModelUpdate}
          onViewItemUpdated={onViewUpdate}
        />
      </TabPanel>

      {/* Notes tab */}
      <TabPanel value={activeTab} index={TAB_NOTES}>
        <Box sx={{ p: 2 }}>
          <RichTextEditor
            height={300}
            value={modelItem.notes}
            onChange={(text) => {
              const hasContent = (v?: string) =>
                !!v && v.replace(/<[^>]*>/g, '').trim() !== '';
              const empty = !hasContent(text);
              if (empty && !hasContent(modelItem.notes)) return;
              if (modelItem.notes !== text)
                onModelUpdate({ notes: empty ? undefined : text });
            }}
          />
        </Box>
      </TabPanel>
    </Box>
  );
};
