import { Coords, Size, EditorModeEnum, MainMenuOptions } from './common';
import { Icon } from './model';
import { ItemReference } from './scene';
import {
  HotkeyProfile,
  PanSettings,
  ZoomSettings,
  LabelSettings
} from './settings';
import { IconPackManagerProps } from './isoflowProps';

interface AddItemControls {
  type: 'ADD_ITEM';
}

export type ItemControls = ItemReference | AddItemControls;

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

export const AnchorPositionOptions = {
  BOTTOM_LEFT: 'BOTTOM_LEFT',
  BOTTOM_RIGHT: 'BOTTOM_RIGHT',
  TOP_RIGHT: 'TOP_RIGHT',
  TOP_LEFT: 'TOP_LEFT'
} as const;

export type AnchorPosition = keyof typeof AnchorPositionOptions;

export interface TransformRectangleMode {
  type: 'RECTANGLE.TRANSFORM';
  showCursor: boolean;
  id: string;
  selectedAnchor: AnchorPosition | null;
}

export interface TextBoxMode {
  type: 'TEXTBOX';
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

export interface ContextMenu {
  type: 'ITEM' | 'EMPTY';
  item?: ItemReference;
  tile: Coords;
}

export type ConnectorInteractionMode = 'click' | 'drag';

export interface Notification {
  message: string;
  severity: 'info' | 'success' | 'warning';
}

export type CanvasMode = 'ISOMETRIC' | '2D';

export interface UiState {
  view: string;
  mainMenuOptions: MainMenuOptions;
  editorMode: keyof typeof EditorModeEnum;
  iconCategoriesState: IconCollectionState[];
  mode: Mode;
  dialog: keyof typeof DialogTypeEnum | null;
  isMainMenuOpen: boolean;
  itemControls: ItemControls | null;
  contextMenu: ContextMenu | null;
  zoom: number;
  scroll: Scroll;
  mouse: Mouse;
  rendererEl: HTMLDivElement | null;
  rendererSize: Size;
  enableDebugTools: boolean;
  hotkeyProfile: HotkeyProfile;
  panSettings: PanSettings;
  zoomSettings: ZoomSettings;
  labelSettings: LabelSettings;
  connectorInteractionMode: ConnectorInteractionMode;
  expandLabels: boolean;
  iconPackManager: IconPackManagerProps | null;
  notification: Notification | null;
  activeLeftTab: 'ELEMENTS' | 'LAYERS' | null;
  rightSidebarOpen: boolean;
  /** true when the right sidebar was opened automatically by node selection (not manually pinned) */
  rightSidebarAutoOpened: boolean;
  /** true when model has changed since last export-to-file or explicit save */
  isDirty: boolean;
  canvasMode: CanvasMode;
}

export interface UiStateActions {
  setView: (view: string) => void;
  setMainMenuOptions: (options: MainMenuOptions) => void;
  setEditorMode: (mode: keyof typeof EditorModeEnum) => void;
  setIconCategoriesState: (iconCategoriesState: IconCollectionState[]) => void;
  resetUiState: () => void;
  setMode: (mode: Mode) => void;
  incrementZoom: () => void;
  decrementZoom: () => void;
  setIsMainMenuOpen: (isOpen: boolean) => void;
  setDialog: (dialog: keyof typeof DialogTypeEnum | null) => void;
  setZoom: (zoom: number) => void;
  setScroll: (scroll: Scroll) => void;
  setItemControls: (itemControls: ItemControls | null) => void;
  setContextMenu: (contextMenu: ContextMenu | null) => void;
  setMouse: (mouse: Mouse) => void;
  setRendererEl: (el: HTMLDivElement) => void;
  setRendererSize: (size: Size) => void;
  setEnableDebugTools: (enabled: boolean) => void;
  setHotkeyProfile: (profile: HotkeyProfile) => void;
  setPanSettings: (settings: PanSettings) => void;
  setZoomSettings: (settings: ZoomSettings) => void;
  setLabelSettings: (settings: LabelSettings) => void;
  setConnectorInteractionMode: (mode: ConnectorInteractionMode) => void;
  setExpandLabels: (expand: boolean) => void;
  setIconPackManager: (iconPackManager: IconPackManagerProps | null) => void;
  setNotification: (notification: Notification | null) => void;
  setActiveLeftTab: (tab: 'ELEMENTS' | 'LAYERS' | null) => void;
  setRightSidebarOpen: (open: boolean) => void;
  setIsDirty: (isDirty: boolean) => void;
  setCanvasMode: (mode: CanvasMode) => void;
}

export type UiStateStore = UiState & {
  actions: UiStateActions;
};
