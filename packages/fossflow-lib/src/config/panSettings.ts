// Re-export type from canonical location for backwards compatibility.
export type { PanSettings } from 'src/types/settings';
import type { PanSettings } from 'src/types/settings';

export const DEFAULT_PAN_SETTINGS: PanSettings = {
  middleClickPan: true,
  rightClickPan: true,
  ctrlClickPan: false,
  altClickPan: false,
  emptyAreaClickPan: false,
  arrowKeysPan: true,
  wasdPan: false,
  ijklPan: false,
  keyboardPanSpeed: 20
};
