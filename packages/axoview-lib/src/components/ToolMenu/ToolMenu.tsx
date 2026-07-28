import React, { useCallback } from 'react';
import { Stack, Chip, Divider, Typography } from '@mui/material';
import {
  PanToolOutlined as PanToolIcon,
  NearMeOutlined as NearMeIcon,
  EastOutlined as ConnectorIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
  HighlightAltOutlined as LassoIcon,
  GestureOutlined as FreehandLassoIcon,
  ViewInArOutlined as IsometricIcon,
  GridOnOutlined as CartesianIcon
} from '@mui/icons-material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { IconButton } from 'src/components/IconButton/IconButton';
import { UiElement } from 'src/components/UiElement/UiElement';
import { useHistory } from 'src/hooks/useHistory';
import { TOOL_HOTKEYS } from 'src/config/hotkeys';
import { useTranslation } from 'src/stores/localeStore';
import { useCanvasModeToggle } from 'src/hooks/useCanvasModeToggle';
import { tooltipWithShortcut } from 'src/utils/tooltipWithShortcut';

export const ToolMenu = () => {
  const { t } = useTranslation('toolMenu');
  const { undo, redo, canUndo, canRedo } = useHistory();
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const uiStateStoreActions = useUiStateStore((state) => state.actions);
  const connectorInteractionMode = useUiStateStore((state) => {
    return state.connectorInteractionMode;
  });
  // Toggle + viewport-preserving scroll correction (shared with the view-only
  // present chrome, which mounts its own copy — the two are never live at once).
  const { canvasMode, toggleCanvasMode } = useCanvasModeToggle();

  const hotkeys = TOOL_HOTKEYS;

  const handleUndo = useCallback(() => {
    undo();
  }, [undo]);
  const handleRedo = useCallback(() => {
    redo();
  }, [redo]);

  return (
    <UiElement>
      <Stack direction="row" spacing={0.5} alignItems="center">
        {/* Undo/Redo Section */}
        <IconButton
          name={tooltipWithShortcut(t('undo'), 'Ctrl+Z')}
          Icon={<UndoIcon />}
          onClick={handleUndo}
          disabled={!canUndo}
        />
        <IconButton
          name={tooltipWithShortcut(t('redo'), 'Ctrl+Y')}
          Icon={<RedoIcon />}
          onClick={handleRedo}
          disabled={!canRedo}
        />

        {/* Main Tools */}
        <IconButton
          name={tooltipWithShortcut(t('select'), hotkeys.select?.toUpperCase())}
          Icon={<NearMeIcon />}
          onClick={() => {
            uiStateStoreActions.setMode({
              type: 'CURSOR',
              showCursor: true,
              mousedownItem: null
            });
          }}
          isActive={mode.type === 'CURSOR' || mode.type === 'DRAG_ITEMS'}
        />
        <IconButton
          name={tooltipWithShortcut(t('lassoSelect'), hotkeys.lasso?.toUpperCase())}
          Icon={<LassoIcon />}
          onClick={() => {
            uiStateStoreActions.setMode({
              type: 'LASSO',
              showCursor: true,
              selection: null,
              isDragging: false
            });
          }}
          isActive={mode.type === 'LASSO'}
        />
        <IconButton
          name={tooltipWithShortcut(t('freehandLasso'), hotkeys.freehandLasso?.toUpperCase())}
          Icon={<FreehandLassoIcon />}
          onClick={() => {
            uiStateStoreActions.setMode({
              type: 'FREEHAND_LASSO',
              showCursor: true,
              path: [],
              selection: null,
              isDragging: false
            });
          }}
          isActive={mode.type === 'FREEHAND_LASSO'}
        />
        <IconButton
          name={tooltipWithShortcut(t('pan'), hotkeys.pan?.toUpperCase())}
          Icon={<PanToolIcon />}
          onClick={() => {
            uiStateStoreActions.setMode({
              type: 'PAN',
              showCursor: false
            });

            uiStateStoreActions.setItemControls(null);
          }}
          isActive={mode.type === 'PAN'}
        />
        <IconButton
          name={tooltipWithShortcut(t('connector'), hotkeys.connector?.toUpperCase())}
          Icon={<ConnectorIcon />}
          onClick={() => {
            uiStateStoreActions.setMode({
              type: 'CONNECTOR',
              id: null,
              showCursor: true
            });
          }}
          isActive={mode.type === 'CONNECTOR'}
        />
        {mode.type === 'CONNECTOR' && (
          <Chip
            label={
              <Typography variant="micro" component="span">
                {/* D5 — connector-mode chip routed through i18n */}
                {connectorInteractionMode === 'click'
                  ? t('clickMode')
                  : t('dragMode')}
              </Typography>
            }
            size="small"
            variant="outlined"
            sx={{ height: 18, mx: 'auto' }}
          />
        )}

        {/* Canvas mode toggle */}
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <IconButton
          // D5 — canvas-mode toggle tooltip routed through i18n
          name={canvasMode === 'ISOMETRIC' ? t('switchTo2D') : t('switchToIsometric')}
          Icon={canvasMode === 'ISOMETRIC' ? <CartesianIcon /> : <IsometricIcon />}
          onClick={toggleCanvasMode}
          isActive={false}
          dataAxoviewId="canvas-mode-toggle"
        />
      </Stack>
    </UiElement>
  );
};
