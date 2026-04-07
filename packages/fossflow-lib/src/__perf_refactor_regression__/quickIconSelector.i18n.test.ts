/**
 * REGRESSION — QuickIconSelector: hardcoded strings replaced with i18n
 *
 * Before the fix these were hardcoded in JSX:
 *   "RECENTLY USED"
 *   "SEARCH RESULTS ({n} icons)"
 *   "No icons found matching "{term}""
 *   "Type to search • Click category to expand • Double-click to select and close"
 *   "Use arrow keys to navigate • Enter to select • Double-click to select and close"
 *   placeholder="Search icons (press Enter to select)"
 *
 * After the fix they all go through useTranslation('quickIconSelector').
 * Interpolation is done via .replace() since the lib's t() does not
 * support interpolation params.
 */

import * as fs from 'fs';
import * as path from 'path';

const QIS_PATH = path.resolve(
  __dirname,
  '../components/ItemControls/NodeControls/QuickIconSelector.tsx'
);

describe('QuickIconSelector — i18n strings', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(QIS_PATH, 'utf-8');
  });

  it('QuickIconSelector.tsx exists', () => {
    expect(fs.existsSync(QIS_PATH)).toBe(true);
  });

  it('imports useTranslation from localeStore', () => {
    expect(src).toContain("from 'src/stores/localeStore'");
    expect(src).toContain('useTranslation');
  });

  it('uses useTranslation("quickIconSelector") namespace', () => {
    expect(src).toContain("useTranslation('quickIconSelector')");
  });

  it('does not contain hardcoded "RECENTLY USED" string', () => {
    expect(src).not.toContain('RECENTLY USED');
    expect(src).toContain("t('recentlyUsed')");
  });

  it('does not contain hardcoded "SEARCH RESULTS" string', () => {
    expect(src).not.toContain('SEARCH RESULTS (');
    expect(src).toContain("t('searchResults')");
  });

  it('does not contain hardcoded "No icons found matching" string', () => {
    expect(src).not.toContain('No icons found matching');
    expect(src).toContain("t('noIconsFound')");
  });

  it('does not contain hardcoded "Type to search" help string', () => {
    expect(src).not.toContain('Type to search •');
    expect(src).toContain("t('helpBrowse')");
  });

  it('does not contain hardcoded "Use arrow keys" help string', () => {
    expect(src).not.toContain('Use arrow keys to navigate');
    expect(src).toContain("t('helpSearch')");
  });

  it('does not contain hardcoded search placeholder string', () => {
    expect(src).not.toContain('Search icons (press Enter to select)');
    expect(src).toContain("t('searchPlaceholder')");
  });

  it('uses .replace() for count interpolation in searchResults', () => {
    // The lib t() does not support object interpolation — must use string replace
    expect(src).toContain(".replace('{count}'");
  });

  it('uses .replace() for term interpolation in noIconsFound', () => {
    expect(src).toContain(".replace('{term}'");
  });
});
