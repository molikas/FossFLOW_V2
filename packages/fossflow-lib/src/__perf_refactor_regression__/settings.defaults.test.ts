/**
 * REGRESSION — Settings default values
 *
 * Guards against accidental changes to default settings that affect user
 * experience out of the box. Any change to these defaults is a UX decision
 * that should be intentional and visible in a test failure.
 */

import { DEFAULT_HOTKEY_PROFILE, HOTKEY_PROFILES } from 'src/config/hotkeys';
import { DEFAULT_PAN_SETTINGS } from 'src/config/panSettings';
import { DEFAULT_ZOOM_SETTINGS } from 'src/config/zoomSettings';

// ---------------------------------------------------------------------------
// Hotkey defaults
// ---------------------------------------------------------------------------
describe('Hotkey defaults', () => {
  it('DEFAULT_HOTKEY_PROFILE is smnrct', () => {
    expect(DEFAULT_HOTKEY_PROFILE).toBe('smnrct');
  });

  it('smnrct profile has correct key assignments', () => {
    expect(HOTKEY_PROFILES.smnrct.select).toBe('s');
    expect(HOTKEY_PROFILES.smnrct.pan).toBe('m');
    expect(HOTKEY_PROFILES.smnrct.addItem).toBe('n');
    expect(HOTKEY_PROFILES.smnrct.rectangle).toBe('r');
    expect(HOTKEY_PROFILES.smnrct.connector).toBe('c');
    expect(HOTKEY_PROFILES.smnrct.text).toBe('t');
    expect(HOTKEY_PROFILES.smnrct.lasso).toBe('l');
    expect(HOTKEY_PROFILES.smnrct.freehandLasso).toBe('f');
  });

  it('none profile has all null keys', () => {
    const noneKeys = Object.values(HOTKEY_PROFILES.none);
    expect(noneKeys.every((k) => k === null)).toBe(true);
  });

  it('all three profiles are defined (qwerty, smnrct, none)', () => {
    expect(HOTKEY_PROFILES.qwerty).toBeDefined();
    expect(HOTKEY_PROFILES.smnrct).toBeDefined();
    expect(HOTKEY_PROFILES.none).toBeDefined();
  });

  it('qwerty and smnrct have no null keys', () => {
    const qwertyKeys = Object.values(HOTKEY_PROFILES.qwerty);
    const smnrctKeys = Object.values(HOTKEY_PROFILES.smnrct);
    expect(qwertyKeys.every((k) => k !== null)).toBe(true);
    expect(smnrctKeys.every((k) => k !== null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pan settings defaults
// ---------------------------------------------------------------------------
describe('Pan settings defaults', () => {
  it('middleClickPan is true by default', () => {
    expect(DEFAULT_PAN_SETTINGS.middleClickPan).toBe(true);
  });

  it('rightClickPan is true by default', () => {
    expect(DEFAULT_PAN_SETTINGS.rightClickPan).toBe(true);
  });

  it('ctrlClickPan is false by default', () => {
    expect(DEFAULT_PAN_SETTINGS.ctrlClickPan).toBe(false);
  });

  it('altClickPan is false by default', () => {
    expect(DEFAULT_PAN_SETTINGS.altClickPan).toBe(false);
  });

  it('emptyAreaClickPan is false by default', () => {
    expect(DEFAULT_PAN_SETTINGS.emptyAreaClickPan).toBe(false);
  });

  it('arrowKeysPan is true by default', () => {
    expect(DEFAULT_PAN_SETTINGS.arrowKeysPan).toBe(true);
  });

  it('wasdPan is false by default', () => {
    expect(DEFAULT_PAN_SETTINGS.wasdPan).toBe(false);
  });

  it('keyboardPanSpeed is 20 by default', () => {
    expect(DEFAULT_PAN_SETTINGS.keyboardPanSpeed).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Zoom settings defaults
// ---------------------------------------------------------------------------
describe('Zoom settings defaults', () => {
  it('zoomToCursor is true by default', () => {
    expect(DEFAULT_ZOOM_SETTINGS.zoomToCursor).toBe(true);
  });
});
