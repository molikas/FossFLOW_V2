/**
 * REGRESSION — i18n config: prevent short-code locale 404
 *
 * Problem: i18next browser language detection returns 'en-US' but by default
 * also tries to load the short-code variant 'en'. The dev server returns
 * index.html for unknown routes, which fails JSON parsing and logs:
 *   i18next::backendConnector: loading namespace app for language en failed
 *
 * Fix: `load: 'currentOnly'` tells i18next to only load the exact locale
 * string and never strip it to a short-code.
 *
 * This test reads the app package's i18n.ts source to pin the required config
 * option. The app package has no jest config of its own so this lives here.
 */

import * as fs from 'fs';
import * as path from 'path';

const I18N_PATH = path.resolve(__dirname, '../../../fossflow-app/src/i18n.ts');

describe('i18n config — short-code locale prevention', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(I18N_PATH, 'utf-8');
  });

  it('i18n.ts exists', () => {
    expect(fs.existsSync(I18N_PATH)).toBe(true);
  });

  it('contains load: "currentOnly" to suppress short-code locale requests', () => {
    expect(src).toContain("load: 'currentOnly'");
  });

  it('contains fallbackLng: "en-US"', () => {
    expect(src).toContain("fallbackLng: 'en-US'");
  });
});
