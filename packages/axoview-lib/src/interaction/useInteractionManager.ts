import { useCallback, useEffect, useRef, MutableRefObject } from 'react';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import {
  ModeActions,
  State,
  SlimMouseEvent,
  Mouse,
  ItemReference
} from 'src/types';
import { DialogTypeEnum, ItemControls } from 'src/types/ui';
import {
  getMouse,
  getItemAtTile,
  incrementZoom,
  decrementZoom
} from 'src/utils';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { useScene } from 'src/hooks/useScene';
import { useHistory } from 'src/hooks/useHistory';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';
import { TOOL_HOTKEYS } from 'src/config/hotkeys';
import { resolveToolHotkey, resolveZOrderDirection } from './toolHotkeys';
import { handleEscapeKey, handleConnectorEscape } from './handleEscapeKey';
import { handleDeleteOrBackspace, isEditableTarget } from './handleDeleteKey';
import { handleArrowKey } from './handleArrowKey';
import {
  canUseKeyboardSurface,
  type CanvasKeyboardSurface
} from './readonlyPolicy';
import { isModalDialogOpen, hasLiveTextSelection } from './keyboardScope';
import type { ScreenToTileFn } from 'src/utils/renderer';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { collectSelectableRefs } from 'src/utils/selectableRefs';
import { Cursor } from './modes/Cursor';
import { DragItems, abortDragItems } from './modes/DragItems';
import { DrawRectangle } from './modes/Rectangle/DrawRectangle';
import { TransformRectangle } from './modes/Rectangle/TransformRectangle';
import { Connector } from './modes/Connector';
import { Pan } from './modes/Pan';
import { PlaceIcon } from './modes/PlaceIcon';
import { TextBox } from './modes/TextBox';
import { TransformTextBox } from './modes/TransformTextBox';
import { TransformNode } from './modes/Node/TransformNode';
import { Label } from './modes/Label';
import { Lasso } from './modes/Lasso';
import { FreehandLasso } from './modes/FreehandLasso';
import { ReconnectAnchor } from './modes/ReconnectAnchor';
import { exceedsTapSlop } from 'src/config/tapGesture';
import { MIN_ZOOM, MAX_ZOOM } from 'src/config';
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
  'TEXTBOX.TRANSFORM': TransformTextBox,
  'NODE.TRANSFORM': TransformNode,
  LABEL: Label,
  LASSO: Lasso,
  FREEHAND_LASSO: FreehandLasso,
  RECONNECT_ANCHOR: ReconnectAnchor
};

// Device class of the originating pointer (ADR 0018). The mouse-shaped
// SlimMouseEvent stays the single internal adapter every mode is written
// against; pointerType travels separately so PointerEvent is never leaked into
// modes (behavior-map §0).
type PointerKind = 'mouse' | 'touch' | 'pen';

// Hold duration before a stationary touch becomes a long-press (node → context
// menu; empty → lasso). Slightly under the OS ~500ms callout so our menu wins.
const LONG_PRESS_MS = 450;

// ADR 0027 touch reconciliation: a long-press opens the context menu DURING the
// hold, while the finger is still down. When the finger lifts, the browser
// synthesises a compatibility mouse sequence (mousedown → mouseup → click) at
// the press point. Portaled to <body>, the MUI Menu backdrop sits under that
// point, so that synthesised mousedown/click immediately dismisses the
// just-opened menu (the "verify on a device" risk ADR 0027 flagged). The
// spec-compliant cure is to cancel the terminating `touchend`, which suppresses
// the whole compat-mouse sequence; we also swallow a stray backdrop
// mousedown/click in the capture phase as a belt-and-suspenders fallback for
// environments that synthesise the click without a cancelable touchend. The
// menu therefore survives the lift; a later, deliberate tap-away (a fresh touch
// sequence) still dismisses it. Everything self-removes after the first
// terminating event or 700 ms, so it can never eat a real interaction.
const suppressLongPressGestureEnd = () => {
  let timer: ReturnType<typeof setTimeout>;
  const cleanup = () => {
    window.removeEventListener('touchend', onTouchEnd, true);
    window.removeEventListener('mousedown', onBackdropMouse, true);
    window.removeEventListener('click', onBackdropMouse, true);
    clearTimeout(timer);
  };
  const onTouchEnd = (ev: TouchEvent) => {
    // Cancel the compat-mouse sequence the lift would otherwise synthesise.
    if (ev.cancelable) ev.preventDefault();
  };
  const onBackdropMouse = (ev: MouseEvent) => {
    if ((ev.target as HTMLElement | null)?.closest('.MuiBackdrop-root')) {
      ev.stopPropagation();
      ev.preventDefault();
    }
    // The click is the last event of the sequence — clean up once it lands.
    if (ev.type === 'click') cleanup();
  };
  window.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });
  window.addEventListener('mousedown', onBackdropMouse, true);
  window.addEventListener('click', onBackdropMouse, true);
  timer = setTimeout(cleanup, 700);
};

// Max gap between two taps on the SAME item for the second to count as a
// double-tap (→ open the details panel, ADR 0022 §5). Debounced against the
// single-tap select so a deliberate double-tap doesn't just re-select.
const DOUBLE_TAP_MS = 300;

interface TouchGestureState {
  // Active touch/pen pointers by pointerId → latest client position.
  pointers: Map<number, { x: number; y: number }>;
  // 'item' = single finger on a draggable target, forwarded as a mouse gesture
  // (tap=select, drag=move/reconnect). 'pan-pending' = single finger on empty,
  // not yet past slop. 'pan' = one-finger pan. 'pinch' = two-finger zoom+pan.
  // 'palette' = a press that started OFF-canvas while a placement is armed
  // (Elements-panel drag) — a release over the canvas drops/places the icon.
  // 'menu' = a long-press fired and opened the per-item context menu; the rest of
  // the gesture is consumed (release just dismisses the press, menu stays open).
  phase: 'idle' | 'item' | 'pan-pending' | 'pan' | 'pinch' | 'palette' | 'menu';
  // Target the 'item' down was forwarded with (the interactions box, or the real
  // anchor element so targetAnchorId resolves for connector reconnect).
  itemDownTarget: EventTarget | null;
  downScreen: { x: number; y: number };
  downTile: { x: number; y: number };
  // The interactable item under the press, if any — drives the long-press menu.
  downItem: ItemReference | null;
  lastPanScreen: { x: number; y: number };
  pinchLastDistance: number;
  pinchLastCentroid: { x: number; y: number };
  // Long-press (hold) timer: hold-on-node → context menu; hold-on-empty → lasso.
  longPressTimer: ReturnType<typeof setTimeout> | null;
  // True while a long-press-armed marquee is running, so its commit returns to
  // CURSOR (one-shot lasso without an explicit tool switch).
  autoLasso: boolean;
  // Double-tap detection (ADR 0022 §5): timestamp + item of the last stationary
  // item-tap, so a second tap on the same item within DOUBLE_TAP_MS opens the
  // details panel instead of just re-selecting.
  lastTapTime: number;
  lastTapItem: ItemReference | null;
}

const pointerDistance = (
  a: { x: number; y: number },
  b: { x: number; y: number }
) => Math.hypot(a.x - b.x, a.y - b.y);

const pointerCentroid = (
  a: { x: number; y: number },
  b: { x: number; y: number }
) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

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

// ─── keydown handler decomposition ──────────────────────────────────────────
// The window keydown handler was a single ~380-line function (Sonar S3776
// cognitive complexity 131 — the worst in the repo). It is decomposed into the
// module-level helpers below; useInteractionManager's handler (see the keydown
// useEffect) is now a thin dispatcher that threads the live uiState snapshot +
// a stable `KeydownDeps` bundle through them. Behaviour is preserved exactly:
// the gesture order, fall-through semantics, ADR-0006 selection contract, and
// the M-1 dep-array invariant are all unchanged.

type SceneApi = ReturnType<typeof useScene>;

interface KeydownDeps {
  uiStateApi: ReturnType<typeof useUiStateStoreApi>;
  modelStoreApi: ReturnType<typeof useModelStoreApi>;
  sceneRef: MutableRefObject<SceneApi>;
  layerContextRef: MutableRefObject<ReturnType<typeof useLayerContext>>;
  rendererRef: MutableRefObject<HTMLElement | undefined>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => void;
  deleteSelectedItems: SceneApi['deleteSelectedItems'];
  deleteViewItem: SceneApi['deleteViewItem'];
  deleteConnector: SceneApi['deleteConnector'];
  deleteTextBox: SceneApi['deleteTextBox'];
  deleteRectangle: SceneApi['deleteRectangle'];
  deleteLabel: SceneApi['deleteLabel'];
  updateViewItem: SceneApi['updateViewItem'];
  commitDragTransaction: SceneApi['commitDragTransaction'];
  // Mode-aware screen→tile (useCanvasMode), used by the keydown helpers' tile
  // resolution.
  screenToTile: ScreenToTileFn;
}

// Esc handling (handleConnectorEscape + handleEscapeKey) is extracted to
// ./handleEscapeKey, and Delete/Backspace (handleDeleteOrBackspace +
// deleteItemControlsTarget + isEditableTarget) to ./handleDeleteKey, so both are
// unit-testable in isolation — the full hook needs a provider stack to mount.

// Ctrl+A: select all interactable items, switching to CURSOR mode so the
// multi-selection visual + drag work. Reads scene/layer state via refs so the
// keydown effect's dep array stays stable (M-1 perf invariant). ADR-0006.
const handleSelectAll = (uiState: State['uiState'], deps: KeydownDeps) => {
  // I1/PTR-08: Ctrl+A force-switches to CURSOR, and it used to do so with an
  // in-flight connector still half-drawn — the provisional connector survived
  // (both anchors on the same node), a later Escape could no longer clear it
  // because the mode had moved on, and Ctrl+A then folded the orphan into the
  // selection. Only Esc and the right-click restore ran the abort. Aborting
  // first is the same call Esc makes, and it no-ops when nothing is in flight.
  //
  // The id is captured BEFORE the abort because `sceneRef.current` is a
  // render-time snapshot: `collectSelectableRefs` below would still see the
  // entity `handleConnectorEscape` just deleted and select it anyway.
  const inFlightConnectorId =
    uiState.mode.type === 'CONNECTOR' ? uiState.mode.id : null;
  const abortedConnectorId = handleConnectorEscape(uiState, deps)
    ? inFlightConnectorId
    : null;

  const { lockedIds, visibleIds, layers } = deps.layerContextRef.current;
  const refs = collectSelectableRefs(
    deps.sceneRef.current,
    lockedIds,
    visibleIds,
    layers.length > 0
  );
  // Switch to CURSOR mode so the multi-selection visual + drag work.
  if (uiState.mode.type !== 'CURSOR') {
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
  uiState.actions.setSelectedIds(
    abortedConnectorId
      ? refs.filter((ref) => ref.id !== abortedConnectorId)
      : refs
  );
};

// Undo / redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z).
//
// I1/PTR-10: an undo taken DURING a live drag used to be unrecoverable. The
// drag itself writes nothing (the preview is CSS-only), so the undo landed on
// the action before it — but the gesture's pending mouseup then committed
// `batchUpdateViewItemTiles` from the preview maps, and that counted as a new
// action, which clears the redo stack. One Ctrl+Z during a drag and the undone
// work could never be brought back.
//
// The gesture is therefore ABORTED before the undo runs (the convention Figma
// and friends follow: a history keystroke mid-drag cancels the drag). Clearing
// the preview maps is what matters — the pending mouseup then has nothing to
// commit, so redo survives. Dropping back to CURSOR makes the abort visible
// instead of leaving the canvas in a drag mode with no preview.
const handleHistoryShortcuts = (
  e: KeyboardEvent,
  isCtrlOrCmd: boolean,
  key: string,
  uiState: State['uiState'],
  deps: KeydownDeps
) => {
  if (!isCtrlOrCmd) return;

  const isUndo = key === 'z' && !e.shiftKey;
  const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
  if (!isUndo && !isRedo) return;

  if (uiState.mode.type === 'DRAG_ITEMS') {
    abortDragItems(deps.sceneRef.current, uiState);
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }

  e.preventDefault();
  if (isUndo && deps.canUndo) {
    deps.undo();
  }
  if (isRedo && deps.canRedo) {
    deps.redo();
  }
};

// Clipboard (Ctrl+X / Ctrl+C / Ctrl+V). Copy is a `viewer` surface and cut/paste
// are `editor` ones (readonlyPolicy), so the two halves are gated separately —
// a read-only viewer can still lift content out, but cannot write any back.
const handleClipboardShortcuts = (
  e: KeyboardEvent,
  isCtrlOrCmd: boolean,
  key: string,
  deps: KeydownDeps,
  allowCutPaste: boolean
) => {
  if (!isCtrlOrCmd) return;

  if (key === 'x' && allowCutPaste) {
    e.preventDefault();
    deps.handleCut();
  }

  if (key === 'c') {
    // I1/PTR-12: Ctrl+C used to preventDefault unconditionally, so a text
    // selection anywhere the app doesn't own an input — a dialog body, a panel
    // label, a notes preview — was never copied: no native `copy` event fired,
    // the canvas copy ran instead, and the user got no feedback either way.
    // A live selection wins; an idle Ctrl+C still copies the canvas selection.
    if (hasLiveTextSelection()) return;
    e.preventDefault();
    deps.handleCopy();
  }

  if (key === 'v' && allowCutPaste) {
    e.preventDefault();
    deps.handlePaste();
  }
};

// F1 opens help; F2 hands off to canvas inline-rename — but only when the
// keystroke originated inside the renderer (MQA #13: F2 from the file-explorer
// tree row must not steal focus into a selected canvas node's editor).
// (`help` is a `viewer` surface and `inlineRename` an `editor` one — the caller
// passes the latter's verdict in, so every editor surface is gated in one place.)
const handleFunctionKeys = (
  e: KeyboardEvent,
  uiState: State['uiState'],
  deps: KeydownDeps,
  allowInlineRename: boolean
) => {
  if (e.key === 'F1') {
    e.preventDefault();
    uiState.actions.setDialog(DialogTypeEnum.HELP);
  }

  if (e.key === 'F2') {
    const ctrl = uiState.itemControls;
    // MQA #13: F2 originates from outside the renderer (e.g. file-explorer
    // tree row) when the user wants to rename a *diagram*. If a canvas item
    // happens to be selected, we used to steal focus by triggering the node
    // inline-rename — which unmounted the explorer's edit input. Only fire
    // the canvas inline-rename when the keystroke came from inside the
    // renderer (or from the document itself with no other focus target).
    const focusTarget = (e.target as HTMLElement | null) ?? null;
    const renderer = deps.rendererRef.current;
    const cameFromRenderer =
      !focusTarget ||
      focusTarget === document.body ||
      (renderer ? renderer.contains(focusTarget) : false);
    if (!allowInlineRename || !cameFromRenderer) return;
    if (ctrl?.type === 'LABEL') {
      // Floating Label inline-edit is driven by uiState (LabelHitLayer renders
      // the contentEditable), not the node/connector inlineEditNodeName event.
      e.preventDefault();
      uiState.actions.setInlineEditLabelId(ctrl.id);
    } else if (
      ctrl?.type === 'ITEM' ||
      ctrl?.type === 'TEXTBOX' ||
      ctrl?.type === 'CONNECTOR'
    ) {
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent('inlineEditNodeName', { detail: { id: ctrl.id } })
      );
    }
  }
};

// Tool-selection hotkeys — one fixed read-only scheme (ADR 0022 §6).
const handleToolHotkeys = (
  e: KeyboardEvent,
  isCtrlOrCmd: boolean,
  uiState: State['uiState'],
  key: string,
  deps: KeydownDeps
) => {
  const action = resolveToolHotkey(isCtrlOrCmd, key, TOOL_HOTKEYS);
  if (!action) return;
  e.preventDefault();

  // I1/PTR-07: switching tools mid-gesture performed no abort — pressing `r`
  // during a connector draw just setMode()d, stranding the provisional
  // connector in the model with BOTH anchors on the same node and no way to
  // clear it (Escape no longer applies once the mode has moved on). Esc and the
  // right-click restore were the only paths that aborted. This is that same
  // call; it no-ops unless a connection is actually in flight.
  handleConnectorEscape(uiState, deps);

  switch (action) {
    case 'select':
      uiState.actions.setMode({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      });
      break;
    case 'pan':
      uiState.actions.setMode({
        type: 'PAN',
        showCursor: false
      });
      uiState.actions.setItemControls(null);
      break;
    case 'addItem':
      // B7: toggle the Elements tab in the left dock (open if closed, close if
      // already showing) to match the LeftDock button. Was an unconditional
      // open, so N could never close the panel.
      uiState.actions.setActiveLeftTab(
        uiState.activeLeftTab === 'ELEMENTS' ? null : 'ELEMENTS'
      );
      break;
    case 'rectangle':
      uiState.actions.setMode({
        type: 'RECTANGLE.DRAW',
        showCursor: true,
        id: null
      });
      break;
    case 'connector':
      uiState.actions.setMode({
        type: 'CONNECTOR',
        id: null,
        showCursor: true
      });
      break;
    case 'text':
      // Arm-only (mirrors rectangle / connector / icon): the hotkey enters
      // TEXTBOX mode with no element created; the next canvas release drops a
      // single text box (TextBox.mouseup is the sole create site). Eager-create
      // here used to stack a second box on top of that release.
      uiState.actions.setMode({
        type: 'TEXTBOX',
        showCursor: true,
        id: null
      });
      break;
    case 'lasso':
      uiState.actions.setMode({
        type: 'LASSO',
        showCursor: true,
        selection: null,
        isDragging: false
      });
      break;
    case 'freehandLasso':
      uiState.actions.setMode({
        type: 'FREEHAND_LASSO',
        showCursor: true,
        path: [],
        selection: null,
        isDragging: false
      });
      break;
  }
};

// Z-order (E2): Ctrl+] / Ctrl+[ nudge forward / backward; Ctrl+Shift+] /
// Ctrl+Shift+[ jump to front / back (absolute). Applies to the controlled
// ITEM, RECTANGLE, or LABEL — each reorders within its own peer collection.
//
// I1/PTR-14: the bracket used to be matched as `e.key === ']'`, which no real
// keyboard produces while Shift is held — `resolveZOrderDirection` (toolHotkeys)
// owns the key identity now.
const handleZOrderShortcut = (
  e: KeyboardEvent,
  isCtrlOrCmd: boolean,
  uiState: State['uiState'],
  deps: KeydownDeps
) => {
  const direction = isCtrlOrCmd ? resolveZOrderDirection(e) : null;
  if (!direction) return;
  const ctrl = uiState.itemControls;
  if (
    ctrl?.type !== 'ITEM' &&
    ctrl?.type !== 'RECTANGLE' &&
    ctrl?.type !== 'LABEL'
  )
    return;
  e.preventDefault();

  const modelState = deps.modelStoreApi.getState();
  const currentView = uiState.view
    ? modelState.views.find((v: { id: string }) => v.id === uiState.view)
    : undefined;
  if (!currentView) return;

  const toFront = direction === 'front';
  const scene = deps.sceneRef.current;

  const reorder = (
    peers: { id: string; zIndex?: number }[] | undefined,
    write: (zIndex: number) => void
  ) => {
    const list = peers ?? [];
    const self = list.find((p) => p.id === ctrl.id);
    if (!self) return;
    if (e.shiftKey) {
      const zs = list.map((p) => p.zIndex ?? 0);
      write(toFront ? Math.max(0, ...zs) + 1 : Math.min(0, ...zs) - 1);
    } else {
      write((self.zIndex ?? 0) + (toFront ? 1 : -1));
    }
  };

  if (ctrl.type === 'ITEM') {
    reorder(currentView.items, (z) => deps.updateViewItem(ctrl.id, { zIndex: z }));
  } else if (ctrl.type === 'RECTANGLE') {
    reorder(currentView.rectangles, (z) =>
      scene.updateRectangle(ctrl.id, { zIndex: z })
    );
  } else if (ctrl.type === 'LABEL') {
    reorder(currentView.labels, (z) => scene.updateLabel(ctrl.id, { zIndex: z }));
  }
};

// Arrow-key handling (selection-aware nudge OR pan) is extracted to
// ./handleArrowKey (B6 — amends ADR 0022 §6: arrows nudge the selected
// ITEM/RECT/TEXTBOX one tile in a single-undo transaction, else pan) so the
// nudge branch is unit-testable in isolation. The dispatcher calls it below.

export const useInteractionManager = () => {
  const rendererRef = useRef<HTMLElement | undefined>(undefined);
  const reducerTypeRef = useRef<string | undefined>(undefined);
  // Device class of the pointer for the in-flight gesture (ADR 0018). Set on
  // every pointer event before dispatch; read by processMouseUpdate (→ State)
  // and by onMouseEvent (to route touch/pen around the mouse-only pan handlers).
  // A ref, not store state, so it never re-renders the SceneLayers (perf §3.3).
  const pointerTypeRef = useRef<PointerKind>('mouse');
  // Touch/pen multi-pointer gesture state (ADR 0018 D-12). Held in a ref so it
  // survives effect re-runs and never triggers a render. The `phase` field is the
  // gesture state machine — see the TouchGestureState definition above for what
  // each phase means ('item' / 'pan-pending' / 'pan' / 'pinch' / 'palette' /
  // 'menu'); 'pan-pending' is the tentative single-finger state that promotes to
  // 'pan' past TAP_SLOP_PX or resolves to a tap on lift.
  const touchStateRef = useRef<TouchGestureState>({
    pointers: new Map(),
    phase: 'idle',
    itemDownTarget: null,
    downScreen: { x: 0, y: 0 },
    downTile: { x: 0, y: 0 },
    downItem: null,
    lastPanScreen: { x: 0, y: 0 },
    pinchLastDistance: 0,
    pinchLastCentroid: { x: 0, y: 0 },
    longPressTimer: null,
    autoLasso: false,
    lastTapTime: 0,
    lastTapItem: null
  });

  const modeType = useUiStateStore((state) => state.mode.type);
  const rendererEl = useUiStateStore((state) => state.rendererEl);

  const uiStateApi = useUiStateStoreApi();
  const modelStoreApi = useModelStoreApi();
  const scene = useScene();
  const layerContext = useLayerContext();
  // Ref mirrors of scene / layerContext for the keydown effect — keeps the
  // effect's dep array stable (M-1 perf invariant) while still letting Ctrl+A
  // and other handlers read live scene/layer data on each keypress.
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const layerContextRef = useRef(layerContext);
  layerContextRef.current = layerContext;
  // Single ResizeObserver for rendererEl — result is stored in the Zustand store
  // so UiOverlay and useDiagramUtils can read it without creating their own observers.
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const { undo, redo, canUndo, canRedo } = useHistory();
  const { handleCopy, handleCut, handlePaste } = useCopyPaste();
  const { screenToTile } = useCanvasMode();
  const {
    deleteSelectedItems,
    deleteViewItem,
    deleteConnector,
    deleteTextBox,
    deleteRectangle,
    deleteLabel,
    updateViewItem,
    commitDragTransaction
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
    // Stable-per-effect-run bundle of the live store APIs + scene/history
    // callbacks the keydown helpers need. Rebuilt whenever the effect re-runs
    // (its members are the dep array below), so each helper sees current values.
    const deps: KeydownDeps = {
      uiStateApi,
      modelStoreApi,
      sceneRef,
      layerContextRef,
      rendererRef,
      undo,
      redo,
      canUndo,
      canRedo,
      handleCopy,
      handleCut,
      handlePaste,
      deleteSelectedItems,
      deleteViewItem,
      deleteConnector,
      deleteTextBox,
      deleteRectangle,
      deleteLabel,
      updateViewItem,
      commitDragTransaction,
      screenToTile
    };

    // Thin dispatcher — the gesture order, fall-through semantics, and early
    // returns mirror the original ~380-line handler exactly. Each delegate
    // returns true only where the original `return`ed; the un-guarded calls
    // (history/clipboard/function-keys/hotkeys/z-order/pan) fall through just as
    // the original sequential `if` blocks did.
    const handleKeyDown = (e: KeyboardEvent) => {
      const uiState = uiStateApi.getState();
      // I1/PTR-01..03: only `handleFunctionKeys` ever consulted `editorMode`, so
      // every other shortcut mutated a read-only diagram. Each delegate now asks
      // the surface table (readonlyPolicy) instead — `viewer` surfaces run in
      // every mode, `editor` surfaces only in EDITABLE.
      const allow = (surface: CanvasKeyboardSurface) =>
        canUseKeyboardSurface(surface, uiState.editorMode);

      // E1/HIST-06: a drag bracket is closed by the mouseup, and the mode's exit
      // runs lazily on the NEXT mouse event — so a lost mouseup (release outside
      // the window, alt-tab, the browser context menu stealing the event)
      // followed by a keyboard-only action leaves the bracket open. Every later
      // edit then applies with NO history entry while `canUndo()` still returns
      // true, and the next Ctrl+Z reverts the pre-drag action, destroying them.
      // Committing here is the same "no-op when no drag is open" call
      // `usePanHandlers` and `handleEscapeKey` already make.
      deps.sceneRef.current.commitDragTransaction();

      // I1/PTR-05: a modal dialog owns the keyboard. The canvas listener is
      // window-bound, so before this it fired straight through one — F1 opened
      // Help and the next Delete destroyed the selected node behind the
      // still-open dialog, invisibly. MUI traps focus, not window keydown, and
      // only F2 had a "did this come from the renderer" test. Stand down
      // entirely: Escape belongs to the dialog too, and a tool hotkey armed
      // under a modal is a mode the user never asked for. The drag-bracket
      // safety net above runs first so a leaked bracket is still closed.
      if (isModalDialogOpen()) return;

      if (handleEscapeKey(e, uiState, deps, uiState.editorMode)) return;
      if (allow('delete') && handleDeleteOrBackspace(e, uiState, deps)) return;
      if (isEditableTarget(e.target as HTMLElement)) return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (allow('history')) {
        handleHistoryShortcuts(e, isCtrlOrCmd, key, uiState, deps);
      }
      handleClipboardShortcuts(e, isCtrlOrCmd, key, deps, allow('cutPaste'));

      // Ctrl+A: select all visible + unlocked items in the active view. ADR-0006.
      if (isCtrlOrCmd && key === 'a') {
        if (!allow('selectAll')) return;
        e.preventDefault();
        handleSelectAll(uiState, deps);
        return;
      }

      handleFunctionKeys(e, uiState, deps, allow('inlineRename'));
      if (allow('toolHotkeys')) {
        handleToolHotkeys(e, isCtrlOrCmd, uiState, key, deps);
      }
      if (allow('zOrder')) handleZOrderShortcut(e, isCtrlOrCmd, uiState, deps);
      handleArrowKey(
        e,
        uiState,
        {
          getScene: () => deps.sceneRef.current,
          // I1/PTR-11: the nudge used to trust an in-code comment claiming
          // `selectedIds` cannot hold locked or hidden refs — RED-15 falsified
          // it (locking a layer does not re-validate an existing selection), so
          // the arrows moved items on a locked layer one tile per press while
          // the mouse drag, which asks this same predicate, refused them.
          isItemInteractable: (ref) => {
            const { lockedIds, visibleIds, layers } =
              deps.layerContextRef.current;
            return (
              !lockedIds.has(ref.id) &&
              (layers.length === 0 || visibleIds.has(ref.id))
            );
          },
          beginDragTransaction: deps.sceneRef.current.beginDragTransaction,
          commitDragTransaction: deps.sceneRef.current.commitDragTransaction,
          batchUpdateViewItemTiles:
            deps.sceneRef.current.batchUpdateViewItemTiles,
          batchUpdateRectangles: deps.sceneRef.current.batchUpdateRectangles,
          batchUpdateTextBoxTiles: deps.sceneRef.current.batchUpdateTextBoxTiles
        },
        allow('arrowNudge')
      );
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
    deleteSelectedItems,
    deleteViewItem,
    deleteConnector,
    deleteTextBox,
    deleteRectangle,
    deleteLabel,
    handleCopy,
    handleCut,
    handlePaste,
    updateViewItem,
    commitDragTransaction,
    screenToTile
  ]);

  const processMouseUpdate = useCallback(
    (nextMouse: Mouse, e: SlimMouseEvent) => {
      if (!rendererRef.current) return;

      const uiState = uiStateApi.getState();

      // While an annotation draw/eraser tool is armed, the AnnotationLayer owns
      // canvas pointer input (ADR 0014 §8.11 "capture only when armed"). The
      // interaction manager listens on `window`, so it still SEES these events —
      // it must not ACT on them, or canvas modes leak under the overlay:
      //   • hover rim paints on nodes mid-draw (reads as "selectable"),
      //   • a drag-from-panel Elements icon still places a node (PlaceIcon.mouseup
      //     places on the `moved` heuristic regardless of isRendererInteraction),
      //   • a hotkey-armed tool (r / t / …) would run under the overlay.
      // Pan (right-drag) and wheel-zoom are handled BEFORE this in onMouseEvent /
      // onScroll, so canvas navigation while drawing stays available. `select` is
      // the pass-through tool, so it does NOT lock the canvas.
      const anno = uiState.annotation;
      if (anno?.open && anno.tool !== 'select') return;

      const model = modelStoreApi.getState();

      const mode = modes[uiState.mode.type];
      const modeFunction = getModeFunction(mode, e);

      if (!modeFunction) return;

      // Capture keyboard modifiers per mouse event so mode actions can branch
      // (e.g. Ctrl+click → toggle selection; Alt+click on waypoint → remove).
      // See ADR-0006.
      nextMouse.modifiers = {
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        meta: e.metaKey,
        alt: e.altKey
      };
      uiState.actions.setMouse(nextMouse);

      const { lockedIds, visibleIds, layers } = layerContext;
      // An item is interactable only if its layer is unlocked AND visible.
      // `layers.length === 0` is the "no layers configured" fallback (matches
      // the SceneLayers render guards). mqa-results.md #2. NOT `visibleIds.size`
      // — an empty set also means "every entity is on a hidden layer", which
      // must stay non-interactable (layer-visibility regression fix).
      const isItemInteractable = (ref: { id: string; type?: unknown }) =>
        !lockedIds.has(ref.id) &&
        (layers.length === 0 || visibleIds.has(ref.id));
      // Anchor overlay elements (data-anchor-id) need pointerEvents:'auto'
      // so MUI Tooltip can detect hover, but they're conceptually part of
      // the canvas — treat clicks on them as renderer interactions so
      // Cursor.mousedown still runs its anchor-hit logic.
      const target = e.target as HTMLElement | null;
      const anchorTargetEl =
        target && typeof target.closest === 'function'
          ? (target.closest('[data-anchor-id]') as HTMLElement | null)
          : null;
      const isAnchorOverlay = anchorTargetEl !== null;
      // Propagate the clicked anchor id via uiState.mouse so Cursor.mousedown
      // can identify which anchor was hit without a fragile tile-equality
      // check (the visual + hit ring extends beyond one tile at low zoom).
      nextMouse.targetAnchorId =
        anchorTargetEl?.dataset.anchorId ?? null;
      const baseState: State = {
        model,
        scene,
        uiState,
        rendererRef: rendererRef.current,
        rendererSize,
        isRendererInteraction:
          rendererRef.current === e.target || isAnchorOverlay,
        isItemInteractable,
        pointerType: pointerTypeRef.current,
        screenToTile
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
    [uiStateApi, modelStoreApi, scene, rendererSize, layerContext, screenToTile]
  );

  const onMouseEvent = useCallback(
    (e: SlimMouseEvent) => {
      if (!rendererRef.current) return;

      // usePanHandlers is e.button-shaped (mouse-only): a touch/pen pointerdown
      // carries button:0 and would trip emptyAreaClickPan. Touch/pen navigation
      // (one-finger pan, two-finger pinch) is owned by the touch state machine
      // (ADR 0018 D-12), so route non-mouse pointers straight to the dispatcher.
      const isMousePointer = pointerTypeRef.current === 'mouse';

      // I5/CTX-15: a down/up must land AFTER any move still parked in the RAF
      // throttle. `getMouse` rebuilds `mousedown` from the event type — a
      // 'mousemove' carries forward the mousedown that was current when it was
      // SCHEDULED, so a frame arriving after the press wrote `mousedown: null`
      // back over the press position. Every mode that reads `mouse.mousedown`
      // then behaves as if no press happened; for `Pan.mouseup` in
      // EXPLORABLE_READONLY that is the whole read-only click, so a viewer's
      // click on a content-bearing node opened nothing. Flushing first keeps the
      // three events in the order the user produced them. (The non-pan path
      // below already flushed — the early-returning pan branches did not.)
      if (e.type !== 'mousemove') flushUpdate();

      if (isMousePointer && e.type === 'mousedown' && handlePanMouseDown(e)) {
        // Still update mouse state so Pan mode can track mousedown position for drag
        const uiState = uiStateApi.getState();
        const nextMouse = getMouse({
          interactiveElement: rendererRef.current,
          zoom: uiState.zoom,
          scroll: uiState.scroll,
          lastMouse: uiState.mouse,
          mouseEvent: e,
          rendererSize,
          screenToTileFn: screenToTile
        });
        uiState.actions.setMouse(nextMouse);
        return;
      }
      if (isMousePointer && e.type === 'mouseup' && handlePanMouseUp(e)) {
        return;
      }

      const uiState = uiStateApi.getState();

      const nextMouse = getMouse({
        interactiveElement: rendererRef.current,
        zoom: uiState.zoom,
        scroll: uiState.scroll,
        lastMouse: uiState.mouse,
        mouseEvent: e,
        rendererSize,
        screenToTileFn: screenToTile
      });

      if (e.type === 'mousemove') {
        scheduleUpdate(nextMouse, e, (update) => {
          // handlePanMouseMove returns true while right button is held below threshold —
          // suppress processMouseUpdate to prevent Cursor.mousemove triggering lasso.
          // Mouse-only (see isMousePointer above).
          if (isMousePointer && handlePanMouseMove(update.event)) {
            return;
          }
          processMouseUpdate(update.mouse, update.event);
        });
      } else {
        processMouseUpdate(nextMouse, e);
      }
    },
    [
      uiStateApi,
      rendererSize,
      screenToTile,
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
      // ADR 0022 §1 / §3 + ADR 0027: right-click no longer opens the panel/bar.
      // The bar opens on selection; right-DRAG pans + right-TAP opens our canvas
      // context menu, both owned by usePanHandlers (mouse) / the touch long-press
      // path. This listener exists ONLY to swallow the OS context menu so it
      // can't double up with ours.
      //
      // Two cases must suppress: (1) the right-click landed inside the Renderer
      // (so the canvas owns it); (2) OUR menu is already open — the OS
      // contextmenu fires just after our pointerup opened it, and by then the
      // MUI backdrop (portaled to <body>, outside rendererEl) may be the event
      // target, so the scope check alone would miss it and leak the OS menu.
      // An off-canvas right-click with our menu closed (toolbar, a text input's
      // native Cut/Copy/Paste, the file tree) keeps its native menu.
      const target = e.target as Node | null;
      const inRenderer =
        !!rendererEl &&
        !!target &&
        (rendererEl === target || rendererEl.contains(target));
      const ourMenuOpen = uiStateApi.getState().contextMenu !== null;
      if (!inRenderer && !ourMenuOpen) return;
      e.preventDefault();
    },
    [rendererEl, uiStateApi]
  );

  // Double-click on a canvas item opens its details panel (ADR 0022 §1). Mouse
  // only — touch double-tap is handled by the touch state machine. Scoped to
  // the renderer (window-bound listener, like onContextMenu) so a double-click
  // in a panel / toolbar never opens a stale item's panel. The node label's
  // inline-rename dblclick calls stopPropagation, so it never reaches here —
  // double-click the body opens the panel, double-click the label renames.
  // TEXTBOX is the exception (ADR 0034): its layer sits BELOW the interactions
  // box, so this handler is the double-click entry point — and double-clicking
  // a text box EDITS its text in place (deck stays closed; Details is reachable
  // via the context menu). Locked/hidden items are non-interactive (UX §4.3).
  const onDoubleClick = useCallback(
    (e: SlimMouseEvent) => {
      if (pointerTypeRef.current !== 'mouse') return;
      const target = e.target as Node | null;
      if (
        !rendererEl ||
        !target ||
        !(rendererEl === target || rendererEl.contains(target))
      ) {
        return;
      }
      const uiState = uiStateApi.getState();
      if (uiState.editorMode !== 'EDITABLE') return;
      const tile = uiState.mouse.position.tile;
      // #5: double-click SELECTS (opens Details), so use exact connector tiles —
      // a double-click on an empty tile beside a connector must not grab it
      // (matches the left-click fix in Cursor).
      const item = getItemAtTile({ tile, scene, connectorMatch: 'exact' });
      if (!item) return;
      const { lockedIds, visibleIds, layers } = layerContext;
      const interactable =
        !lockedIds.has(item.id) &&
        (layers.length === 0 || visibleIds.has(item.id));
      if (!interactable) return;
      if (item.type === 'TEXTBOX') {
        // Select (so the strip targets it) WITHOUT opening the deck, then drop
        // into the on-canvas edit session (ADR 0034 §1).
        uiState.actions.setItemControls(
          { type: 'TEXTBOX', id: item.id },
          { openPanel: false }
        );
        uiState.actions.setEditingTextBoxId(item.id);
        return;
      }
      // openPanel defaults true → mounts the Properties dock.
      const controls: ItemControls =
        item.type === 'CONNECTOR'
          ? { type: 'CONNECTOR', id: item.id, tile }
          : { type: item.type, id: item.id };
      uiState.actions.setItemControls(controls);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fine-grained deps on the layerContext Sets; whole layerContext over-invalidates
    [uiStateApi, scene, rendererEl, layerContext.lockedIds, layerContext.visibleIds]
  );

  useEffect(() => {
    if (modeType === 'INTERACTIONS_DISABLED') return;
    // No rendererEl yet (first paint) — nothing to bind to. The effect re-runs
    // once setRendererEl lands the container.
    if (!rendererEl) return;

    // The interactions Box. setPointerCapture is taken on IT (not the container)
    // so e.target retargets to it mid-gesture and the isRendererInteraction gate
    // (=== interactions box) stays true across element boundaries — replacing
    // the old "moves fire on window" property (ADR 0018; behavior-map §0.2).
    const interactionsEl = rendererRef.current;

    // PointerEvent → mouse-shaped SlimMouseEvent. SlimMouseEvent stays the single
    // internal adapter every mode is written against — PointerEvent is NOT leaked
    // into modes (behavior-map §0). pointerType travels via pointerTypeRef.
    const toSlim = (
      e: PointerEvent,
      type: 'mousedown' | 'mousemove' | 'mouseup'
    ): SlimMouseEvent => ({
      clientX: e.clientX,
      clientY: e.clientY,
      target: e.target,
      type,
      preventDefault: () => e.preventDefault(),
      button: e.button,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey
    });

    const releaseCapture = (e: PointerEvent) => {
      if (interactionsEl && interactionsEl.hasPointerCapture?.(e.pointerId)) {
        try {
          interactionsEl.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
      }
    };

    // ─── touch / pen gesture machine (ADR 0018 — direct manipulation) ────────
    // Disambiguate by what is UNDER the finger at pointerdown (Figma/Miro/
    // Lucidchart model):
    //   • draggable target (interactable node, or a connector anchor handle) →
    //     forward the whole gesture as mouse events so the existing modes run: a
    //     tap selects, a drag moves the node (DRAG_ITEMS CSS-preview) or
    //     reconnects the anchor (RECONNECT_ANCHOR) — identical to desktop.
    //   • empty canvas → tap clears selection; drag pans (setScroll).
    //   • two fingers → pinch-zoom + pan (setZoom/setScroll).
    // No tap-to-place, no long-press-to-move: move IS drag. The long-press
    // contextmenu still raises the per-item action bar, now reliably because the
    // down seeds uiState.mouse.position (onContextMenu reads the pressed tile).

    // Forward a touch gesture event to the mode dispatcher as a mouse-shaped
    // event. SlimMouseEvent stays the modes' internal contract. The 'item' down
    // on an anchor keeps the real target so targetAnchorId + the isAnchorOverlay
    // gate resolve; otherwise events target the interactions box so
    // isRendererInteraction holds.
    const forwardMouse = (
      e: PointerEvent,
      type: 'mousedown' | 'mousemove' | 'mouseup',
      target: EventTarget | null | undefined
    ) => {
      onMouseEvent({
        clientX: e.clientX,
        clientY: e.clientY,
        target: target ?? null,
        type,
        preventDefault: () => e.preventDefault(),
        button: 0,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey
      });
    };

    // RAF-coalesce touch pan/pinch to ≤1 store write per frame (perf §3.7).
    let touchRaf: number | null = null;
    const runTouchFrame = () => {
      touchRaf = null;
      const ts = touchStateRef.current;
      const uiState = uiStateApi.getState();
      const pts = [...ts.pointers.values()];

      if (ts.phase === 'pinch' && pts.length >= 2) {
        const dist = pointerDistance(pts[0], pts[1]);
        const centroid = pointerCentroid(pts[0], pts[1]);
        if (ts.pinchLastDistance > 0 && interactionsEl && rendererSize) {
          const rect = interactionsEl.getBoundingClientRect();
          const oldZoom = uiState.zoom;
          const scaleRatio = dist / ts.pinchLastDistance;
          const newZoom = Math.max(
            MIN_ZOOM,
            Math.min(MAX_ZOOM, oldZoom * scaleRatio)
          );
          // Anchor the world point under the OLD centroid to the NEW centroid at
          // the new zoom — folds zoom-to-centroid + two-finger pan into one
          // transform (mirrors the wheel zoom-to-cursor math).
          const oldRelX =
            ts.pinchLastCentroid.x - rect.left - rendererSize.width / 2;
          const oldRelY =
            ts.pinchLastCentroid.y - rect.top - rendererSize.height / 2;
          const newRelX = centroid.x - rect.left - rendererSize.width / 2;
          const newRelY = centroid.y - rect.top - rendererSize.height / 2;
          const worldX = (oldRelX - uiState.scroll.position.x) / oldZoom;
          const worldY = (oldRelY - uiState.scroll.position.y) / oldZoom;
          uiState.actions.setZoom(newZoom);
          uiState.actions.setScroll({
            position: {
              x: newRelX - worldX * newZoom,
              y: newRelY - worldY * newZoom
            },
            offset: uiState.scroll.offset
          });
        }
        ts.pinchLastDistance = dist;
        ts.pinchLastCentroid = centroid;
        return;
      }

      if (ts.phase === 'pan' && pts.length >= 1) {
        const cur = pts[pts.length - 1];
        const dx = cur.x - ts.lastPanScreen.x;
        const dy = cur.y - ts.lastPanScreen.y;
        ts.lastPanScreen = { x: cur.x, y: cur.y };
        uiState.actions.setScroll({
          position: {
            x: uiState.scroll.position.x + dx,
            y: uiState.scroll.position.y + dy
          },
          offset: uiState.scroll.offset
        });
      }
    };
    const scheduleTouchFrame = () => {
      if (touchRaf === null) touchRaf = requestAnimationFrame(runTouchFrame);
    };

    const clearLongPress = () => {
      const ts = touchStateRef.current;
      if (ts.longPressTimer !== null) {
        clearTimeout(ts.longPressTimer);
        ts.longPressTimer = null;
      }
    };

    // Arm the hold timer for a stationary single-finger press (CURSOR mode only).
    // Hold on a node → open its context menu; hold on empty → start a marquee
    // lasso (no explicit tool switch). Cancelled by any move past slop, a lift,
    // or a second finger.
    const startLongPress = (e: PointerEvent) => {
      const ts = touchStateRef.current;
      clearLongPress();
      ts.longPressTimer = setTimeout(() => {
        ts.longPressTimer = null;
        const uiState = uiStateApi.getState();
        if (ts.phase === 'item' && ts.downItem) {
          // Hold on a node → open the CONTEXT MENU for it (ADR 0027 §2;
          // reassigned from the action bar, which now opens on tap-select). It
          // appears during the hold; the user then lifts naturally. Consume the
          // rest of the gesture (phase 'menu').
          const downItem = ts.downItem;
          const anchor = { x: ts.downScreen.x, y: ts.downScreen.y };
          const selectedIds = uiState.selectedIds;
          const inMulti =
            selectedIds.length > 1 &&
            selectedIds.some(
              (r) => r.type === downItem.type && r.id === downItem.id
            );
          if (inMulti) {
            // Long-press on a member of the multi-selection → bulk menu.
            uiState.actions.openContextMenu({ anchor, variant: 'multi', target: null });
          } else {
            // Select the item first so the menu's clipboard / delete act on it.
            uiState.actions.setSelectedIds([
              { type: downItem.type, id: downItem.id }
            ]);
            uiState.actions.openContextMenu({
              anchor,
              variant: 'item',
              target: { type: downItem.type, id: downItem.id },
              // Where the finger pressed — connector "Add label" drops it here.
              tile: ts.downTile
            });
          }
          // Keep the menu alive across the finger-lift compat-mouse sequence
          // (see suppressLongPressGestureEnd).
          suppressLongPressGestureEnd();
          ts.phase = 'menu';
        } else if (ts.phase === 'pan-pending') {
          // Hold on empty → arm a one-shot marquee lasso from the press point.
          uiState.actions.setMode({
            type: 'LASSO',
            showCursor: true,
            selection: null,
            isDragging: false
          });
          ts.phase = 'item';
          ts.autoLasso = true;
          forwardMouse(e, 'mousemove', interactionsEl);
          forwardMouse(e, 'mousedown', interactionsEl);
        }
      }, LONG_PRESS_MS);
    };

    const onTouchPointerDown = (e: PointerEvent) => {
      const ts = touchStateRef.current;
      ts.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (interactionsEl) {
        try {
          interactionsEl.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic / inactive pointer */
        }
      }

      if (ts.pointers.size >= 2) {
        // Second finger → pinch. End an in-flight item drag first so the node
        // commits where it is rather than chasing the pinch centroid.
        clearLongPress();
        if (ts.phase === 'item') forwardMouse(e, 'mouseup', interactionsEl);
        const pts = [...ts.pointers.values()];
        ts.phase = 'pinch';
        ts.itemDownTarget = null;
        ts.pinchLastDistance = pointerDistance(pts[0], pts[1]);
        ts.pinchLastCentroid = pointerCentroid(pts[0], pts[1]);
        return;
      }

      // First finger.
      ts.downScreen = { x: e.clientX, y: e.clientY };
      ts.lastPanScreen = { x: e.clientX, y: e.clientY };

      // Seed uiState.mouse.position so a subsequent long-press contextmenu (and
      // the forwarded events) read the pressed tile, not a stale one.
      const renderEl = rendererRef.current;
      if (!renderEl || !rendererSize) {
        ts.phase = 'pan-pending';
        return;
      }
      const uiState = uiStateApi.getState();
      const seeded = getMouse({
        interactiveElement: renderEl,
        zoom: uiState.zoom,
        scroll: uiState.scroll,
        lastMouse: uiState.mouse,
        mouseEvent: {
          clientX: e.clientX,
          clientY: e.clientY,
          target: e.target,
          type: 'mousemove',
          preventDefault: () => e.preventDefault(),
          button: 0,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey
        },
        rendererSize,
        screenToTileFn: screenToTile
      });
      uiState.actions.setMouse(seeded);

      // Decide whether to forward the gesture to the active mode (so it runs
      // exactly like desktop) or to do the touch-specific empty-canvas pan.
      //
      // Forward when EITHER:
      //   • a tool mode is active (LASSO / FREEHAND_LASSO / RECTANGLE.DRAW /
      //     CONNECTOR / PLACE_ICON / TEXTBOX / PAN / ...): the tool owns the drag
      //     (marquee, freehand path, draw, connect…) — never pan over it; OR
      //   • CURSOR mode and the finger is on a draggable target (an interactable
      //     node, or a connector anchor handle) → tap selects, drag moves/
      //     reconnects.
      // Only CURSOR-mode-on-empty does the touch-specific pan / tap-to-clear.
      // Scene + layers via refs so the listener effect doesn't re-bind per frame.
      const sceneNow = sceneRef.current;
      const { lockedIds, visibleIds, layers } = layerContextRef.current;
      const onAnchor =
        e.target instanceof Element && !!e.target.closest('[data-anchor-id]');
      const itemAtDown = getItemAtTile({
        tile: seeded.position.tile,
        scene: sceneNow
      });
      const interactable =
        !!itemAtDown &&
        !lockedIds.has(itemAtDown.id) &&
        (layers.length === 0 || visibleIds.has(itemAtDown.id));
      const inToolMode = uiState.mode.type !== 'CURSOR';

      ts.downTile = seeded.position.tile;

      if (inToolMode || onAnchor || interactable) {
        // Forward the whole gesture as mouse events to the active mode.
        ts.phase = 'item';
        ts.itemDownTarget = onAnchor ? e.target : interactionsEl ?? null;
        // A canvas press in PLACE_ICON means the user is now positioning on the
        // canvas (tap-then-canvas or canvas-drag) — reveal the preview ghost the
        // palette-arm hid.
        if (uiState.mode.type === 'PLACE_ICON' && uiState.mode.suppressPreview) {
          uiState.actions.setMode({ ...uiState.mode, suppressPreview: false });
        }
        // Seed a move then the down so the mode reads the pressed tile (modes
        // read position from the pre-setMouse uiState snapshot otherwise).
        forwardMouse(e, 'mousemove', ts.itemDownTarget);
        forwardMouse(e, 'mousedown', ts.itemDownTarget);
        // Hold on a node (CURSOR mode) → context menu. A quick drag cancels the
        // timer and moves the node instead.
        ts.downItem =
          !inToolMode && interactable && itemAtDown
            ? { type: itemAtDown.type, id: itemAtDown.id }
            : null;
        if (ts.downItem) startLongPress(e);
        return;
      }

      // CURSOR mode on empty / non-interactable: tap clears, drag pans, hold →
      // lasso.
      ts.phase = 'pan-pending';
      ts.downItem = null;
      startLongPress(e);
    };

    const onTouchPointerMove = (e: PointerEvent) => {
      const ts = touchStateRef.current;
      if (!ts.pointers.has(e.pointerId)) return;
      ts.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Any real movement cancels a pending hold (it's a drag, not a long-press).
      if (
        ts.longPressTimer !== null &&
        exceedsTapSlop(ts.downScreen, { x: e.clientX, y: e.clientY })
      ) {
        clearLongPress();
      }

      // After a long-press opened the menu, the rest of the gesture is inert.
      if (ts.phase === 'menu') return;

      if (ts.phase === 'palette') {
        // Elements-panel drag: drive the PLACE_ICON preview ghost so it tracks
        // the finger to the target tile (PlaceIcon.mousemove is a no-op, so this
        // only moves the preview — placement still happens on release). Without
        // this the dragged icon shows no drag affordance until the finger lifts.
        // The first real move reveals the ghost (suppressed at arm-time so it
        // doesn't paint at a stale tile before the drag starts).
        if (exceedsTapSlop(ts.downScreen, { x: e.clientX, y: e.clientY })) {
          const placing = uiStateApi.getState().mode;
          if (placing.type === 'PLACE_ICON' && placing.suppressPreview) {
            uiStateApi.getState().actions.setMode({
              ...placing,
              suppressPreview: false
            });
          }
        }
        forwardMouse(e, 'mousemove', interactionsEl);
        return;
      }

      if (ts.phase === 'item') {
        forwardMouse(e, 'mousemove', interactionsEl);
        return;
      }
      if (ts.phase === 'pan-pending') {
        if (!exceedsTapSlop(ts.downScreen, { x: e.clientX, y: e.clientY }))
          return;
        ts.phase = 'pan';
        ts.lastPanScreen = { x: e.clientX, y: e.clientY };
      }
      if (ts.phase === 'pan' || ts.phase === 'pinch') scheduleTouchFrame();
    };

    const onTouchPointerUp = (e: PointerEvent) => {
      const ts = touchStateRef.current;
      const wasPhase = ts.phase;
      clearLongPress();
      ts.pointers.delete(e.pointerId);
      releaseCapture(e);

      if (wasPhase === 'menu') {
        // Long-press already opened the menu; the lift just ends the press.
        ts.phase = 'idle';
        return;
      }
      if (wasPhase === 'pinch') {
        // Lift back to one finger → resume single-finger pan. All gone → idle.
        if (ts.pointers.size === 1) {
          const remaining = [...ts.pointers.values()][0];
          ts.phase = 'pan';
          ts.lastPanScreen = { x: remaining.x, y: remaining.y };
        } else {
          ts.phase = 'idle';
        }
        return;
      }
      if (wasPhase === 'item') {
        // Complete the gesture: Cursor.mouseup selects (no move) or commits the
        // drag; RECONNECT_ANCHOR commits the reconnect; Lasso.mouseup commits an
        // auto-lasso marquee.
        forwardMouse(e, 'mouseup', interactionsEl);
        // Double-tap on an item → open its details panel (ADR 0022 §5). Only a
        // stationary tap on an interactable item counts; a drag (move past slop)
        // or an auto-lasso marquee resets the streak. The mouseup above already
        // (re-)selected it; this just escalates the second tap to "open".
        const movedItem = exceedsTapSlop(ts.downScreen, {
          x: e.clientX,
          y: e.clientY
        });
        if (!ts.autoLasso && !movedItem && ts.downItem) {
          const now = Date.now();
          const sameItem =
            !!ts.lastTapItem &&
            ts.lastTapItem.id === ts.downItem.id &&
            ts.lastTapItem.type === ts.downItem.type;
          if (sameItem && now - ts.lastTapTime < DOUBLE_TAP_MS) {
            const controls: ItemControls =
              ts.downItem.type === 'CONNECTOR'
                ? { type: 'CONNECTOR', id: ts.downItem.id, tile: ts.downTile }
                : { type: ts.downItem.type, id: ts.downItem.id };
            uiStateApi.getState().actions.setItemControls(controls);
            ts.lastTapTime = 0;
            ts.lastTapItem = null;
          } else {
            ts.lastTapTime = now;
            ts.lastTapItem = ts.downItem;
          }
        } else {
          ts.lastTapTime = 0;
          ts.lastTapItem = null;
        }
        if (ts.autoLasso) {
          // One-shot lasso: return to CURSOR so the next gesture isn't lasso.
          uiStateApi.getState().actions.setMode({
            type: 'CURSOR',
            showCursor: true,
            mousedownItem: null
          });
          ts.autoLasso = false;
        }
        ts.phase = 'idle';
        ts.itemDownTarget = null;
        return;
      }
      if (wasPhase === 'pan') {
        if (ts.pointers.size === 0) ts.phase = 'idle';
        return;
      }
      if (wasPhase === 'palette') {
        // Elements-panel drag (started off-canvas, placement armed). A real drag
        // that lifts OVER the canvas drops/places the icon there; off the canvas
        // cancels. A no-move tap leaves the placement armed for a later canvas
        // tap (the tap-then-tap-canvas flow is unchanged).
        ts.phase = 'idle';
        const moved = exceedsTapSlop(ts.downScreen, {
          x: e.clientX,
          y: e.clientY
        });
        if (!moved) return;
        const rect = rendererEl?.getBoundingClientRect();
        const overCanvas =
          !!rect &&
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;
        if (overCanvas) {
          forwardMouse(e, 'mousemove', interactionsEl);
          forwardMouse(e, 'mousedown', interactionsEl);
          forwardMouse(e, 'mouseup', interactionsEl);
        } else {
          const ui = uiStateApi.getState();
          if (ui.mode.type === 'PLACE_ICON') {
            ui.actions.setMode({
              type: 'CURSOR',
              showCursor: true,
              mousedownItem: null
            });
          }
        }
        return;
      }
      if (wasPhase === 'pan-pending') {
        // Tap on empty canvas → clear selection. Forward a click (no move → no
        // lasso); Cursor.mouseup with no item clears.
        forwardMouse(e, 'mousemove', interactionsEl);
        forwardMouse(e, 'mousedown', interactionsEl);
        forwardMouse(e, 'mouseup', interactionsEl);
        ts.phase = 'idle';
      }
    };

    const onTouchPointerCancel = (e: PointerEvent) => {
      const ts = touchStateRef.current;
      const wasPhase = ts.phase;
      clearLongPress();
      ts.pointers.delete(e.pointerId);
      releaseCapture(e);
      // End an in-flight item gesture cleanly (commit where it is).
      if (wasPhase === 'item') forwardMouse(e, 'mouseup', interactionsEl);
      // Palette drag: some browsers fire pointercancel when the touch leaves the
      // panel even with capture + touch-action:none. Treat a moved cancel over
      // the canvas as a drop so drag-from-panel still places (#1 robustness).
      if (wasPhase === 'palette') {
        const moved = exceedsTapSlop(ts.downScreen, {
          x: e.clientX,
          y: e.clientY
        });
        const rect = rendererEl?.getBoundingClientRect();
        const overCanvas =
          !!rect &&
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;
        if (moved && overCanvas) {
          forwardMouse(e, 'mousemove', interactionsEl);
          forwardMouse(e, 'mousedown', interactionsEl);
          forwardMouse(e, 'mouseup', interactionsEl);
        }
      }
      if (ts.pointers.size === 0) {
        ts.phase = 'idle';
        ts.itemDownTarget = null;
        ts.autoLasso = false;
      }
    };

    // True when the pointerdown landed on the canvas (the interactions box, a
    // node, an anchor — anything inside the Renderer container). Listeners are
    // on `window`, so we must NOT capture/engage for off-canvas presses
    // (toolbar/panel buttons) — capturing those would steal the click.
    const downOnCanvas = (e: PointerEvent): boolean => {
      const t = e.target as Node | null;
      return (
        !!rendererEl &&
        !!t &&
        (rendererEl === t || rendererEl.contains(t))
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      const kind = (e.pointerType || 'mouse') as PointerKind;
      pointerTypeRef.current = kind;
      const onCanvas = downOnCanvas(e);
      if (kind !== 'mouse') {
        if (onCanvas) {
          onTouchPointerDown(e);
        } else if (uiStateApi.getState().mode.type === 'PLACE_ICON') {
          // Off-canvas press while a placement is armed (Elements-panel icon) —
          // track it as a palette drag so a release over the canvas drops/places
          // the icon there. Other off-canvas touches (toolbar/panel buttons) are
          // left to the element's own compat mouse events.
          const ts = touchStateRef.current;
          ts.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          ts.phase = 'palette';
          ts.downScreen = { x: e.clientX, y: e.clientY };
          // Hide the preview ghost until the drag engages — without this it
          // paints at a stale tile the instant the icon is tapped (no hover on
          // touch). Cleared on the first palette move below.
          const placing = uiStateApi.getState().mode;
          if (placing.type === 'PLACE_ICON') {
            uiStateApi.getState().actions.setMode({
              ...placing,
              suppressPreview: true
            });
          }
        }
        return;
      }
      // Mouse path — unchanged press-drag-release. Capture only canvas-initiated
      // gestures (keeps isRendererInteraction true mid-drag); an off-canvas press
      // (e.g. an Elements-panel drag-to-place) is NOT captured so its events
      // still flow to window and the button/panel keeps working. Throws
      // harmlessly for synthetic e2e events (which already target the box).
      if (onCanvas && interactionsEl) {
        try {
          interactionsEl.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic / inactive pointer */
        }
      }
      onMouseEvent(toSlim(e, 'mousedown'));
    };

    const onPointerMove = (e: PointerEvent) => {
      const kind = (e.pointerType || 'mouse') as PointerKind;
      pointerTypeRef.current = kind;
      if (kind !== 'mouse') {
        onTouchPointerMove(e);
        return;
      }
      onMouseEvent(toSlim(e, 'mousemove'));
    };

    const onPointerUp = (e: PointerEvent) => {
      const kind = (e.pointerType || 'mouse') as PointerKind;
      pointerTypeRef.current = kind;
      if (kind !== 'mouse') {
        onTouchPointerUp(e);
        return;
      }
      onMouseEvent(toSlim(e, 'mouseup'));
      releaseCapture(e);
    };

    // pointercancel (OS reclaims the gesture: scroll/zoom/edge-swipe/app-switch).
    const onPointerCancel = (e: PointerEvent) => {
      const kind = (e.pointerType || 'mouse') as PointerKind;
      pointerTypeRef.current = kind;
      if (kind !== 'mouse') {
        onTouchPointerCancel(e);
        return;
      }
      // Mouse: end the gesture cleanly so no mode is left mid-drag.
      onMouseEvent(toSlim(e, 'mouseup'));
      releaseCapture(e);
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

    // One Pointer Events layer. The mouse `mousedown/move/up` listeners +
    // touch→mouse synthesis are GONE (REPLACE, not ADD) — `pointerType` carries
    // the device class natively, so the (0,0) drop bug and the synthesis layer
    // disappear by construction.
    //
    // Bound to `window`, NOT `rendererEl`. ADR 0018 specified the Renderer
    // container as the surface, but a mouse drag that STARTS off-canvas — the
    // Elements-panel drag-to-place, or a node drag released over a panel — takes
    // implicit pointer capture to the off-canvas element, so its move/up events
    // retarget there and bubble to `window`, never reaching `rendererEl`.
    // `setPointerCapture` (taken on the interactions box for canvas-initiated
    // gestures) cannot help a gesture the canvas never saw start. `window` is a
    // superset of the container, so it also covers the sibling anchor/label
    // SceneLayers the ADR's rendererEl correction cared about, and the
    // `isRendererInteraction` gate still scopes canvas reactions. The four CSS
    // guardrails stay on the container (Phase B). See the deviation note in the
    // tactical wrap-up. wheel/dragstart stay on `rendererEl` (canvas-scoped).
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('dblclick', onDoubleClick);
    rendererEl.addEventListener('wheel', onScroll, { passive: true });
    rendererEl.addEventListener('dragstart', onDragStart);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('dblclick', onDoubleClick);
      rendererEl.removeEventListener('wheel', onScroll);
      rendererEl.removeEventListener('dragstart', onDragStart);
      if (touchRaf !== null) cancelAnimationFrame(touchRaf);
      cleanup();
    };
  }, [
    modeType,
    onMouseEvent,
    onContextMenu,
    onDoubleClick,
    rendererEl,
    rendererSize,
    uiStateApi,
    screenToTile,
    cleanup
  ]);

  const setInteractionsElement = useCallback((element: HTMLElement) => {
    rendererRef.current = element;
  }, []);

  return {
    setInteractionsElement
  };
};
