import { useCallback, useRef } from 'react';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { getItemAtTile, setWindowCursor } from 'src/utils';
import { cursorCanvasPoint } from 'src/utils/coordinateTransforms';
import { useScene } from 'src/hooks/useScene';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { SlimMouseEvent } from 'src/types';

// Pixels the mouse must travel while right-button held before pan activates.
// Below this threshold a right-press+release is treated as a deselect click.
const RIGHT_DRAG_THRESHOLD = 4;

export const usePanHandlers = () => {
  const modeType = useUiStateStore((state) => state.mode.type);
  const actions = useUiStateStore((state) => state.actions);
  const rendererEl = useUiStateStore((state) => state.rendererEl);
  const uiStateApi = useUiStateStoreApi();
  const scene = useScene();
  const layerContext = useLayerContext();

  // Stable scene callbacks (useScene() returns a fresh wrapper object each
  // render, but these members come from useSceneActions useCallbacks and keep a
  // stable identity). Used to abort an in-flight connector on right-click so the
  // drag transaction it opened doesn't leak (D-4).
  const { deleteConnector, commitDragTransaction } = scene;

  const isPanningRef = useRef(false);
  const panMethodRef = useRef<string | null>(null);

  // Stores the mode type active when right-button went down so we can restore it.
  const previousModeTypeRef = useRef<string | null>(null);

  // Right-click deferred pan: don't enter PAN immediately — wait for drag threshold.
  const rightDownRef = useRef(false);
  const rightDownPositionRef = useRef<{ x: number; y: number } | null>(null);

  // D-4 abort-symmetry: aborting out of CONNECTOR while a connection is in
  // flight must delete the provisional connector AND close the drag transaction
  // opened by Connector.handleClickFirst/handleDragStart. A leaked open bracket
  // suppresses saveToHistoryBeforeChange for every later edit (behavior-map
  // §3.1/§4.5). commitDragTransaction is a no-op when no drag is open, so it is
  // safe to call on every right-click restore.
  const abortInFlightConnector = useCallback(() => {
    const uiState = uiStateApi.getState();
    if (uiState.mode.type === 'CONNECTOR' && uiState.mode.id) {
      deleteConnector(uiState.mode.id);
    }
    commitDragTransaction();
  }, [uiStateApi, deleteConnector, commitDragTransaction]);

  // Reconstruct a clean (non-mid-action) mode from a type string for restoration.
  //
  // I5/CTX-03: this used to reconstruct five hardcoded types and drop every
  // other armed tool to CURSOR — so a right-drag pan while TEXTBOX or LABEL was
  // armed silently disarmed it, and the user's next canvas click did nothing
  // they expected. The five that WERE listed worked, which is exactly why the
  // gap was invisible: `usePanHandlers.test.ts` covered CURSOR and CONNECTOR.
  //
  // Every PERSISTENT tool mode belongs here — the same set `handleEscapeKey`
  // returns to Select from, for the same reason (they are the modes a user
  // deliberately arms and expects to still be armed). Transient interaction
  // modes (DRAG_ITEMS, the transforms, RECONNECT_ANCHOR) are NOT restorable:
  // they describe a gesture that the pan interrupted, so CURSOR is right for
  // them, and the `default` branch is where they land.
  const restorePreviousMode = useCallback(() => {
    const prevType = previousModeTypeRef.current;
    previousModeTypeRef.current = null;
    switch (prevType) {
      case 'CONNECTOR':
        abortInFlightConnector();
        actions.setMode({ type: 'CONNECTOR', id: null, showCursor: true });
        break;
      case 'LASSO':
        actions.setMode({
          type: 'LASSO',
          showCursor: true,
          selection: null,
          isDragging: false
        });
        break;
      case 'FREEHAND_LASSO':
        actions.setMode({
          type: 'FREEHAND_LASSO',
          showCursor: true,
          path: [],
          selection: null,
          isDragging: false
        });
        break;
      case 'RECTANGLE.DRAW':
        actions.setMode({ type: 'RECTANGLE.DRAW', showCursor: true, id: null });
        break;
      case 'PLACE_ICON':
        actions.setMode({ type: 'PLACE_ICON', showCursor: true, id: null });
        break;
      case 'TEXTBOX':
        actions.setMode({ type: 'TEXTBOX', showCursor: true, id: null });
        break;
      case 'LABEL':
        actions.setMode({ type: 'LABEL', showCursor: true, id: null });
        break;
      default:
        actions.setMode({
          type: 'CURSOR',
          showCursor: true,
          mousedownItem: null
        });
    }
  }, [actions, abortInFlightConnector]);

  const startPan = useCallback(
    (method: string) => {
      if (modeType !== 'PAN') {
        isPanningRef.current = true;
        panMethodRef.current = method;
        actions.setMode({
          type: 'PAN',
          showCursor: false
        });
      }
    },
    [modeType, actions]
  );

  const endPan = useCallback(() => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      setWindowCursor('default');
      const wasRightClick = panMethodRef.current === 'right';
      panMethodRef.current = null;
      rightDownRef.current = false;
      rightDownPositionRef.current = null;

      if (wasRightClick) {
        // Clear stale mousedown so Cursor.mousemove can't trigger lasso on the
        // first move after the right-drag pan ends (Cursor.mouseup never fires
        // to clear it because the right mouseup is consumed by handleMouseUp).
        const uiState = uiStateApi.getState();
        uiState.actions.setMouse({ ...uiState.mouse, mousedown: null });
      }
      // I5/CTX-04: the middle-drag branch used to hardcode CURSOR and never
      // call `restorePreviousMode` at all — so a middle-drag pan dropped even
      // the tools the right-drag path restores correctly. There is no reason
      // for the two pan gestures to differ about what the pan INTERRUPTED; the
      // only real difference is the stale-mousedown cleanup above, which is a
      // consequence of the right mouseup being consumed.
      restorePreviousMode();
    }
  }, [restorePreviousMode, uiStateApi]);

  // Fixed pan model (ADR 0022 §6): middle-click and right-click drag both pan,
  // always — no settings. The ctrl/alt/empty-area click-pan options were removed
  // (they conflicted with Ctrl+click multi-select, Alt+click waypoint removal,
  // and empty-area lasso/clear).
  const handleMouseDown = useCallback(
    (e: SlimMouseEvent): boolean => {
      // Left-click while in pan mode (keyboard-activated) exits to cursor
      if (e.button === 0 && modeType === 'PAN') {
        endPan();
        return true;
      }

      if (e.button === 1) {
        e.preventDefault();
        // CTX-04: capture the armed tool BEFORE `startPan` overwrites the mode,
        // so `endPan` can put it back. The right-button branch below has always
        // done this; the middle one never did, which is why it dropped even the
        // tools the right-drag path restored.
        previousModeTypeRef.current = modeType;
        startPan('middle');
        return true;
      }

      if (e.button === 2) {
        // The right-DRAG-pan / right-TAP-menu gestures (ADR 0022 §1, ADR 0027)
        // are CANVAS affordances, but the listener is window-bound (so an
        // off-canvas drag still flows). Only arm them when the press lands on
        // the renderer — a right-click on a portaled overlay (the export
        // Dialog, any MUI Popover/Menu) or the toolbar/panels must keep its
        // native menu and never open the canvas context menu.
        const target = e.target as Node | null;
        const onRenderer =
          !!rendererEl &&
          !!target &&
          (rendererEl === target || rendererEl.contains(target));
        if (!onRenderer) return false;

        e.preventDefault();
        // Don't enter PAN immediately — defer until the drag threshold is
        // exceeded. On release without drag this becomes a context-menu tap
        // (ADR 0027) handled by handleRightButtonUp.
        rightDownRef.current = true;
        rightDownPositionRef.current = { x: e.clientX, y: e.clientY };
        previousModeTypeRef.current = modeType;
        // Always consume right mousedown — prevents it reaching Cursor.mousedown.
        return true;
      }

      return false;
    },
    [modeType, startPan, endPan, rendererEl]
  );

  // Called on every mousemove. Returns true to suppress processMouseUpdate while right
  // button is held (prevents Cursor.mousemove from triggering lasso on right-drag).
  // Once the drag threshold is exceeded, starts pan and returns false so Pan.mousemove
  // can handle scrolling via the normal processMouseUpdate path.
  const handleMouseMove = useCallback(
    (e: SlimMouseEvent): boolean => {
      if (!rightDownRef.current) return false;

      // Already panning — let processMouseUpdate handle scrolling via Pan.mousemove
      if (isPanningRef.current) return false;

      if (rightDownPositionRef.current) {
        const dx = Math.abs(e.clientX - rightDownPositionRef.current.x);
        const dy = Math.abs(e.clientY - rightDownPositionRef.current.y);
        if (dx > RIGHT_DRAG_THRESHOLD || dy > RIGHT_DRAG_THRESHOLD) {
          startPan('right');
          return false; // Pan mode now active — let processMouseUpdate run
        }
      }

      // Right is down but below threshold — suppress processMouseUpdate so
      // Cursor.mousemove can't trigger lasso from the stale mouse.mousedown state.
      return true;
    },
    [startPan]
  );

  // After a right-click deselect, reset the active selection-tool mode to its
  // clean state (lasso/freehand cleared; connector falls back to cursor).
  const restoreModeAfterRightClick = useCallback(
    (currentModeType: string) => {
      if (currentModeType === 'LASSO') {
        actions.setMode({
          type: 'LASSO',
          showCursor: true,
          selection: null,
          isDragging: false
        });
      } else if (currentModeType === 'FREEHAND_LASSO') {
        actions.setMode({
          type: 'FREEHAND_LASSO',
          showCursor: true,
          path: [],
          selection: null,
          isDragging: false
        });
      } else if (currentModeType === 'CONNECTOR') {
        abortInFlightConnector();
        actions.setMode({
          type: 'CURSOR',
          showCursor: true,
          mousedownItem: null
        });
      } else if (
        currentModeType === 'TEXTBOX' ||
        currentModeType === 'LABEL' ||
        currentModeType === 'RECTANGLE.DRAW' ||
        currentModeType === 'PLACE_ICON'
      ) {
        // Armed placement (text / label / rectangle / node icon): right-click
        // cancels the tool entirely (drop nothing, return to select) rather than
        // re-arming — parity across every placement tool, matching CONNECTOR.
        actions.setMode({
          type: 'CURSOR',
          showCursor: true,
          mousedownItem: null
        });
      }
    },
    [actions, abortInFlightConnector]
  );

  const handleRightButtonUp = useCallback(
    (e: SlimMouseEvent): boolean => {
      const wasDragging =
        isPanningRef.current && panMethodRef.current === 'right';

      rightDownRef.current = false;
      rightDownPositionRef.current = null;

      // Right-DRAG past threshold = pan (ADR 0022 §1) — never a menu.
      if (wasDragging) {
        endPan();
        return true;
      }

      // Right-TAP below threshold (ADR 0027 §2). previousModeTypeRef was seeded
      // on right-down only when right-click-pan was armed; null means a stray
      // right mouseup we still consume to keep it off Cursor.mouseup.
      if (previousModeTypeRef.current === null) return true;
      previousModeTypeRef.current = null;

      const uiState = uiStateApi.getState();
      const currentModeType = uiState.mode.type;
      const anchor = { x: e.clientX, y: e.clientY };
      const tile = uiState.mouse.position.tile;
      // #5: right-click SELECTS the target for its context menu, so use exact
      // connector tiles — a right-click on an empty tile beside a connector must
      // open the canvas menu, not grab the connector (matches the left-click fix).
      // ADR 0023: pass the cursor point + mode so an off-grid item is hit where
      // it's DRAWN — otherwise right-clicking a moved-off-grid node/text opens the
      // CANVAS menu (raw-tile miss) instead of the element's menu.
      const point = cursorCanvasPoint(uiState, uiState.mouse.position.screen);
      const item = getItemAtTile({
        tile,
        scene,
        canvasMode: uiState.canvasMode,
        point,
        connectorMatch: 'exact'
      });
      const { lockedIds, visibleIds, layers } = layerContext;
      const itemInteractable =
        !!item &&
        !lockedIds.has(item.id) &&
        (layers.length === 0 || visibleIds.has(item.id));

      // Multi-selection takes precedence (ADR 0027). A right-tap on an item that
      // is part of the current multi-selection opens the BULK menu over the
      // whole selection. The selection may live in `selectedIds` (Ctrl+click /
      // Ctrl+A / a canvas lasso, mirrored on mouseup) OR in an active lasso's
      // `mode.selection` (panel-driven multi-select, which doesn't populate
      // selectedIds). Either qualifies.
      const selectedIds = uiState.selectedIds;
      const mode = uiState.mode;
      const lassoItems =
        (mode.type === 'LASSO' || mode.type === 'FREEHAND_LASSO') &&
        mode.selection
          ? mode.selection.items
          : [];
      const multiRefs = selectedIds.length > 1 ? selectedIds : lassoItems;
      const itemInMulti =
        itemInteractable &&
        multiRefs.length > 1 &&
        multiRefs.some((r) => r.type === item!.type && r.id === item!.id);
      if (itemInMulti) {
        // Make selectedIds the single source of truth the bulk menu reads
        // (a panel lasso only set mode.selection), then settle to CURSOR so the
        // lasso stops capturing — the multi-select outlines render from
        // selectedIds, so they persist.
        if (selectedIds.length <= 1) {
          uiState.actions.setSelectedIds(multiRefs);
        }
        if (currentModeType !== 'CURSOR') {
          uiState.actions.setMode({
            type: 'CURSOR',
            showCursor: true,
            mousedownItem: null
          });
        }
        uiState.actions.setMouse({ ...uiState.mouse, mousedown: null });
        uiState.actions.openContextMenu({ anchor, variant: 'multi', target: null });
        return true;
      }

      // In a tool mode (lasso / freehand / connector …) a right-tap with no
      // multi-selection hit ABORTS the in-flight tool action — the long-standing
      // "right-click cancels the tool" behavior. The single/canvas menus are a
      // CURSOR-mode affordance, so they do not open here.
      if (currentModeType !== 'CURSOR') {
        uiState.actions.setItemControls(null);
        uiState.actions.setMouse({ ...uiState.mouse, mousedown: null });
        restoreModeAfterRightClick(currentModeType);
        return true;
      }

      // CURSOR mode: an interactable item → item menu (select it first so the
      // clipboard / delete commands act on it); empty / locked / hidden →
      // canvas menu (UX §4.3).
      uiState.actions.setMouse({ ...uiState.mouse, mousedown: null });
      if (item && itemInteractable) {
        uiState.actions.setSelectedIds([{ type: item.type, id: item.id }]);
        uiState.actions.openContextMenu({
          anchor,
          variant: 'item',
          target: { type: item.type, id: item.id },
          // Where the user clicked — connector "Add label" drops the label here.
          tile: uiState.mouse.position.tile
        });
      } else {
        uiState.actions.openContextMenu({ anchor, variant: 'canvas', target: null });
      }
      return true;
    },
    [endPan, uiStateApi, scene, layerContext, restoreModeAfterRightClick]
  );

  const handleMouseUp = useCallback(
    (e: SlimMouseEvent): boolean => {
      if (e.button === 2) {
        return handleRightButtonUp(e);
      }

      if (!isPanningRef.current) return false;
      endPan();
      return true;
    },
    [endPan, handleRightButtonUp]
  );

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    isPanning: isPanningRef.current
  };
};
