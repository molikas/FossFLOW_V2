// Settings type definitions — kept here so all types are centrally located in /types/.
// Default values live in /config/hotkeys.ts, /config/panSettings.ts, etc.

export type HotkeyProfile = 'qwerty' | 'smnrct' | 'none';

export interface HotkeyMapping {
  select: string | null;
  pan: string | null;
  addItem: string | null;
  rectangle: string | null;
  connector: string | null;
  text: string | null;
  lasso: string | null;
  freehandLasso: string | null;
}

export interface PanSettings {
  middleClickPan: boolean;
  rightClickPan: boolean;
  ctrlClickPan: boolean;
  altClickPan: boolean;
  emptyAreaClickPan: boolean;
  arrowKeysPan: boolean;
  wasdPan: boolean;
  ijklPan: boolean;
  keyboardPanSpeed: number;
}

export interface ZoomSettings {
  zoomToCursor: boolean;
}

export interface LabelSettings {
  expandButtonPadding: number;
}
