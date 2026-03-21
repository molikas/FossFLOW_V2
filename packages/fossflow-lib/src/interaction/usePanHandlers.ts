import { useCallback, useRef } from 'react';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { getItemAtTile, setWindowCursor } from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { SlimMouseEvent } from 'src/types';

export const usePanHandlers = () => {
  const modeType = useUiStateStore((state) => state.mode.type);
  const actions = useUiStateStore((state) => state.actions);
  const panSettings = useUiStateStore((state) => state.panSettings);
  const rendererEl = useUiStateStore((state) => state.rendererEl);
  const mouseTile = useUiStateStore((state) => state.mouse.position.tile);
  const scene = useScene();
  const isPanningRef = useRef(false);
  const panMethodRef = useRef<string | null>(null);

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
      panMethodRef.current = null;
      setWindowCursor('default');
      actions.setMode({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      });
    }
  }, [actions]);

  const isEmptyArea = useCallback((e: SlimMouseEvent): boolean => {
    if (!rendererEl || e.target !== rendererEl) return false;

    const itemAtTile = getItemAtTile({
      tile: mouseTile,
      scene
    });

    return !itemAtTile;
  }, [rendererEl, mouseTile, scene]);

  const handleMouseDown = useCallback((e: SlimMouseEvent): boolean => {
    // Left-click while in pan mode exits back to select/cursor mode
    if (e.button === 0 && modeType === 'PAN') {
      endPan();
      return true;
    }

    if (e.button === 1 && panSettings.middleClickPan) {
      e.preventDefault();
      startPan('middle');
      return true;
    }

    if (e.button === 2 && panSettings.rightClickPan) {
      e.preventDefault();
      startPan('right');
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

  const handleMouseUp = useCallback((e: SlimMouseEvent): boolean => {
    if (!isPanningRef.current) return false;

    // Right-click pan is a toggle — stay in pan mode when right button is released
    if (panMethodRef.current === 'right' && e.button === 2) {
      return false;
    }

    endPan();
    return true;
  }, [endPan]);

  return {
    handleMouseDown,
    handleMouseUp,
    isPanning: isPanningRef.current
  };
};
