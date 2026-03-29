import React, { useCallback, useMemo, useRef } from 'react';
import { Box, useTheme, Typography, Stack } from '@mui/material';
import { shallow } from 'zustand/shallow';
import { ChevronRight } from '@mui/icons-material';
import { EditorModeEnum, DialogTypeEnum } from 'src/types';
import { UiElement } from 'components/UiElement/UiElement';
import { SceneLayer } from 'src/components/SceneLayer/SceneLayer';
import { DragAndDrop } from 'src/components/DragAndDrop/DragAndDrop';
import { ItemControlsManager } from 'src/components/ItemControls/ItemControlsManager';
import { ToolMenu } from 'src/components/ToolMenu/ToolMenu';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { MainMenu } from 'src/components/MainMenu/MainMenu';
import { ZoomControls } from 'src/components/ZoomControls/ZoomControls';
import { DebugUtils } from 'src/components/DebugUtils/DebugUtils';
import { ContextMenuManager } from 'src/components/ContextMenu/ContextMenuManager';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { ExportImageDialog } from '../ExportImageDialog/ExportImageDialog';
import { HelpDialog } from '../HelpDialog/HelpDialog';
import { SettingsDialog } from '../SettingsDialog/SettingsDialog';
import { ConnectorHintTooltip } from '../ConnectorHintTooltip/ConnectorHintTooltip';
import { ConnectorEmptySpaceTooltip } from '../ConnectorEmptySpaceTooltip/ConnectorEmptySpaceTooltip';
import { ConnectorRerouteTooltip } from '../ConnectorRerouteTooltip/ConnectorRerouteTooltip';
import { ImportHintTooltip } from '../ImportHintTooltip/ImportHintTooltip';
import { LassoHintTooltip } from '../LassoHintTooltip/LassoHintTooltip';
import { LazyLoadingWelcomeNotification } from '../LazyLoadingWelcomeNotification/LazyLoadingWelcomeNotification';
import { NotificationSnackbar } from '../NotificationSnackbar/NotificationSnackbar';
import { CoordsUtils, getTilePosition } from 'src/utils';
import { ViewTabs } from 'src/components/ViewTabs/ViewTabs';
import { QuickAddNodePopover } from 'src/components/QuickAddNodePopover/QuickAddNodePopover';
import { NodeActionBar } from 'src/components/NodeActionBar/NodeActionBar';

const ToolsEnum = {
  MAIN_MENU: 'MAIN_MENU',
  ZOOM_CONTROLS: 'ZOOM_CONTROLS',
  TOOL_MENU: 'TOOL_MENU',
  ITEM_CONTROLS: 'ITEM_CONTROLS',
  VIEW_TITLE: 'VIEW_TITLE',
  VIEW_TABS: 'VIEW_TABS'
} as const;

interface EditorModeMapping {
  [k: string]: (keyof typeof ToolsEnum)[];
}

const EDITOR_MODE_MAPPING: EditorModeMapping = {
  [EditorModeEnum.EDITABLE]: [
    'ITEM_CONTROLS',
    'ZOOM_CONTROLS',
    'TOOL_MENU',
    'MAIN_MENU',
    'VIEW_TABS'
  ],
  [EditorModeEnum.EXPLORABLE_READONLY]: ['ITEM_CONTROLS', 'ZOOM_CONTROLS', 'VIEW_TABS'],
  [EditorModeEnum.NON_INTERACTIVE]: []
};

const getEditorModeMapping = (editorMode: keyof typeof EditorModeEnum) => {
  return EDITOR_MODE_MAPPING[editorMode];
};

// Isolated component so UiOverlay doesn't re-render on every mouse move.
// Only mounts when mode.type === 'PLACE_ICON'.
const PlaceIconLayer = () => {
  const mode = useUiStateStore((state) => state.mode);
  const tile = useUiStateStore(
    (state) => state.mouse.position.tile,
    (a, b) => a.x === b.x && a.y === b.y
  );

  if (mode.type !== 'PLACE_ICON' || !mode.id) return null;

  return (
    <SceneLayer disableAnimation>
      <DragAndDrop iconId={mode.id} tile={tile} />
    </SceneLayer>
  );
};

export const UiOverlay = () => {
  const theme = useTheme();
  const contextMenuAnchorRef = useRef<HTMLDivElement>(null);
  const toolMenuRef = useRef<HTMLDivElement>(null);
  const { appPadding } = theme.customVars;
  const spacing = useCallback(
    (multiplier: number) => {
      return parseInt(theme.spacing(multiplier), 10);
    },
    [theme]
  );

  const {
    uiStateActions,
    enableDebugTools,
    mode,
    dialog,
    itemControls,
    editorMode,
    iconPackManager,
    contextMenu
  } = useUiStateStore(
    (state) => ({
      uiStateActions: state.actions,
      enableDebugTools: state.enableDebugTools,
      mode: state.mode,
      dialog: state.dialog,
      itemControls: state.itemControls,
      editorMode: state.editorMode,
      iconPackManager: state.iconPackManager,
      contextMenu: state.contextMenu
    }),
    shallow
  );

  const { currentView } = useScene();
  const availableTools = useMemo(() => {
    return getEditorModeMapping(editorMode);
  }, [editorMode]);
  const title = useModelStore((state) => {
    return state.title;
  });
  const rendererSize = useUiStateStore((state) => state.rendererSize);

  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          width: 0,
          height: 0,
          top: 0,
          left: 0
        }}
      >
        {availableTools.includes('ITEM_CONTROLS') && itemControls && (
          <UiElement
            sx={{
              position: 'absolute',
              width: '300px',
              transform: 'translateX(-100%)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              '@keyframes panelSlideIn': {
                from: { opacity: 0, transform: 'translateX(calc(-100% + 16px))' },
                to:   { opacity: 1, transform: 'translateX(-100%)' }
              },
              animation: 'panelSlideIn 0.15s ease-out'
            }}
            style={{
              left: rendererSize.width - appPadding.x,
              top: appPadding.y,
              height: rendererSize.height - appPadding.y * 2
            }}
          >
            <ItemControlsManager readOnly={editorMode === EditorModeEnum.EXPLORABLE_READONLY} />
          </UiElement>
        )}

        {availableTools.includes('TOOL_MENU') && (
          <Box
            ref={toolMenuRef}
            onMouseDown={(e) => e.stopPropagation()}
            sx={{
              position: 'absolute',
              transform: 'translateX(-50%)'
            }}
            style={{
              left: rendererSize.width / 2,
              top: 10
            }}
          >
            <ToolMenu />
          </Box>
        )}

        {availableTools.includes('ZOOM_CONTROLS') && (
          <Box
            sx={{
              position: 'absolute',
              transformOrigin: 'bottom left'
            }}
            style={{
              top: rendererSize.height - appPadding.y * 2,
              left: appPadding.x
            }}
          >
            <ZoomControls />
          </Box>
        )}

        {availableTools.includes('MAIN_MENU') && (
          <Box
            sx={{
              position: 'absolute'
            }}
            style={{
              top: appPadding.y,
              left: appPadding.x
            }}
          >
            <MainMenu />
          </Box>
        )}

        {availableTools.includes('VIEW_TITLE') && (
          <Box
            sx={{
              position: 'absolute',
              display: 'flex',
              justifyContent: 'center',
              transform: 'translateX(-50%)',
              pointerEvents: 'none'
            }}
            style={{
              left: rendererSize.width / 2,
              top: rendererSize.height - appPadding.y * 2,
              width: rendererSize.width - 500,
              height: appPadding.y
            }}
          >
            <UiElement
              sx={{
                display: 'inline-flex',
                px: 2,
                alignItems: 'center',
                height: '100%'
              }}
            >
              <Stack direction="row" alignItems="center">
                <Typography fontWeight={600} color="text.secondary">
                  {title}
                </Typography>
                <ChevronRight />
                <Typography fontWeight={600} color="text.secondary">
                  {currentView.name}
                </Typography>
              </Stack>
            </UiElement>
          </Box>
        )}

        {availableTools.includes('VIEW_TABS') && (
          <Box
            sx={{
              position: 'absolute',
              display: 'flex',
              justifyContent: 'center',
              transform: 'translateX(-50%)'
            }}
            style={{
              left: rendererSize.width / 2,
              top: rendererSize.height - appPadding.y * 2,
              maxWidth: rendererSize.width - 300
            }}
          >
            <ViewTabs />
          </Box>
        )}

        {enableDebugTools && (
          <UiElement
            sx={{
              position: 'absolute',
              width: 350,
              transform: 'translateY(-100%)'
            }}
            style={{
              maxWidth: `calc(${rendererSize.width} - ${appPadding.x * 2}px)`,
              left: appPadding.x,
              top: rendererSize.height - appPadding.y * 2 - spacing(1)
            }}
          >
            <DebugUtils />
          </UiElement>
        )}
      </Box>

      <PlaceIconLayer />

      {dialog === DialogTypeEnum.EXPORT_IMAGE && (
        <ExportImageDialog
          onClose={() => {
            return uiStateActions.setDialog(null);
          }}
        />
      )}

      {dialog === DialogTypeEnum.HELP && <HelpDialog />}

      {dialog === DialogTypeEnum.SETTINGS && <SettingsDialog iconPackManager={iconPackManager || undefined} />}

      {/* Show hint tooltips only in editable mode */}
      {editorMode === EditorModeEnum.EDITABLE && <ConnectorHintTooltip toolMenuRef={toolMenuRef} />}
      {editorMode === EditorModeEnum.EDITABLE && <ConnectorEmptySpaceTooltip />}
      {editorMode === EditorModeEnum.EDITABLE && <ConnectorRerouteTooltip />}
      {editorMode === EditorModeEnum.EDITABLE && <ImportHintTooltip toolMenuRef={toolMenuRef} />}
      {editorMode === EditorModeEnum.EDITABLE && <LassoHintTooltip toolMenuRef={toolMenuRef} />}

      {/* Show lazy loading welcome notification if icon pack manager is provided */}
      {iconPackManager && <LazyLoadingWelcomeNotification />}

      <NotificationSnackbar />

      {/* Double-click empty canvas → place node at cursor */}
      {editorMode === EditorModeEnum.EDITABLE && <QuickAddNodePopover />}

      <SceneLayer>
        {contextMenu && (
          <Box
            ref={contextMenuAnchorRef}
            sx={{
              position: 'absolute',
              left: getTilePosition({ tile: contextMenu.tile }).x,
              top: getTilePosition({ tile: contextMenu.tile }).y
            }}
          />
        )}
        <ContextMenuManager anchorEl={contextMenu && contextMenu.type === "EMPTY" ? contextMenuAnchorRef.current : null} />

        {/* Floating action bar — edit mode only, hidden while dragging */}
        {editorMode === EditorModeEnum.EDITABLE &&
          itemControls?.type === 'ITEM' &&
          mode.type !== 'DRAG_ITEMS' && (
            <NodeActionBar id={itemControls.id} />
          )}
      </SceneLayer>
    </>
  );
};
