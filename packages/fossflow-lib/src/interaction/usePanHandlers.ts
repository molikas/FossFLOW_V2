import { useCallback, useRef } from 'react';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { getItemAtTile, setWindowCursor } from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { SlimMouseEvent } from 'src/types';

// Pixels the mouse must travel while right-button held before pan activates.
// Below this threshold a right-press+release is treated as a deselect click.
const RIGHT_DRAG_THRESHOLD = 4;

export const usePanHandlers = () => {
  const modeType = useUiStateStore((state) => state.mode.type);
  const actions = useUiStateStore((state) => state.actions);
  const panSettings = useUiStateStore((state) => state.panSettings);
  const rendererEl = useUiStateStore((state) => state.rendererEl);
  const uiStateApi = useUiStateStoreApi();
  const scene = useScene();

  const isPanningRef = useRef(false);
  const panMethodRef = useRef<string | null>(null);

  // Stores the mode type active when right-button went down so we can restore it.
  const previousModeTypeRef = useRef<string | null>(null);

  // Right-click deferred pan: don't enter PAN immediately — wait for drag threshold.
  const rightDownRef = useRef(false);
  const rightDownPositionRef = useRef<{ x: number; y: number } | null>(null);

  // Reconstruct a clean (non-mid-action) mode from a type string for restoration.
  const restorePreviousMode = useCallback(() => {
    const prevType = previousModeTypeRef.current;
    previousModeTypeRef.current = null;
    switch (prevType) {
      case 'CONNECTOR':
        actions.setMode({ type: 'CONNECTOR', id: null, showCursor: true });
        break;
      case 'LASSO':
        actions.setMode({ type: 'LASSO', showCursor: true, selection: null, isDragging: false });
        break;
      case 'FREEHAND_LASSO':
        actions.setMode({ type: 'FREEHAND_LASSO', showCursor: true, path: [], selection: null, isDragging: false });
        break;
      case 'RECTANGLE.DRAW':
        actions.setMode({ type: 'RECTANGLE.DRAW', showCursor: true, id: null });
        break;
      case 'PLACE_ICON':
        actions.setMode({ type: 'PLACE_ICON', showCursor: true, id: null });
        break;
      default:
        actions.setMode({ type: 'CURSOR', showCursor: true, mousedownItem: null });
    }
  }, [actions]);

  const startPan = useCallback((method: string) => {
    if (modeType !== 'PAN') {
      isPanningRef.current = true;
      panMethodRef.current = method;
      actions.setMode({
        type: 'PAN',
        showCursor: false
      });
    }
  }, [modeType, actions]);

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
        restorePreviousMode();
      } else {
        actions.setMode({
          type: 'CURSOR',
          showCursor: true,
          mousedownItem: null
        });
      }
    }
  }, [actions, restorePreviousMode, uiStateApi]);

  const isEmptyArea = useCallback((e: SlimMouseEvent): boolean => {
    if (!rendererEl || e.target !== rendererEl) return false;

    const itemAtTile = getItemAtTile({
      tile: uiStateApi.getState().mouse.position.tile,
      scene
    });

    return !itemAtTile;
  }, [rendererEl, uiStateApi, scene]);

  const handleMouseDown = useCallback((e: SlimMouseEvent): boolean => {
    // Left-click while in pan mode (keyboard-activated) exits to cursor
    if (e.button === 0 && modeType === 'PAN') {
      endPan();
      return true;
    }

    if (e.button === 1 && panSettings.middleClickPan) {
      e.preventDefault();
      startPan('middle');
      return true;
    }

    if (e.button === 2) {
      e.preventDefault();
      if (panSettings.rightClickPan) {
        // Don't enter PAN immediately — defer until drag threshold is exceeded.
        // On release without drag this becomes a deselect click.
        rightDownRef.current = true;
        rightDownPositionRef.current = { x: e.clientX, y: e.clientY };
        previousModeTypeRef.current = modeType;
      }
      // Always consume right mousedown regardless of setting — prevents right-click
      // reaching Cursor.mousedown which would trigger the add-node context menu.
      return true;
    }

    if (e.button === 0) {
      if (panSettings.ctrlClickPan && e.ctrlKey) {
        e.preventDefault();
        startPan('ctrl');
        return true;
      }

      if (panSettings.altClickPan && e.altKey) {
        e.preventDefault();
        startPan('alt');
        return true;
      }

      if (panSettings.emptyAreaClickPan && isEmptyArea(e)) {
        startPan('empty');
        return true;
      }
    }

    return false;
  }, [modeType, panSettings, startPan, endPan, isEmptyArea]);

  // Called on every mousemove. Returns true to suppress processMouseUpdate while right
  // button is held (prevents Cursor.mousemove from triggering lasso on right-drag).
  // Once the drag threshold is exceeded, starts pan and returns false so Pan.mousemove
  // can handle scrolling via the normal processMouseUpdate path.
  const handleMouseMove = useCallback((e: SlimMouseEvent): boolean => {
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
  }, [startPan]);

  const handleMouseUp = useCallback((e: SlimMouseEvent): boolean => {
    if (e.button === 2) {
      const wasDragging = isPanningRef.current && panMethodRef.current === 'right';

      rightDownRef.current = false;
      rightDownPositionRef.current = null;

      if (wasDragging) {
        endPan();
        return true;
      }

      // Right-click without drag: deselect — close item controls and clear any lasso selection.
      // Exception: if there is an item under the cursor, let the contextmenu event handle it
      // (the item context menu will open) rather than deselecting.
      if (previousModeTypeRef.current !== null) {
        const uiState = uiStateApi.getState();
        const tile = uiState.mouse.position.tile;
        const itemUnderCursor = getItemAtTile({ tile, scene });
        if (itemUnderCursor) {
          // Don't deselect — contextmenu event will show the item context menu
          previousModeTypeRef.current = null;
          return true;
        }
        // Close context menu if open
        if (uiState.contextMenu !== null) {
          uiState.actions.setContextMenu(null);
        }
        uiState.actions.setItemControls(null);
        // Clear stale mousedown state so Cursor mode doesn't pick it up next frame
        uiState.actions.setMouse({ ...uiState.mouse, mousedown: null });
        if (uiState.mode.type === 'LASSO') {
          actions.setMode({ type: 'LASSO', showCursor: true, selection: null, isDragging: false });
        } else if (uiState.mode.type === 'FREEHAND_LASSO') {
          actions.setMode({ type: 'FREEHAND_LASSO', showCursor: true, path: [], selection: null, isDragging: false });
        } else if (uiState.mode.type === 'CONNECTOR') {
          actions.setMode({ type: 'CURSOR', showCursor: true, mousedownItem: null });
        }
        previousModeTypeRef.current = null;
        return true;
      }

      // Always consume right mouseup — prevents Cursor.mouseup from firing which
      // would open the add-node context menu on a right-click with rightClickPan off.
      return true;
    }

    if (!isPanningRef.current) return false;
    endPan();
    return true;
  }, [endPan, uiStateApi, actions]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    isPanning: isPanningRef.current
  };
};
