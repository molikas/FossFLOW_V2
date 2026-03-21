/**
 * REGRESSION — Fixed shortcuts constants
 *
 * Guards against accidental changes to the non-configurable keyboard shortcut
 * strings used across HotkeySettings, HelpDialog, and useCopyPaste.
 * These are the shortcuts that CANNOT be customised by the user.
 */

import { FIXED_SHORTCUTS } from 'src/config/shortcuts';

describe('FIXED_SHORTCUTS constants', () => {
  it('copy is Ctrl+C', () => expect(FIXED_SHORTCUTS.copy).toBe('Ctrl+C'));
  it('paste is Ctrl+V', () => expect(FIXED_SHORTCUTS.paste).toBe('Ctrl+V'));
  it('undo is Ctrl+Z', () => expect(FIXED_SHORTCUTS.undo).toBe('Ctrl+Z'));
  it('redo is Ctrl+Y', () => expect(FIXED_SHORTCUTS.redo).toBe('Ctrl+Y'));
  it('redoAlt is Ctrl+Shift+Z', () => expect(FIXED_SHORTCUTS.redoAlt).toBe('Ctrl+Shift+Z'));
  it('help is F1', () => expect(FIXED_SHORTCUTS.help).toBe('F1'));

  it('all 6 keys are defined', () => {
    const keys = Object.keys(FIXED_SHORTCUTS);
    expect(keys).toHaveLength(6);
    expect(keys).toEqual(expect.arrayContaining(['copy', 'paste', 'undo', 'redo', 'redoAlt', 'help']));
  });
});
