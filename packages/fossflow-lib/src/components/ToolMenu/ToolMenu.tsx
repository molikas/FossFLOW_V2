import React, { useCallback } from 'react';
import { Stack, Chip } from '@mui/material';
import {
  PanToolOutlined as PanToolIcon,
  NearMeOutlined as NearMeIcon,
  EastOutlined as ConnectorIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
  HighlightAltOutlined as LassoIcon,
  GestureOutlined as FreehandLassoIcon
} from '@mui/icons-material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { IconButton } from 'src/components/IconButton/IconButton';
import { UiElement } from 'src/components/UiElement/UiElement';
import { useHistory } from 'src/hooks/useHistory';
import { HOTKEY_PROFILES } from 'src/config/hotkeys';
import { useTranslation } from 'src/stores/localeStore';

export const ToolMenu = () => {
  const { t } = useTranslation('toolMenu');
  const { undo, redo, canUndo, canRedo } = useHistory();
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const uiStateStoreActions = useUiStateStore((state) => state.actions);
  const hotkeyProfile = useUiStateStore((state) => {
    return state.hotkeyProfile;
  });
  const connectorInteractionMode = useUiStateStore((state) => {
    return state.connectorInteractionMode;
  });

  const hotkeys = HOTKEY_PROFILES[hotkeyProfile];

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
          name={`${t('undo')} (Ctrl+Z)`}
          Icon={<UndoIcon />}
          onClick={handleUndo}
          disabled={!canUndo}
        />
        <IconButton
          name={`${t('redo')} (Ctrl+Y)`}
          Icon={<RedoIcon />}
          onClick={handleRedo}
          disabled={!canRedo}
        />

        {/* Main Tools */}
        <IconButton
          name={`${t('select')}${hotkeys.select ? ` (${hotkeys.select.toUpperCase()})` : ''}`}
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
          name={`${t('lassoSelect')}${hotkeys.lasso ? ` (${hotkeys.lasso.toUpperCase()})` : ''}`}
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
          name={`${t('freehandLasso')}${hotkeys.freehandLasso ? ` (${hotkeys.freehandLasso.toUpperCase()})` : ''}`}
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
          name={`${t('pan')}${hotkeys.pan ? ` (${hotkeys.pan.toUpperCase()})` : ''}`}
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
          name={`${t('connector')}${hotkeys.connector ? ` (${hotkeys.connector.toUpperCase()})` : ''}`}
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
            label={connectorInteractionMode === 'click' ? 'Click' : 'Drag'}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.65rem', height: 18, mx: 'auto' }}
          />
        )}
      </Stack>
    </UiElement>
  );
};
