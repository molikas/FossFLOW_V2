/**
 * REGRESSION — Language dropdown: right-anchored positioning
 *
 * The language selector sits at the far-right corner of the toolbar.
 * With the original `left: 0` positioning the dropdown extended off the right
 * edge of the viewport, making roughly half of it invisible.
 *
 * Fix: changed to `right: 0` so the dropdown opens leftward and stays fully
 * on screen regardless of window width.
 *
 * This test reads the CSS source to pin the positioning rule.
 */

import * as fs from 'fs';
import * as path from 'path';

const CSS_PATH = path.resolve(
  __dirname,
  '../../../fossflow-app/src/components/ChangeLanguage/styles.css'
);

describe('Language dropdown — right-anchored positioning', () => {
  let src: string;
  let dropdownBlock: string;

  beforeAll(() => {
    src = fs.readFileSync(CSS_PATH, 'utf-8');
    // Extract just the .language-dropdown rule block
    const match = src.match(/\.language-dropdown\s*\{([^}]+)\}/);
    dropdownBlock = match ? match[1] : '';
  });

  it('styles.css exists', () => {
    expect(fs.existsSync(CSS_PATH)).toBe(true);
  });

  it('.language-dropdown rule is present', () => {
    expect(dropdownBlock).not.toBe('');
  });

  it('.language-dropdown uses right: 0', () => {
    expect(dropdownBlock).toContain('right: 0');
  });

  it('.language-dropdown does not use left: 0 (would overflow on right-side placement)', () => {
    expect(dropdownBlock).not.toContain('left: 0');
  });
});
