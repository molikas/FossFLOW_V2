import React from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { TuneOutlined, ChevronRight as CollapseIcon } from '@mui/icons-material';
import { EditorModeEnum } from 'src/types';
import { ItemControlsManager } from 'src/components/ItemControls/ItemControlsManager';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useTranslation } from 'src/stores/localeStore';

interface Props {
  open: boolean;
  editorMode: string;
}

export const RightSidebar = ({ open, editorMode }: Props) => {
  const { t } = useTranslation('rightSidebar');
  const itemControls = useUiStateStore((s) => s.itemControls);
  const storeEditorMode = useUiStateStore((s) => s.editorMode);
  const setRightSidebarOpen = useUiStateStore(
    (s) => s.actions.setRightSidebarOpen
  );

  // Two sources describe the same fact: the `editorMode` PROP that Axoview
  // threads down, and the store field that same prop is synced into
  // (`Axoview.tsx` is its only production writer, so they normally agree — the
  // window is the first paint before the sync effect runs, plus any consumer
  // that drives the store directly). A read-only gate must not be defeated by
  // whichever copy is stale, so either saying "view mode" is enough. F2/VIEW-11.
  const readOnly =
    editorMode === EditorModeEnum.EXPLORABLE_READONLY ||
    storeEditorMode === EditorModeEnum.EXPLORABLE_READONLY;
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
        boxShadow: open ? 3 : 0,
        // Reveal the collapse tab only on dock hover/focus (§2.3).
        '&:hover .ax-collapse-tab, &:focus-within .ax-collapse-tab': {
          opacity: 1,
          pointerEvents: 'all'
        }
      }}
    >
      {/* Explicit collapse affordance — an edge "tab" on the dock's left border,
          mirroring the left-dock handles. Invisible + inert until the dock is
          hovered/focused (§2.3). The top-bar toggle already opens/closes this
          dock; this gives users the directional arrow they look for to dismiss
          it. Arrow points right (the collapse direction). Hardcoded label matches
          the sibling right-dock chrome (UiOverlay "Toggle Properties panel"). */}
      {open && (
        <Tooltip title={t('collapsePanel')} placement="left">
          <IconButton
            className="ax-collapse-tab"
            size="small"
            onClick={() => setRightSidebarOpen(false)}
            data-axoview-id="right-sidebar-collapse"
            sx={{
              position: 'absolute',
              top: '50%',
              left: -22,
              transform: 'translateY(-50%)',
              width: 22,
              height: 44,
              borderRadius: '8px 0 0 8px',
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRight: 'none',
              color: 'text.secondary',
              boxShadow: 2,
              opacity: 0,
              pointerEvents: 'none',
              transition: 'opacity 120ms ease',
              '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
              '&:focus-visible': { opacity: 1, pointerEvents: 'all' }
            }}
          >
            <CollapseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}
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
            {t('emptyState')}
          </Typography>
        </Box>
      )}
    </Box>
  );
};
