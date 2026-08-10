// Thin localStorage wrapper for user preferences.
// Errors are silently swallowed so a corrupt/missing entry never crashes the editor.

import type { ZoomSettings, LabelSettings } from 'src/types/settings';
import type { CanvasMode, ConnectorInteractionMode } from 'src/types/ui';

const STORAGE_KEY = 'axoview_user_settings';

// NOTE: a previously-persisted `panSettings` / `hotkeyProfile` key may still
// exist in a returning user's localStorage — it is simply ignored on load now
// (ADR 0022 §6), no migration needed.
export interface PersistedSettings {
  zoomSettings?: ZoomSettings;
  labelSettings?: LabelSettings;
  connectorInteractionMode?: ConnectorInteractionMode;
  expandLabels?: boolean;
  readableLabels?: boolean;
  canvasMode?: CanvasMode;
  snapToGrid?: boolean;
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

/**
 * F2/VIEW-08 (owner ruling 2026-07-30) — what a given editor mode is allowed to
 * persist.
 *
 * One shared `canvasMode` key. `/display` READS the stored value as its default,
 * so a viewer opens in whatever projection the editor last used — but a viewer
 * flipping iso↔2D to read someone else's diagram must not write it back and
 * reconfigure the authoring environment they open next. Editor persistence is
 * unchanged and there is no migration: the stored value is carried through
 * untouched from viewer mode.
 *
 * Scoped to the ONE key the ruling names. Suppressing the whole write in viewer
 * mode would silently drop a viewer's zoom and label preferences too, which are
 * theirs to keep.
 *
 * Returns `null` when nothing may be written at all (`NON_INTERACTIVE` — the
 * export dialog's hidden instance, ADR 0025).
 *
 * A function rather than a branch inside the effect so the rule can be pinned
 * without mounting the whole editor.
 */
export const persistableSettingsFor = (
  editorMode: string,
  settings: PersistedSettings,
  stored: PersistedSettings | null
): PersistedSettings | null => {
  if (editorMode === 'NON_INTERACTIVE') return null;
  if (editorMode === 'EXPLORABLE_READONLY') {
    return { ...settings, canvasMode: stored?.canvasMode };
  }
  return settings;
};
