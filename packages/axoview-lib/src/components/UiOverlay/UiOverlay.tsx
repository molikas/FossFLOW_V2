import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Box,
  useTheme,
  Typography,
  Stack,
  IconButton,
  Tooltip
} from '@mui/material';
import { shallow } from 'zustand/shallow';
import { ChevronRight, ViewSidebarOutlined } from '@mui/icons-material';
import { EditorModeEnum, DialogTypeEnum } from 'src/types';
import { UiElement } from 'components/UiElement/UiElement';
import { SceneLayer } from 'src/components/SceneLayer/SceneLayer';
import { DragAndDrop } from 'src/components/DragAndDrop/DragAndDrop';
import { ToolMenu } from 'src/components/ToolMenu/ToolMenu';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { DebugUtils } from 'src/components/DebugUtils/DebugUtils';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { ExportImageDialog } from '../ExportImageDialog/ExportImageDialog';
import { HelpDialog } from '../HelpDialog/HelpDialog';
import { SettingsDialog } from '../SettingsDialog/SettingsDialog';
import { LazyLoadingWelcomeNotification } from '../LazyLoadingWelcomeNotification/LazyLoadingWelcomeNotification';
import { NotificationSnackbar } from '../NotificationSnackbar/NotificationSnackbar';
import { CanvasContextMenu } from 'src/components/CanvasContextMenu/CanvasContextMenu';
import { PreviewLayerSwitcher } from 'src/components/PreviewLayerSwitcher/PreviewLayerSwitcher';
import { PreviewCanvasModeToggle } from 'src/components/PreviewCanvasModeToggle/PreviewCanvasModeToggle';
// PreviewLabelsToggle moved into the bottom-dock zoom cluster (global hide-labels
// toggle), so it's no longer rendered here.
import { ViewModeInfoPopover } from 'src/components/ViewModeInfoPopover/ViewModeInfoPopover';
import { TopBarStyleControls } from 'src/components/TopBarStyleControls/TopBarStyleControls';
import { AnnotationLayer } from 'src/components/AnnotationLayer/AnnotationLayer';
import { AnnotationPalette } from 'src/components/AnnotationPalette/AnnotationPalette';
import { CanvasCompositorOverlay } from 'src/components/CanvasCompositorOverlay/CanvasCompositorOverlay';
import { ConnectorModeHint } from '../ModeHint/ConnectorModeHint';
import { PlacementModeHint } from '../ModeHint/PlacementModeHint';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';

type ToolName = 'TOOL_MENU' | 'ITEM_CONTROLS' | 'VIEW_TITLE' | 'VIEW_TABS';

interface EditorModeMapping {
  [k: string]: ToolName[];
}

const EDITOR_MODE_MAPPING: EditorModeMapping = {
  [EditorModeEnum.EDITABLE]: ['ITEM_CONTROLS', 'TOOL_MENU', 'VIEW_TABS'],
  [EditorModeEnum.EXPLORABLE_READONLY]: ['ITEM_CONTROLS', 'VIEW_TABS'],
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

  if (mode.type !== 'PLACE_ICON' || !mode.id || mode.suppressPreview)
    return null;

  return (
    <SceneLayer disableAnimation>
      <DragAndDrop iconId={mode.id} tile={tile} />
    </SceneLayer>
  );
};

// B1/B2 — a faint ghost of the element a placement tool will drop, anchored to
// the hover tile (the icon tool already ghosts via PlaceIconLayer; this
// generalizes the affordance to text / label / rectangle / connector so the
// armed tool shows WHAT it will place before the first click). Isolated so
// UiOverlay doesn't re-render on mouse move.
const PlacementGhostLayer = () => {
  const modeType = useUiStateStore((s) => s.mode.type);
  // Connector: only ghost while the tool is armed BEFORE the first anchor — once
  // connecting, the real rubber-band path takes over.
  const connectorArmed = useUiStateStore(
    (s) =>
      s.mode.type === 'CONNECTOR' &&
      !(s.mode as { startAnchor?: unknown }).startAnchor &&
      !(s.mode as { isConnecting?: boolean }).isConnecting
  );
  const tile = useUiStateStore(
    (s) => s.mouse.position.tile,
    (a, b) => a.x === b.x && a.y === b.y
  );
  const { getTilePosition } = useCanvasMode();
  const theme = useTheme();

  const show =
    modeType === 'TEXTBOX' ||
    modeType === 'LABEL' ||
    modeType === 'RECTANGLE.DRAW' ||
    (modeType === 'CONNECTOR' && connectorArmed);
  if (!show) return null;

  const pos = getTilePosition({ tile, origin: 'CENTER' });
  const accent = theme.palette.primary.main;

  // Chip-style ghost for the text-ish tools (a faint copy of the element).
  const chip = (labelText: string, radius: number, bg: string) => (
    <Box
      data-testid="placement-ghost"
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        opacity: 0.55,
        padding: '4px 10px',
        borderRadius: radius,
        border: `2px dashed ${accent}`,
        background: bg,
        color: theme.palette.text.secondary,
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: 'nowrap'
      }}
    >
      {labelText}
    </Box>
  );

  if (modeType === 'LABEL') return <SceneLayer disableAnimation>{chip('Label', 6, '#ffffff')}</SceneLayer>;
  if (modeType === 'TEXTBOX') return <SceneLayer disableAnimation>{chip('Text', 4, 'rgba(255,255,255,0.6)')}</SceneLayer>;

  if (modeType === 'RECTANGLE.DRAW') {
    // A faint shape ghost (no text) hinting the rectangle the drag will draw.
    return (
      <SceneLayer disableAnimation>
        <Box
          data-testid="placement-ghost"
          style={{
            position: 'absolute',
            left: pos.x,
            top: pos.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            opacity: 0.5,
            width: 56,
            height: 36,
            borderRadius: 4,
            border: `2px dashed ${accent}`,
            background: `${accent}22`
          }}
        />
      </SceneLayer>
    );
  }

  // CONNECTOR (armed): a faint start-point marker with a short arrow stub, so
  // it's clear the next click begins a connection here.
  return (
    <SceneLayer disableAnimation>
      <Box
        data-testid="placement-ghost"
        style={{
          position: 'absolute',
          left: pos.x,
          top: pos.y,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          opacity: 0.6
        }}
      >
        <svg width="52" height="24" viewBox="0 0 52 24" fill="none">
          <circle cx="8" cy="12" r="5" fill="none" stroke={accent} strokeWidth="2" strokeDasharray="3 2" />
          <line x1="13" y1="12" x2="40" y2="12" stroke={accent} strokeWidth="2" strokeDasharray="4 3" />
          <path d="M40 7 L48 12 L40 17 Z" fill={accent} />
        </svg>
      </Box>
    </SceneLayer>
  );
};

interface UiOverlayProps {
  toolbarPortalTarget?: HTMLElement | null;
  sidebarTogglePortalTarget?: HTMLElement | null;
  styleControlsPortalTarget?: HTMLElement | null;
  languageSelector?: React.ReactNode;
  suppressOnboardingHints?: boolean;
  /** @deprecated use toolbarPortalTarget */
  menuPortalTarget?: HTMLElement | null;
}

export const UiOverlay = ({
  toolbarPortalTarget,
  sidebarTogglePortalTarget,
  styleControlsPortalTarget,
  languageSelector,
  suppressOnboardingHints,
  menuPortalTarget
}: UiOverlayProps = {}) => {
  const portalTarget = toolbarPortalTarget ?? menuPortalTarget ?? null;
  const theme = useTheme();
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
    dialog,
    editorMode,
    iconPackManager,
    rightSidebarOpen
  } = useUiStateStore(
    (state) => ({
      uiStateActions: state.actions,
      enableDebugTools: state.enableDebugTools,
      dialog: state.dialog,
      editorMode: state.editorMode,
      iconPackManager: state.iconPackManager,
      rightSidebarOpen: state.rightSidebarOpen
    }),
    shallow
  );

  const { currentView } = useScene();
  // View-only "hide all controls" (set by the app toolbar toggle via a window
  // event) — hides the presentation chrome + annotation palette for a clean
  // screenshot.
  const hideViewControls = useUiStateStore((state) => state.hideViewControls);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ hide: boolean }>).detail;
      uiStateActions.setHideViewControls(!!detail?.hide);
    };
    window.addEventListener('axoview-set-hide-view-controls', handler);
    return () =>
      window.removeEventListener('axoview-set-hide-view-controls', handler);
  }, [uiStateActions]);
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
                <Typography variant="subtitle2" color="text.secondary">
                  {title}
                </Typography>
                <ChevronRight />
                <Typography variant="subtitle2" color="text.secondary">
                  {currentView.name}
                </Typography>
              </Stack>
            </UiElement>
          </Box>
        )}

        {/* ViewTabs (page selector) lives in the BottomDock now (it used to
            float centered above the canvas and blocked the view during
            screenshots/presentation). */}

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

        {/* Present-mode chrome — top-left (feels more natural in a presentation
            than bottom-left). View mode only. The layer switcher self-gates on
            ≥2 layers (ADR 0013). The canvas-mode toggle lets a viewer switch
            iso↔2D for their OWN view (canvasMode is uiState/localStorage, never
            document data). Hidden by the view-only "hide all controls" toggle.
            High zIndex so it stays above any left chrome that lingers in a
            forced-preview test environment. */}
        {editorMode === EditorModeEnum.EXPLORABLE_READONLY &&
          !hideViewControls && (
            <Stack
              spacing={1}
              alignItems="flex-start"
              sx={{ position: 'absolute', zIndex: 15 }}
              style={{ left: appPadding.x, top: appPadding.y }}
            >
              <PreviewLayerSwitcher />
              <PreviewCanvasModeToggle />
            </Stack>
          )}
      </Box>

      {/* Ephemeral annotation overlay (ADR 0014) — available in edit + preview,
          never in export-preview. The layer self-gates on annotation.open; the
          palette is a draggable floating control, hidden by the view-only
          "hide all controls" toggle. */}
      {editorMode !== EditorModeEnum.NON_INTERACTIVE && (
        <>
          {/* Permanent full-area overlay that keeps Chrome compositing the WebGL
              canvases when a sibling overlay toggles — see the component doc. */}
          <CanvasCompositorOverlay />
          <AnnotationLayer />
          {!hideViewControls && <AnnotationPalette />}
        </>
      )}

      {/* Portals — hoisted out of the positioning <Box> above because MUI's
          PropTypes.node check on Box's children rejects ReactPortal (its
          $$typeof is react.portal, not react.element). Portals render into
          their target node regardless of where they sit in the JSX tree. */}
      {/* Top-bar style controls strip — only in the full editor; the app gates
          the portal target to the editable toolbar branch, and we additionally
          gate on EDITABLE so readonly/snapshot surfaces never expose edit affordances. */}
      {styleControlsPortalTarget &&
        editorMode === EditorModeEnum.EDITABLE &&
        createPortal(<TopBarStyleControls />, styleControlsPortalTarget)}

      {(sidebarTogglePortalTarget ?? portalTarget) &&
        createPortal(
          <Tooltip title="Toggle Properties panel" placement="bottom">
            <IconButton
              size="small"
              onClick={() =>
                uiStateActions.setRightSidebarOpen(!rightSidebarOpen)
              }
              sx={{
                borderRadius: 1,
                color: 'inherit',
                bgcolor: rightSidebarOpen ? 'action.selected' : 'transparent'
              }}
            >
              <ViewSidebarOutlined sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>,
          (sidebarTogglePortalTarget ?? portalTarget)!
        )}

      <PlaceIconLayer />
      <PlacementGhostLayer />

      <ConnectorModeHint />
      <PlacementModeHint />

      {dialog === DialogTypeEnum.EXPORT_IMAGE && (
        <ExportImageDialog
          onClose={() => {
            return uiStateActions.setDialog(null);
          }}
        />
      )}

      {dialog === DialogTypeEnum.HELP && <HelpDialog />}

      {dialog === DialogTypeEnum.SETTINGS && (
        <SettingsDialog
          iconPackManager={iconPackManager || undefined}
          languageSelector={languageSelector}
        />
      )}

      {/* Welcome notification — suppressed when a diagram is open */}
      {iconPackManager && !suppressOnboardingHints && <LazyLoadingWelcomeNotification />}

      <NotificationSnackbar />

      {/* Canvas context menu (ADR 0027) — portals to the document root, so it
          lives outside the SceneLayer. Edit mode only; self-gates on the
          contextMenu store slice. */}
      {editorMode === EditorModeEnum.EDITABLE && <CanvasContextMenu />}

      {/* View-mode item info popover — screen-space, side-anchored read surface
          that replaces the right dock in EXPLORABLE_READONLY (ADR 0012). Lives
          outside the SceneLayer: it positions itself in screen px (so it can
          flip/clamp against the viewport) and tracks the item via a store
          subscription. */}
      {editorMode === EditorModeEnum.EXPLORABLE_READONLY && (
        <ViewModeInfoPopover />
      )}
    </>
  );
};
