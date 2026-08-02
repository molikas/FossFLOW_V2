import { Coords, Size, EditorModeEnum } from './common';
import { Icon, Connector } from './model';
import { ItemReference } from './scene';
import { ZoomSettings, LabelSettings } from './settings';
import { IconPackManagerProps, IconUsageScan } from './axoviewProps';

interface AddItemControls {
  type: 'ADD_ITEM';
}

export type ItemControls =
  | (ItemReference & { tile?: Coords })
  | AddItemControls;

export interface Mouse {
  position: {
    screen: Coords;
    tile: Coords;
  };
  mousedown: {
    screen: Coords;
    tile: Coords;
  } | null;
  delta: {
    screen: Coords;
    tile: Coords;
  } | null;
  /**
   * Most recent keyboard modifiers seen on a canvas mouse event. Optional so
   * existing test mocks that construct a Mouse object continue to compile.
   * Mode actions read this to branch on Ctrl/Shift/Meta without needing the
   * event passed through every layer.
   */
  modifiers?: {
    ctrl: boolean;
    shift: boolean;
    meta: boolean;
    alt: boolean;
  };
  /**
   * data-anchor-id of the DOM element under the cursor, if any. Captured by
   * useInteractionManager from each mouse event's target so mode actions can
   * identify the clicked connector anchor by id rather than by tile match
   * (the tile match is fragile near boundaries and at low zoom).
   */
  targetAnchorId?: string | null;
}

// Mode types
export interface InteractionsDisabled {
  type: 'INTERACTIONS_DISABLED';
  showCursor: boolean;
}

export interface CursorMode {
  type: 'CURSOR';
  showCursor: boolean;
  mousedownItem: ItemReference | null;
  mousedownHandled?: boolean;
}

export interface DragItemsMode {
  type: 'DRAG_ITEMS';
  showCursor: boolean;
  items: ItemReference[];
  initialTiles: Record<string, Coords>; // nodes + textboxes: id -> tile at drag start
  initialRectangles: Record<string, { from: Coords; to: Coords }>; // rectangles: id -> bounds at drag start
}

export interface PanMode {
  type: 'PAN';
  showCursor: boolean;
}

export interface PlaceIconMode {
  type: 'PLACE_ICON';
  showCursor: boolean;
  id: string | null;
  /**
   * Touch only: hide the drag-preview ghost until the drag actually engages.
   * On touch there is no hover, so an armed placement would otherwise paint the
   * ghost at a stale tile the moment the panel icon is tapped (before any drag).
   * The touch machine sets this true on palette-arm and clears it on first move.
   * Undefined on desktop (hover keeps the preview position fresh), so the ghost
   * shows as before.
   */
  suppressPreview?: boolean;
}

export interface ConnectorMode {
  type: 'CONNECTOR';
  showCursor: boolean;
  id: string | null;
  // For click-based connection mode
  startAnchor?: {
    tile?: Coords;
    itemId?: string;
  };
  isConnecting?: boolean;
  // When true, completing a connection returns to CURSOR mode instead of staying in CONNECTOR
  returnToCursor?: boolean;
}

export interface DrawRectangleMode {
  type: 'RECTANGLE.DRAW';
  showCursor: boolean;
  id: string | null;
}

// Four corner anchors — these are the ones convertBoundsToNamedAnchors emits.
export const CornerAnchorPositionOptions = {
  BOTTOM_LEFT: 'BOTTOM_LEFT',
  BOTTOM_RIGHT: 'BOTTOM_RIGHT',
  TOP_RIGHT: 'TOP_RIGHT',
  TOP_LEFT: 'TOP_LEFT'
} as const;

export type CornerAnchorPosition = keyof typeof CornerAnchorPositionOptions;

// Four edge-midpoint anchors (ADR 0026) — each resizes one axis, the
// opposite edge stays fixed.
export const EdgeAnchorPositionOptions = {
  TOP: 'TOP',
  RIGHT: 'RIGHT',
  BOTTOM: 'BOTTOM',
  LEFT: 'LEFT'
} as const;

export const AnchorPositionOptions = {
  ...CornerAnchorPositionOptions,
  ...EdgeAnchorPositionOptions
} as const;

export type AnchorPosition = keyof typeof AnchorPositionOptions;

export interface TransformRectangleMode {
  type: 'RECTANGLE.TRANSFORM';
  showCursor: boolean;
  id: string;
  selectedAnchor: AnchorPosition | null;
}

// Width-only text-box resize (ADR 0034 addendum 2026-07-03): the two anchors
// on the text-run axis set a manual `textBox.width`; height stays
// content-driven (text wraps, box grows down).
export interface TransformTextBoxMode {
  type: 'TEXTBOX.TRANSFORM';
  showCursor: boolean;
  id: string;
  selectedAnchor: AnchorPosition | null;
}

// On-canvas icon resize (ADR 0044): drag a corner handle to set per-node
// `iconScale`. `targets` is one node (single-select) or every node in a
// homogeneous group (group-resize). mousemove derives a single uniform scale
// FACTOR from the screen-drag delta and applies it to each target's own
// startScale (per-node override ?? shared asset scale ?? 1) — so relative sizes
// are preserved across a group — previewing via uiState.iconScaleDrag (no
// per-frame model write). Corner anchors only; uniform scale about the centre.
export interface NodeTransformMode {
  type: 'NODE.TRANSFORM';
  showCursor: boolean;
  selectedAnchor: AnchorPosition | null;
  // One entry per node being resized — 1 for a single node, N for a group.
  targets: { id: string; startScale: number }[];
}

export interface TextBoxMode {
  type: 'TEXTBOX';
  showCursor: boolean;
  id: string | null;
}

// Armed floating-Label placement (ADR 0031) — its own mode, not a TextBox
// variant. The Common deck arms it; the next canvas click drops a Label.
export interface LabelMode {
  type: 'LABEL';
  showCursor: boolean;
  id: string | null;
}

export interface LassoMode {
  type: 'LASSO';
  showCursor: boolean;
  selection: {
    startTile: Coords;
    endTile: Coords;
    items: ItemReference[];
  } | null;
  isDragging: boolean;
}

export interface FreehandLassoMode {
  type: 'FREEHAND_LASSO';
  showCursor: boolean;
  path: Coords[]; // Screen coordinates of the drawn path
  selection: {
    pathTiles: Coords[]; // Tile coordinates of the path points
    items: ItemReference[];
  } | null;
  isDragging: boolean;
}

export interface ReconnectAnchorMode {
  type: 'RECONNECT_ANCHOR';
  showCursor: boolean;
  connectorId: string;
  anchorId: string;
  anchorIndex: number;
}

export type Mode =
  | InteractionsDisabled
  | CursorMode
  | PanMode
  | PlaceIconMode
  | ConnectorMode
  | DrawRectangleMode
  | TransformRectangleMode
  | DragItemsMode
  | TextBoxMode
  | TransformTextBoxMode
  | NodeTransformMode
  | LabelMode
  | LassoMode
  | FreehandLassoMode
  | ReconnectAnchorMode;
// End mode types

export interface Scroll {
  position: Coords;
  offset: Coords;
}

export interface IconCollectionState {
  id?: string;
  isExpanded: boolean;
}

export type IconCollectionStateWithIcons = IconCollectionState & {
  icons: Icon[];
};

export const DialogTypeEnum = {
  EXPORT_IMAGE: 'EXPORT_IMAGE',
  HELP: 'HELP',
  SETTINGS: 'SETTINGS'
} as const;

export type ConnectorInteractionMode = 'click' | 'drag';

// Pre-draw style applied to the next connector (and edited live on the selected
// one). A subset of the connector model — only the appearance fields the top-bar
// controls expose.
export type ConnectorDefaults = Partial<
  Pick<
    Connector,
    'color' | 'customColor' | 'style' | 'lineType' | 'width' | 'showArrow'
  >
>;

export interface Notification {
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error';
}

export type CanvasMode = 'ISOMETRIC' | '2D';

export interface UiState {
  view: string;
  editorMode: keyof typeof EditorModeEnum;
  iconCategoriesState: IconCollectionState[];
  /**
   * Ids of icon categories that became visible during the most recent
   * incremental load (e.g. a pack toggled on from the "Add more icons" panel).
   * Drives the soft pulse on the category header so users notice freshly-arrived
   * icons. Cleared on a short timer after the animation runs.
   */
  freshlyLoadedCategoryIds: string[];
  mode: Mode;
  dialog: keyof typeof DialogTypeEnum | null;
  itemControls: ItemControls | null;
  /**
   * Persistent multi-selection on the canvas. Single source of truth for which
   * items are selected. Invariant: when length === 1, itemControls mirrors the
   * single selected item; when 0 or > 1, itemControls is null. See ADR-0006.
   */
  selectedIds: ItemReference[];
  /**
   * A3 hover affordance: the item under the cursor in CURSOR/EDITABLE mode (or
   * null). Drives a faint hover outline (HoverOutline). Updated by the Cursor
   * hover path ONLY when the hovered ref changes, so it doesn't churn per tile.
   */
  hoveredItem: ItemReference | null;
  zoom: number;
  scroll: Scroll;
  mouse: Mouse;
  rendererEl: HTMLDivElement | null;
  rendererSize: Size;
  /**
   * Set by the loader when a diagram open requested fit-to-view but the renderer
   * wasn't measured yet (first mount — Axoview renders null until isReady, so
   * rendererEl is 0-sized and a fit computed there yields zoom 0). A deferred
   * effect in Renderer applies the fit once rendererSize is known, then clears
   * this. See useInitialDataManager.
   */
  pendingFitToView: boolean;
  enableDebugTools: boolean;
  zoomSettings: ZoomSettings;
  labelSettings: LabelSettings;
  connectorInteractionMode: ConnectorInteractionMode;
  /**
   * Pending style for the NEXT connector drawn (sticky for the session). The
   * top-bar connector controls edit this when the connector tool is armed with
   * nothing selected, so line colour/style/type/width/arrow can be set BEFORE
   * drawing. createConnectorAt applies it to each new connector.
   */
  connectorDefaults: ConnectorDefaults;
  expandLabels: boolean;
  /**
   * Opt-in "keep labels readable" toggle (ADR 0015). When on, node name labels
   * counter-scale up to a legible floor below a zoom threshold so they stay
   * readable when zoomed out. Off by default; persisted across reload.
   */
  readableLabels: boolean;
  iconPackManager: IconPackManagerProps | null;
  iconUsageScan: IconUsageScan | null;
  linkedDiagrams: Array<{ id: string; name: string }>;
  notification: Notification | null;
  activeLeftTab: 'ELEMENTS' | 'LAYERS' | null;
  rightSidebarOpen: boolean;
  /** true when the right sidebar was opened automatically by node selection (not manually pinned) */
  rightSidebarAutoOpened: boolean;
  /**
   * Canvas context menu (ADR 0027) — the per-item / empty-canvas command
   * surface. `null` = closed. Opened by a right-click TAP (mouse) or a touch
   * long-press; right-DRAG pans instead (ADR 0022 §1). `target` is the item the
   * menu acts on, or `null` for the empty-canvas menu. `anchor` is screen-space
   * (client px) — the MUI Menu portals to the document root, so no §8.8
   * counter-scale is needed.
   */
  contextMenu: ContextMenuState | null;
  /** true when model has changed since last export-to-file or explicit save */
  isDirty: boolean;
  canvasMode: CanvasMode;
  /**
   * Global snap-to-grid toggle (ADR 0023, #12). Default true; persisted,
   * mirroring `canvasMode`. The default for new placements/drags — when false
   * they commit a px offset instead of rounding to the integer tile. Per-item
   * `snap` (on the view item) overrides this for individual items (#20).
   */
  snapToGrid: boolean;
  /**
   * Preview-mode (EXPLORABLE_READONLY) layer visibility override (ADR 0013).
   * A UI-only override that never mutates the model's `layer.visible` and is
   * never persisted/saved — presenting a diagram can't dirty it. Cleared when
   * leaving preview or switching view. Ignored entirely in EDITABLE.
   */
  previewLayerOverrides: PreviewLayerOverrides;
  /**
   * GLOBAL "hide labels" flag (bottom-dock zoom cluster, both editing and
   * presentation). A UI-only toggle that hides node + connector *name* labels —
   * it never mutates the model's per-item `showLabel` and is never
   * persisted/saved (so it can't dirty the diagram). Persists across view/mode
   * switches (a session-wide view preference). The label render sites merge it
   * through `isLabelVisibleInPreview`. (Name kept for back-compat; it is no
   * longer preview-only.)
   */
  previewHideLabels: boolean;
  /**
   * View-only (EXPLORABLE_READONLY) "hide all controls" flag. A UI-only toggle
   * that hides the on-canvas presentation chrome (layer switcher, annotation
   * palette, bottom dock) for a clean screenshot. Never persisted; cleared on
   * mode switch.
   */
  hideViewControls: boolean;
  /**
   * Image-export "hide labels" flag (ADR 0025 §3). UI-only and scoped to the
   * export dialog's hidden Axoview instance (each Axoview has its own store), so
   * it never affects the live canvas. When true, node + connector *name* labels
   * are suppressed in the exported image without touching the model's per-item
   * `showLabel`. Merged at the same render sites as `previewHideLabels`.
   */
  exportHideLabels: boolean;
  /**
   * Transient on-canvas label-drag preview (ADR 0024 — Track P T6 fix). While a
   * canvas (unselected) node's NAME label is being dragged via NodeLabelHitLayer,
   * this holds the node id + the live signed `labelHeight`. It promotes that node
   * into the DOM overlay (Renderer.hybridIds) so the label follows the pointer as
   * a single-node DOM re-render (CSS preview), NOT a per-frame model write that
   * would redraw every visible canvas node. UI-only, never persisted; the model
   * is written ONCE on release. Null when no label drag is in flight.
   */
  labelDrag: { id: string; height: number } | null;
  /**
   * Transient floating-Label move preview (ADR 0031). While a Label is dragged
   * via LabelHitLayer this holds its id + the live tile/offset, so LabelsCanvas
   * redraws the chip following the pointer WITHOUT a per-frame model write
   * (which would re-render every hit-proxy div). UI-only, never persisted; the
   * model position is committed ONCE on release. Null when no move is in flight.
   */
  labelMove: { id: string; tile: Coords; offset?: Coords } | null;
  /**
   * Transient GROUP move-preview for floating labels (ADR 0031). A single-label
   * drag uses `labelMove` (LabelHitLayer); a MULTI-selection drag moves through
   * DragItems, where nodes/rectangles/text boxes get a CSS `--ff-drag-*` preview
   * on their DOM wrapper — but a label is canvas-drawn (LabelsCanvas) with no DOM
   * element to translate, so without this channel the label sat frozen until the
   * mouseup commit ("the label doesn't move when I drag the selection"). Keyed by
   * label id → its preview tile + off-grid offset; LabelsCanvas redraws each keyed
   * chip at that position. UI-only, never persisted; committed once on release.
   * Null when no group drag is in flight.
   */
  labelMoves: Record<string, { tile: Coords; offset?: Coords }> | null;
  /**
   * Transient on-canvas icon-resize preview (ADR 0044). While node icons are
   * being resized via the corner handles (NODE.TRANSFORM), this holds a map of
   * node id → live iconScale (one entry for a single node, N for a group), so
   * the resized nodes (DOM) and their selection rings follow the drag WITHOUT a
   * per-frame model write (which would rebuild the O(N) WebGL node bulk every
   * frame — canvas-interaction.md §6.1/§6.4). UI-only, never persisted; the
   * model `iconScale` is committed ONCE on release. Null when no resize is in
   * flight.
   */
  iconScaleDrag: { scales: Record<string, number> } | null;
  /**
   * The currently-selected connector label (a `labels[]` entry), so the top-bar
   * style strip can target ONE label's text size/colour and the canvas can
   * highlight it. `connectorId` scopes the selection so a stale id from a
   * previous connector is ignored. Cleared whenever the selected item changes.
   * UI-only, never persisted.
   */
  selectedConnectorLabel: { connectorId: string; labelId: string } | null;
  /**
   * The floating Label (ADR 0031) currently being inline-edited on canvas (via
   * double-click or F2), or null. While set, LabelsCanvas skips painting that
   * label (the DOM contentEditable in LabelHitLayer takes over) so the text
   * isn't drawn twice. UI-only, never persisted.
   */
  inlineEditLabelId: string | null;
  /**
   * The layer new elements are placed onto (F4/LAY-03), or null for the
   * unassigned bucket. Set by selecting a row in the Layers panel; cleared
   * when that layer is deleted or the active view changes, so a stale id can
   * never be stamped onto a new entity (the E2/RED-03 dangling-reference
   * class). UI-only, never persisted.
   */
  activeLayerId: string | null;
  /**
   * The floating-Label chip hovered in VIEW mode (EXPLORABLE_READONLY), or
   * null. Labels are deliberately absent from the tile hit-test
   * (hitDetection.ts — ADR 0031 §4: the DOM proxy layer owns label hits), so
   * the ViewModeInfoPopover's tile-based hover path can never see a chip;
   * LabelHitLayer's view-mode hover proxies publish the hovered chip here
   * instead, and a hovered chip WINS over the tile hit (chips paint above the
   * canvas layers). UI-only, never persisted; always null in EDITABLE.
   */
  viewModeHoveredLabelId: string | null;
  /** The text box currently being edited inline on canvas (ADR 0034), or null.
   *  Store-based (not a one-shot event) so place-and-type can't race the newly
   *  created box's mount. While set, the Renderer promotes that box ABOVE the
   *  interactions box so the editor receives pointer events, and the strip's
   *  text controls target the live editor. Cleared on commit/cancel. UI-only,
   *  never persisted. */
  editingTextBoxId: string | null;
  /** Live tile footprint of the text box being edited (ADR 0034 addendum
   *  2026-07-04): what commit WOULD measure for the current draft (placeholder
   *  included while empty), so the projected container and the transform
   *  bounds track typing instead of showing the stale committed size. null
   *  outside a session or before the editor's first measure. UI-only. */
  editingTextBoxSize: Size | null;
  /** Ephemeral annotation overlay (ADR 0014). Never persisted. */
  annotation: AnnotationState;
}

/** Canvas context-menu state (ADR 0027). */
export interface ContextMenuState {
  /** Screen-space anchor (client px) for the MUI Menu's anchorPosition. */
  anchor: { x: number; y: number };
  /**
   * Which command set to show:
   *  - `'item'`   → single-item menu (`target` set);
   *  - `'multi'`  → bulk menu over the current `selectedIds` (`target` null);
   *  - `'canvas'` → empty-canvas menu (`target` null).
   */
  variant: 'item' | 'multi' | 'canvas';
  /** The item the menu commands act on; set only for the `'item'` variant. */
  target: ItemReference | null;
  /**
   * The tile under the cursor when the menu opened. Used by connector "Add
   * label" so the new label lands where the user clicked, not at the midpoint.
   */
  tile?: Coords;
}

/** UI-only preview layer override (ADR 0013). */
export interface PreviewLayerOverrides {
  /** Layers the presenter has toggled off (subtracted from `layer.visible`). */
  hiddenLayerIds: string[];
  /** When set, only this layer is shown (solo wins over hidden + layer.visible). */
  soloLayerId: string | null;
}

// --- Ephemeral annotation overlay (ADR 0014) --------------------------------

/**
 * Annotation tool modes. `select` is the pass-through mode — the overlay does
 * not capture pointer input, so the canvas stays interactive (Excalidraw-style
 * tool strip). `eraser` removes a whole stroke; the rest draw.
 */
export type AnnotationTool =
  | 'select'
  | 'pencil'
  | 'highlighter'
  | 'line'
  | 'arrow'
  | 'rectangle'
  | 'ellipse'
  | 'eraser';

/** A single annotation stroke, stored in scene-canvas coordinates. */
export interface AnnotationStroke {
  id: string;
  tool: Exclude<AnnotationTool, 'select' | 'eraser'>;
  color: string;
  thickness: number;
  /** Scene-canvas points: freehand = many; line/arrow/shapes = [start, end]. */
  points: Coords[];
}

/**
 * One undoable annotation operation (F2/VIEW-07, VIEW-13).
 *
 * The overlay used to keep two plain stroke stacks, which can only model
 * "draw / un-draw at the tail". An erase is a delete at an ARBITRARY index and
 * had no representation in that model, so erasing the middle stroke and
 * pressing Undo ate the last one instead — and there was no way to get the
 * erased stroke back at all. Clear had no representation either.
 *
 * Each op therefore carries what it did AND where, so it can be inverted in
 * place: `index` is the position the stroke occupied (erase) or was appended at
 * (add), and `clear` keeps the whole list it removed.
 */
export type AnnotationOp =
  | { kind: 'add'; stroke: AnnotationStroke; index: number }
  | { kind: 'erase'; stroke: AnnotationStroke; index: number }
  | { kind: 'clear'; strokes: AnnotationStroke[] };

/**
 * Ephemeral annotation state (ADR 0014). Session-scoped, in-memory, and
 * **never** persisted — it lives only in uiState, never in the Model, so no
 * save/export/zip path can reach it. `open` is the single pen-driven toggle:
 * open ⇒ palette + drawing shown; closed ⇒ both hidden but strokes retained
 * (close ≠ discard; only Clear wipes). `tool` decides whether the overlay
 * captures input (`select` = canvas interactive).
 *
 * Session-scoped means scoped to the CONTENT, not to the tab: the strokes are
 * cleared when the canvas underneath them changes identity — a diagram load or
 * a page switch (F2/VIEW-01/02) — because scene-canvas coordinates mean nothing
 * against different content. An edit↔present toggle keeps them, which is the
 * case `setEditorMode` was always right about.
 */
export interface AnnotationState {
  open: boolean;
  tool: AnnotationTool;
  color: string;
  thickness: number;
  strokes: AnnotationStroke[];
  /** Operations that can be undone, oldest first. */
  past: AnnotationOp[];
  /** Operations that can be redone, most-recently-undone first. */
  future: AnnotationOp[];
}

export interface UiStateActions {
  setView: (view: string) => void;
  setEditorMode: (mode: keyof typeof EditorModeEnum) => void;
  setIconCategoriesState: (iconCategoriesState: IconCollectionState[]) => void;
  setFreshlyLoadedCategoryIds: (ids: string[]) => void;
  resetUiState: () => void;
  setMode: (mode: Mode) => void;
  incrementZoom: () => void;
  decrementZoom: () => void;
  setDialog: (dialog: keyof typeof DialogTypeEnum | null) => void;
  setZoom: (zoom: number) => void;
  setScroll: (scroll: Scroll) => void;
  /**
   * Sets the item the right Properties panel + action bar target.
   *
   * `options.openPanel` (default `true`) mounts the Properties dock — the
   * explicit "open details" gesture (double-click / panel events / layer-row
   * double-click). Pass `false` for **select-only** (ADR 0022 §3): the panel
   * target + action bar update, but the dock is NOT mounted. Passing `null`
   * always clears.
   */
  /** A3: set/clear the hovered item that drives the faint hover outline. */
  setHoveredItem: (ref: ItemReference | null) => void;
  setItemControls: (
    itemControls: ItemControls | null,
    options?: { openPanel?: boolean }
  ) => void;
  /**
   * Replaces the current canvas selection. Internally derives itemControls
   * (single-item case) or clears it (empty / multi-select). Per ADR 0022 §3 a
   * single selection drives highlight + action bar only — it no longer mounts
   * the Properties panel (that is the double-click / setItemControls path).
   */
  setSelectedIds: (ids: ItemReference[]) => void;
  /** Adds the item if absent, removes it if present. Updates itemControls accordingly. */
  toggleSelected: (ref: ItemReference) => void;
  /** Convenience: clears selectedIds and itemControls. */
  clearSelection: () => void;
  setMouse: (mouse: Mouse) => void;
  setRendererEl: (el: HTMLDivElement) => void;
  setRendererSize: (size: Size) => void;
  /** Flag/clear a deferred fit-to-view (applied once the renderer is measured). */
  setPendingFitToView: (pending: boolean) => void;
  setEnableDebugTools: (enabled: boolean) => void;
  setZoomSettings: (settings: ZoomSettings) => void;
  setLabelSettings: (settings: LabelSettings) => void;
  setConnectorInteractionMode: (mode: ConnectorInteractionMode) => void;
  /** Merge a patch into the pending connector style (next-drawn defaults). */
  setConnectorDefaults: (patch: ConnectorDefaults) => void;
  /**
   * Clear the pending connector style so the NEXT draw uses the baseline (#8,
   * 2026-07-01). A set style applies to exactly one connector, then resets —
   * matching rect/text/label (no sticky last-used style).
   */
  resetConnectorDefaults: () => void;
  setExpandLabels: (expand: boolean) => void;
  setReadableLabels: (readable: boolean) => void;
  /** Toggle a layer's preview visibility override (no-op on the model). */
  togglePreviewLayerHidden: (layerId: string) => void;
  /** Solo a layer in preview (pass the current solo id again, or null, to clear). */
  setPreviewSoloLayer: (layerId: string | null) => void;
  /** Reset all preview layer overrides (e.g. on leaving preview / view switch). */
  clearPreviewLayerOverrides: () => void;
  /** Set the global hide-labels flag (UI-only; never touches the model). */
  setPreviewHideLabels: (hide: boolean) => void;
  /** Set the view-only "hide all controls" flag (UI-only; cleared on mode switch). */
  setHideViewControls: (hide: boolean) => void;
  /** Set the image-export hide-labels flag (UI-only; export-scoped store). */
  setExportHideLabels: (hide: boolean) => void;
  /** Begin / update the transient on-canvas label-drag preview (ADR 0024 T6 fix). */
  setLabelDrag: (id: string, height: number) => void;
  /** End the label-drag preview (the model labelHeight is committed separately, once). */
  clearLabelDrag: () => void;
  /** Begin / update the transient floating-Label move preview (ADR 0031). */
  setLabelMove: (id: string, tile: Coords, offset?: Coords) => void;
  /** End the label-move preview (the model tile/offset is committed separately, once). */
  clearLabelMove: () => void;
  /** Begin / update the transient GROUP floating-Label move preview (ADR 0031) —
   *  the multi-selection-drag counterpart of setLabelMove. */
  setLabelMoves: (
    moves: Record<string, { tile: Coords; offset?: Coords }>
  ) => void;
  /** End the group label-move preview (tiles/offsets committed separately, once). */
  clearLabelMoves: () => void;
  /** Begin / update the transient on-canvas icon-resize preview (ADR 0044).
   *  Pass a map of node id → previewed scale (one entry, or N for a group). */
  setIconScaleDrag: (scales: Record<string, number>) => void;
  /** End the icon-resize preview (the model iconScale is committed separately, once). */
  clearIconScaleDrag: () => void;
  /** Select (or clear) the connector label the top-bar style strip targets. */
  setSelectedConnectorLabel: (
    sel: { connectorId: string; labelId: string } | null
  ) => void;
  /** Enter / leave inline-edit for a floating Label (double-click / F2). */
  setInlineEditLabelId: (id: string | null) => void;
  setActiveLayerId: (id: string | null) => void;
  /** Publish / clear the view-mode hovered Label chip (LabelHitLayer →
   *  ViewModeInfoPopover; see `viewModeHoveredLabelId`). */
  setViewModeHoveredLabelId: (id: string | null) => void;
  /** Enter (id) / leave (null) the on-canvas rich-text edit session for a text
   *  box (ADR 0034). Set by place-and-type, double-click, F2 and context-menu
   *  Rename; cleared by the editor's commit/cancel. */
  setEditingTextBoxId: (id: string | null) => void;
  /** Publish the edit session's live measured footprint (see
   *  `editingTextBoxSize`). Reset to null whenever the session id changes. */
  setEditingTextBoxSize: (size: Size | null) => void;
  // --- Annotation overlay (ADR 0014) ---
  setAnnotationOpen: (open: boolean) => void;
  setAnnotationTool: (tool: AnnotationTool) => void;
  setAnnotationColor: (color: string) => void;
  setAnnotationThickness: (thickness: number) => void;
  addAnnotationStroke: (stroke: AnnotationStroke) => void;
  undoAnnotationStroke: () => void;
  redoAnnotationStroke: () => void;
  eraseAnnotationStroke: (id: string) => void;
  clearAnnotations: () => void;
  /**
   * F2/VIEW-03 — re-map every stored annotation point through `mapPoint`, so
   * the ink follows the content across an iso<->2D switch. Applied to the live
   * strokes and to the operation log alike.
   */
  reprojectAnnotationStrokes: (mapPoint: (point: Coords) => Coords) => void;
  setIconPackManager: (iconPackManager: IconPackManagerProps | null) => void;
  setIconUsageScan: (scan: IconUsageScan | null) => void;
  setLinkedDiagrams: (diagrams: Array<{ id: string; name: string }>) => void;
  setNotification: (notification: Notification | null) => void;
  setActiveLeftTab: (tab: 'ELEMENTS' | 'LAYERS' | null) => void;
  setRightSidebarOpen: (open: boolean) => void;
  /** Open the canvas context menu (ADR 0027). */
  openContextMenu: (menu: ContextMenuState) => void;
  /** Close the canvas context menu. */
  closeContextMenu: () => void;
  setIsDirty: (isDirty: boolean) => void;
  setCanvasMode: (mode: CanvasMode) => void;
  /** Set the global snap-to-grid flag (persisted, mirrors setCanvasMode). */
  setSnapToGrid: (snap: boolean) => void;
  /** Flip the global snap-to-grid flag (canvas context-menu entry, #12). */
  toggleSnapToGrid: () => void;
}

export type UiStateStore = UiState & {
  actions: UiStateActions;
};
