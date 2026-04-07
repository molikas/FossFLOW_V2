// Re-export type from canonical location for backwards compatibility.
export type { ZoomSettings } from 'src/types/settings';
import type { ZoomSettings } from 'src/types/settings';

export const DEFAULT_ZOOM_SETTINGS: ZoomSettings = {
  zoomToCursor: true
};
