/**
 * REGRESSION — ToolMenu: all tool names use i18n, not hardcoded English
 *
 * Before the fix every `name` prop was a hardcoded English string like
 * "Select (S)" or "Add item". After the fix they are template literals
 * built from `t('select')`, `t('addItem')` etc. so that switching the
 * app locale updates the tooltip text.
 *
 * This test reads ToolMenu.tsx source and asserts the structural changes
 * that make the localisation correct.
 */

import * as fs from 'fs';
import * as path from 'path';

const TOOL_MENU_PATH = path.resolve(
  __dirname,
  '../components/ToolMenu/ToolMenu.tsx'
);

describe('ToolMenu — i18n tool names', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(TOOL_MENU_PATH, 'utf-8');
  });

  it('ToolMenu.tsx exists', () => {
    expect(fs.existsSync(TOOL_MENU_PATH)).toBe(true);
  });

  it('imports useTranslation from localeStore', () => {
    expect(src).toContain("from 'src/stores/localeStore'");
    expect(src).toContain('useTranslation');
  });

  it('uses useTranslation("toolMenu") namespace', () => {
    expect(src).toContain("useTranslation('toolMenu')");
  });

  it('does not contain hardcoded English "Undo" name string', () => {
    // Old: name="Undo (Ctrl+Z)"
    // New: name={`${t('undo')} (Ctrl+Z)`}
    expect(src).not.toContain('name="Undo');
    expect(src).toContain("t('undo')");
  });

  it('does not contain hardcoded English "Select" name string', () => {
    expect(src).not.toContain('name="Select');
    expect(src).not.toContain('`Select${');
    expect(src).toContain("t('select')");
  });

  it('does not contain hardcoded "Lasso select" name string', () => {
    expect(src).not.toContain('`Lasso select${');
    expect(src).toContain("t('lassoSelect')");
  });

  it('does not contain hardcoded "Freehand lasso" name string', () => {
    expect(src).not.toContain('`Freehand lasso${');
    expect(src).toContain("t('freehandLasso')");
  });

  it('does not contain hardcoded "Pan" name string', () => {
    expect(src).not.toContain('`Pan${');
    expect(src).toContain("t('pan')");
  });

  it('does not contain hardcoded "Connector" name string', () => {
    expect(src).not.toContain('`Connector${');
    expect(src).toContain("t('connector')");
  });

  // Rectangle and Text buttons were moved to the Elements panel (left dock).
  // Add Item was removed entirely. These are intentionally absent from ToolMenu.
  it('does not contain removed tools (Rectangle, Text, Add Item)', () => {
    expect(src).not.toContain("t('rectangle')");
    expect(src).not.toContain("t('text')");
    expect(src).not.toContain("t('addItem')");
  });
});
