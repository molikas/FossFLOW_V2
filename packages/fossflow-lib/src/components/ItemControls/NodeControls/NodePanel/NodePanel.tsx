import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Typography,
  Divider,
  Stack
} from '@mui/material';
import { Close as CloseIcon, OpenInNew as OpenInNewIcon } from '@mui/icons-material';
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
          setActiveTab(TAB_NOTES);
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
    const hasCaption =
      !!modelItem.description && modelItem.description.replace(/<[^>]*>/g, '').trim() !== '';

    return (
      <Box
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
        sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.paper' }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            pt: 1,
            pb: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
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
          <Stack direction="row" spacing={0}>
            {modelItem.headerLink && (
              <Tooltip title="Open link">
                <IconButton
                  size="small"
                  component="a"
                  href={
                    /^https?:\/\//i.test(modelItem.headerLink)
                      ? modelItem.headerLink
                      : `https://${modelItem.headerLink}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ p: 0.5 }}
                >
                  <OpenInNewIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Close">
              <IconButton size="small" onClick={handleClose} sx={{ p: 0.5 }}>
                <CloseIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        {/* Scrollable body — caption then notes, no tabs */}
        <Box sx={{ overflowY: 'auto', flex: 1 }}>
          {hasCaption && (
            <Box sx={{ px: 2, pt: 2, pb: 1 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary"
                sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
                Caption
              </Typography>
              <RichTextEditor value={modelItem.description} readOnly />
            </Box>
          )}
          {hasCaption && hasNotes && <Divider sx={{ mx: 2 }} />}
          {hasNotes && (
            <Box sx={{ px: 2, pt: 2, pb: 2 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary"
                sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
                Notes
              </Typography>
              <RichTextEditor value={modelItem.notes} readOnly />
            </Box>
          )}
        </Box>
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
