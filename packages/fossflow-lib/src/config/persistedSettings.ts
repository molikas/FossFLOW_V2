// Thin localStorage wrapper for user preferences.
// Errors are silently swallowed so a corrupt/missing entry never crashes the editor.

import type {
  HotkeyProfile,
  PanSettings,
  ZoomSettings,
  LabelSettings
} from 'src/types/settings';
import type { CanvasMode, ConnectorInteractionMode } from 'src/types/ui';

const STORAGE_KEY = 'fossflow_user_settings';

export interface PersistedSettings {
  hotkeyProfile?: HotkeyProfile;
  panSettings?: PanSettings;
  zoomSettings?: ZoomSettings;
  labelSettings?: LabelSettings;
  connectorInteractionMode?: ConnectorInteractionMode;
  expandLabels?: boolean;
  canvasMode?: CanvasMode;
}

export const loadPersistedSettings = (): PersistedSettings | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedSettings) : null;
  } catch {
    return null;
  }
};

export const savePersistedSettings = (settings: PersistedSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage may be unavailable (SSR, private browsing quota exceeded, etc.)
  }
};
