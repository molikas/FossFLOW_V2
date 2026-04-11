import { useCallback, useEffect, useRef } from 'react';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { ModeActions, State, SlimMouseEvent, Mouse } from 'src/types';
import { DialogTypeEnum } from 'src/types/ui';
import {
  getMouse,
  getItemAtTile,
  generateId,
  incrementZoom,
  decrementZoom,
  CoordsUtils
} from 'src/utils';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { useScene } from 'src/hooks/useScene';
import { useHistory } from 'src/hooks/useHistory';
import { HOTKEY_PROFILES } from 'src/config/hotkeys';
import { TEXTBOX_DEFAULTS } from 'src/config';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { Cursor } from './modes/Cursor';
import { DragItems } from './modes/DragItems';
import { DrawRectangle } from './modes/Rectangle/DrawRectangle';
import { TransformRectangle } from './modes/Rectangle/TransformRectangle';
import { Connector } from './modes/Connector';
import { Pan } from './modes/Pan';
import { PlaceIcon } from './modes/PlaceIcon';
import { TextBox } from './modes/TextBox';
import { Lasso } from './modes/Lasso';
import { FreehandLasso } from './modes/FreehandLasso';
import { ReconnectAnchor } from './modes/ReconnectAnchor';
import { usePanHandlers } from './usePanHandlers';
import { useRAFThrottle } from './useRAFThrottle';
import { useCopyPaste } from 'src/clipboard/useCopyPaste';

const modes: { [k in string]: ModeActions } = {
  CURSOR: Cursor,
  DRAG_ITEMS: DragItems,
  'RECTANGLE.DRAW': DrawRectangle,
  'RECTANGLE.TRANSFORM': TransformRectangle,
  CONNECTOR: Connector,
  PAN: Pan,
  PLACE_ICON: PlaceIcon,
  TEXTBOX: TextBox,
  LASSO: Lasso,
  FREEHAND_LASSO: FreehandLasso,
  RECONNECT_ANCHOR: ReconnectAnchor
};

const getModeFunction = (mode: ModeActions, e: SlimMouseEvent) => {
  switch (e.type) {
    case 'mousemove':
      return mode.mousemove;
    case 'mousedown':
      return mode.mousedown;
    case 'mouseup':
      return mode.mouseup;
    default:
      return null;
  }
};

export const useInteractionManager = () => {
  const rendererRef = useRef<HTMLElement | undefined>(undefined);
  const reducerTypeRef = useRef<string | undefined>(undefined);

  const modeType = useUiStateStore((state) => state.mode.type);
  const rendererEl = useUiStateStore((state) => state.rendererEl);
  const editorMode = useUiStateStore((state) => state.editorMode);

  const uiStateApi = useUiStateStoreApi();
  const modelStoreApi = useModelStoreApi();
  const scene = useScene();
  const layerContext = useLayerContext();
  // Single ResizeObserver for rendererEl — result is stored in the Zustand store
  // so UiOverlay and useDiagramUtils can read it without creating their own observers.
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const { undo, redo, canUndo, canRedo } = useHistory();
  const { handleCopy, handleCut, handlePaste } = useCopyPaste();
  const {
    createTextBox,
    deleteSelectedItems,
    deleteViewItem,
    deleteConnector,
    deleteTextBox,
    deleteRectangle,
    updateViewItem
  } = scene;
  const {
    handleMouseDown: handlePanMouseDown,
    handleMouseMove: handlePanMouseMove,
    handleMouseUp: handlePanMouseUp
  } = usePanHandlers();
  const { scheduleUpdate, flushUpdate, cleanup } = useRAFThrottle();

  // Sync the single rendererEl measurement into the store so UiOverlay and
  // useDiagramUtils can read rendererSize without creating their own observers.
  useEffect(() => {
    uiStateApi.getState().actions.setRendererSize(rendererSize);
  }, [rendererSize, uiStateApi]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const uiState = uiStateApi.getState();

      if (e.key === 'Escape') {
        e.preventDefault();

        if (uiState.itemControls) {
          uiState.actions.setItemControls(null);
          return;
        }

        if (uiState.mode.type === 'CONNECTOR') {
          const connectorMode = uiState.mode;

          const isConnectionInProgress =
            (uiState.connectorInteractionMode === 'click' &&
              connectorMode.isConnecting) ||
            (uiState.connectorInteractionMode === 'drag' &&
              connectorMode.id !== null);

          if (isConnectionInProgress && connectorMode.id) {
            deleteConnector(connectorMode.id);

            uiState.actions.setMode({
              type: 'CONNECTOR',
              showCursor: true,
              id: null,
              startAnchor: undefined,
              isConnecting: false
            });
          }
        }

        return;
      }

      // Delete/Backspace — handled before the text-field guard so it always fires
      // when a canvas selection exists (matches how diagram tools like Figma behave).
      const isDeleteKey = e.key === 'Delete' || e.key === 'Backspace';
      if (isDeleteKey) {
        const mode = uiState.mode;

        if (
          (mode.type === 'LASSO' || mode.type === 'FREEHAND_LASSO') &&
          mode.selection?.items?.length
        ) {
          e.preventDefault();
          deleteSelectedItems(mode.selection.items);
          uiState.actions.setMode({
            type: 'CURSOR',
            showCursor: true,
            mousedownItem: null
          });
          uiState.actions.setItemControls(null);
          return;
        }

        if (uiState.itemControls && uiState.itemControls.type !== 'ADD_ITEM') {
          // Only fire if focus is NOT inside a text-editing element so that
          // editing text in the properties panel still works normally.
          const target = e.target as HTMLElement;
          const inTextField =
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.contentEditable === 'true' ||
            !!target.closest('.ql-editor');

          if (!inTextField) {
            e.preventDefault();
            const ctrl = uiState.itemControls;
            if (ctrl.type === 'ITEM') {
              deleteViewItem(ctrl.id);
            } else if (ctrl.type === 'CONNECTOR') {
              deleteConnector(ctrl.id);
            } else if (ctrl.type === 'TEXTBOX') {
              deleteTextBox(ctrl.id);
            } else if (ctrl.type === 'RECTANGLE') {
              deleteRectangle(ctrl.id);
            }
            uiState.actions.setItemControls(null);
            return;
          }
        }
      }

      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.closest('.ql-editor')
      ) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) {
          undo();
        }
      }

      if (
        isCtrlOrCmd &&
        (e.key.toLowerCase() === 'y' ||
          (e.key.toLowerCase() === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        if (canRedo) {
          redo();
        }
      }

      if (isCtrlOrCmd && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        handleCut();
      }

      if (isCtrlOrCmd && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopy();
      }

      if (isCtrlOrCmd && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePaste();
      }

      if (e.key === 'F1') {
        e.preventDefault();
        uiState.actions.setDialog(DialogTypeEnum.HELP);
      }

      const hotkeyMapping = HOTKEY_PROFILES[uiState.hotkeyProfile];
      const key = e.key.toLowerCase();

      if (
        key === 'i' &&
        uiState.itemControls &&
        'id' in uiState.itemControls &&
        uiState.itemControls.type === 'ITEM'
      ) {
        e.preventDefault();
        const event = new CustomEvent('quickIconChange');
        window.dispatchEvent(event);
      }

      if (hotkeyMapping.select && key === hotkeyMapping.select) {
        e.preventDefault();
        uiState.actions.setMode({
          type: 'CURSOR',
          showCursor: true,
          mousedownItem: null
        });
      } else if (hotkeyMapping.pan && key === hotkeyMapping.pan) {
        e.preventDefault();
        uiState.actions.setMode({
          type: 'PAN',
          showCursor: false
        });
        uiState.actions.setItemControls(null);
      } else if (hotkeyMapping.addItem && key === hotkeyMapping.addItem) {
        e.preventDefault();
        // Open Elements tab in the left dock
        uiState.actions.setActiveLeftTab('ELEMENTS');
      } else if (hotkeyMapping.rectangle && key === hotkeyMapping.rectangle) {
        e.preventDefault();
        uiState.actions.setMode({
          type: 'RECTANGLE.DRAW',
          showCursor: true,
          id: null
        });
      } else if (hotkeyMapping.connector && key === hotkeyMapping.connector) {
        e.preventDefault();
        uiState.actions.setMode({
          type: 'CONNECTOR',
          id: null,
          showCursor: true
        });
      } else if (hotkeyMapping.text && key === hotkeyMapping.text) {
        e.preventDefault();
        const textBoxId = generateId();
        createTextBox({
          ...TEXTBOX_DEFAULTS,
          id: textBoxId,
          tile: uiState.mouse.position.tile
        });
        uiState.actions.setMode({
          type: 'TEXTBOX',
          showCursor: false,
          id: textBoxId
        });
      } else if (hotkeyMapping.lasso && key === hotkeyMapping.lasso) {
        e.preventDefault();
        uiState.actions.setMode({
          type: 'LASSO',
          showCursor: true,
          selection: null,
          isDragging: false
        });
      } else if (
        hotkeyMapping.freehandLasso &&
        key === hotkeyMapping.freehandLasso
      ) {
        e.preventDefault();
        uiState.actions.setMode({
          type: 'FREEHAND_LASSO',
          showCursor: true,
          path: [],
          selection: null,
          isDragging: false
        });
      }

      // Z-order: Ctrl+] bring forward, Ctrl+[ send backward (Tier-1 layer feature)
      if (isCtrlOrCmd && (e.key === ']' || e.key === '[')) {
        const ctrl = uiState.itemControls;
        if (ctrl?.type === 'ITEM') {
          e.preventDefault();
          const modelState = modelStoreApi.getState();
          const currentView = uiState.view
            ? modelState.views.find(
                (v: { id: string }) => v.id === uiState.view
              )
            : undefined;
          const viewItem = currentView?.items?.find(
            (i: { id: string }) => i.id === ctrl.id
          );
          if (viewItem) {
            const currentZ = (viewItem as any).zIndex ?? 0;
            const delta = e.key === ']' ? 1 : -1;
            updateViewItem(ctrl.id, { zIndex: currentZ + delta });
          }
        }
      }

      // Keyboard pan (arrow / wasd / ijkl) — consolidated here from usePanHandlers
      const panSettings = uiState.panSettings;
      const panSpeed = panSettings.keyboardPanSpeed;
      let panDx = 0;
      let panDy = 0;

      if (panSettings.arrowKeysPan) {
        if (e.key === 'ArrowUp') {
          panDy = panSpeed;
          e.preventDefault();
        } else if (e.key === 'ArrowDown') {
          panDy = -panSpeed;
          e.preventDefault();
        } else if (e.key === 'ArrowLeft') {
          panDx = panSpeed;
          e.preventDefault();
        } else if (e.key === 'ArrowRight') {
          panDx = -panSpeed;
          e.preventDefault();
        }
      }

      if (panSettings.wasdPan) {
        if (key === 'w') {
          panDy = panSpeed;
          e.preventDefault();
        } else if (key === 's') {
          panDy = -panSpeed;
          e.preventDefault();
        } else if (key === 'a') {
          panDx = panSpeed;
          e.preventDefault();
        } else if (key === 'd') {
          panDx = -panSpeed;
          e.preventDefault();
        }
      }

      if (panSettings.ijklPan) {
        if (key === 'i') {
          panDy = panSpeed;
          e.preventDefault();
        } else if (key === 'k') {
          panDy = -panSpeed;
          e.preventDefault();
        } else if (key === 'j') {
          panDx = panSpeed;
          e.preventDefault();
        } else if (key === 'l') {
          panDx = -panSpeed;
          e.preventDefault();
        }
      }

      if (panDx !== 0 || panDy !== 0) {
        const currentScroll = uiState.scroll;
        uiState.actions.setScroll({
          position: CoordsUtils.add(currentScroll.position, {
            x: panDx,
            y: panDy
          }),
          offset: currentScroll.offset
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      return window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    undo,
    redo,
    canUndo,
    canRedo,
    uiStateApi,
    modelStoreApi,
    createTextBox,
    deleteSelectedItems,
    deleteViewItem,
    deleteConnector,
    deleteTextBox,
    deleteRectangle,
    handleCopy,
    handleCut,
    handlePaste,
    updateViewItem
  ]);

  const processMouseUpdate = useCallback(
    (nextMouse: Mouse, e: SlimMouseEvent) => {
      if (!rendererRef.current) return;

      const uiState = uiStateApi.getState();
      const model = modelStoreApi.getState();

      const mode = modes[uiState.mode.type];
      const modeFunction = getModeFunction(mode, e);

      if (!modeFunction) return;

      uiState.actions.setMouse(nextMouse);

      const { lockedIds } = layerContext;
      const baseState: State = {
        model,
        scene,
        uiState,
        rendererRef: rendererRef.current,
        rendererSize,
        isRendererInteraction: rendererRef.current === e.target,
        isItemInteractable: (ref) => !lockedIds.has(ref.id)
      };

      if (reducerTypeRef.current !== uiState.mode.type) {
        const prevReducer = reducerTypeRef.current
          ? modes[reducerTypeRef.current]
          : null;

        if (prevReducer && prevReducer.exit) {
          prevReducer.exit(baseState);
        }

        if (mode.entry) {
          mode.entry(baseState);
        }
      }

      modeFunction(baseState);
      reducerTypeRef.current = uiState.mode.type;
    },
    [uiStateApi, modelStoreApi, scene, rendererSize, layerContext]
  );

  const onMouseEvent = useCallback(
    (e: SlimMouseEvent) => {
      if (!rendererRef.current) return;

      if (e.type === 'mousedown' && handlePanMouseDown(e)) {
        // Still update mouse state so Pan mode can track mousedown position for drag
        const uiState = uiStateApi.getState();
        const nextMouse = getMouse({
          interactiveElement: rendererRef.current,
          zoom: uiState.zoom,
          scroll: uiState.scroll,
          lastMouse: uiState.mouse,
          mouseEvent: e,
          rendererSize
        });
        uiState.actions.setMouse(nextMouse);
        return;
      }
      if (e.type === 'mouseup' && handlePanMouseUp(e)) {
        return;
      }

      const uiState = uiStateApi.getState();

      const nextMouse = getMouse({
        interactiveElement: rendererRef.current,
        zoom: uiState.zoom,
        scroll: uiState.scroll,
        lastMouse: uiState.mouse,
        mouseEvent: e,
        rendererSize
      });

      if (e.type === 'mousemove') {
        scheduleUpdate(nextMouse, e, (update) => {
          // handlePanMouseMove returns true while right button is held below threshold —
          // suppress processMouseUpdate to prevent Cursor.mousemove triggering lasso.
          if (!handlePanMouseMove(update.event)) {
            processMouseUpdate(update.mouse, update.event);
          }
        });
      } else {
        flushUpdate();
        processMouseUpdate(nextMouse, e);
      }
    },
    [
      uiStateApi,
      rendererSize,
      handlePanMouseDown,
      handlePanMouseMove,
      handlePanMouseUp,
      scheduleUpdate,
      flushUpdate,
      processMouseUpdate
    ]
  );

  const onContextMenu = useCallback(
    (e: SlimMouseEvent) => {
      e.preventDefault();
      const uiState = uiStateApi.getState();
      const tile = uiState.mouse.position.tile;
      const item = getItemAtTile({ tile, scene });
      if (item) {
        uiState.actions.setContextMenu({
          type: 'ITEM',
          item: { type: 'ITEM', id: item.id },
          tile
        });
      } else {
        uiState.actions.setContextMenu({ type: 'EMPTY', tile });
      }
    },
    [uiStateApi, scene]
  );

  useEffect(() => {
    if (modeType === 'INTERACTIONS_DISABLED') return;

    const el = window;

    const onTouchStart = (e: TouchEvent) => {
      onMouseEvent({
        ...e,
        clientX: Math.floor(e.touches[0].clientX),
        clientY: Math.floor(e.touches[0].clientY),
        type: 'mousedown',
        button: 0
      });
    };

    const onTouchMove = (e: TouchEvent) => {
      onMouseEvent({
        ...e,
        clientX: Math.floor(e.touches[0].clientX),
        clientY: Math.floor(e.touches[0].clientY),
        type: 'mousemove',
        button: 0
      });
    };

    const onTouchEnd = (e: TouchEvent) => {
      onMouseEvent({
        ...e,
        clientX: 0,
        clientY: 0,
        type: 'mouseup',
        button: 0
      });
    };

    const onScroll = (e: WheelEvent) => {
      const uiState = uiStateApi.getState();
      const zoomToCursor = uiState.zoomSettings.zoomToCursor;
      const oldZoom = uiState.zoom;

      let newZoom: number;
      if (e.deltaY > 0) {
        newZoom = decrementZoom(oldZoom);
      } else {
        newZoom = incrementZoom(oldZoom);
      }

      if (newZoom === oldZoom) {
        return;
      }

      if (zoomToCursor && rendererRef.current && rendererSize) {
        const rect = rendererRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const mouseRelativeToCenterX = mouseX - rendererSize.width / 2;
        const mouseRelativeToCenterY = mouseY - rendererSize.height / 2;

        const worldX =
          (mouseRelativeToCenterX - uiState.scroll.position.x) / oldZoom;
        const worldY =
          (mouseRelativeToCenterY - uiState.scroll.position.y) / oldZoom;

        const newScrollX = mouseRelativeToCenterX - worldX * newZoom;
        const newScrollY = mouseRelativeToCenterY - worldY * newZoom;

        uiState.actions.setZoom(newZoom);
        uiState.actions.setScroll({
          position: {
            x: newScrollX,
            y: newScrollY
          },
          offset: uiState.scroll.offset
        });
      } else {
        uiState.actions.setZoom(newZoom);
      }
    };

    const onDragStart = (e: DragEvent) => e.preventDefault();

    el.addEventListener('mousemove', onMouseEvent);
    el.addEventListener('mousedown', onMouseEvent);
    el.addEventListener('mouseup', onMouseEvent);
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('touchstart', onTouchStart);
    el.addEventListener('touchmove', onTouchMove);
    el.addEventListener('touchend', onTouchEnd);
    rendererEl?.addEventListener('wheel', onScroll, { passive: true });
    rendererEl?.addEventListener('dragstart', onDragStart);

    return () => {
      el.removeEventListener('mousemove', onMouseEvent);
      el.removeEventListener('mousedown', onMouseEvent);
      el.removeEventListener('mouseup', onMouseEvent);
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      rendererEl?.removeEventListener('wheel', onScroll);
      rendererEl?.removeEventListener('dragstart', onDragStart);
      cleanup();
    };
  }, [
    editorMode,
    modeType,
    onMouseEvent,
    onContextMenu,
    rendererEl,
    rendererSize,
    uiStateApi,
    scene,
    cleanup
  ]);

  const setInteractionsElement = useCallback((element: HTMLElement) => {
    rendererRef.current = element;
  }, []);

  return {
    setInteractionsElement
  };
};
