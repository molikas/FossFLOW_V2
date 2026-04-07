// Re-export types from canonical location for backwards compatibility.
export type { HotkeyProfile, HotkeyMapping } from 'src/types/settings';
import type { HotkeyProfile, HotkeyMapping } from 'src/types/settings';

export const HOTKEY_PROFILES: Record<HotkeyProfile, HotkeyMapping> = {
  qwerty: {
    select: 'q',
    pan: 'w',
    addItem: 'e',
    rectangle: 'r',
    connector: 't',
    text: 'y',
    lasso: 'l',
    freehandLasso: 'f'
  },
  smnrct: {
    select: 's',
    pan: 'm',
    addItem: 'n',
    rectangle: 'r',
    connector: 'c',
    text: 't',
    lasso: 'l',
    freehandLasso: 'f'
  },
  none: {
    select: null,
    pan: null,
    addItem: null,
    rectangle: null,
    connector: null,
    text: null,
    lasso: null,
    freehandLasso: null
  }
};

export const DEFAULT_HOTKEY_PROFILE: HotkeyProfile = 'smnrct';
