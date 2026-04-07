/**
 * REGRESSION — i18n locale completeness
 *
 * Every locale TS file must contain the same top-level namespace keys as
 * en-US.ts. This catches missing sections (e.g. toolMenu, quickIconSelector)
 * that would cause `t('key')` to fall back to the key string at runtime
 * instead of showing a translation.
 *
 * Strategy: read en-US.ts as the source of truth, extract top-level
 * section names, then verify each other locale file declares the same keys.
 */

import * as fs from 'fs';
import * as path from 'path';

const I18N_DIR = path.resolve(__dirname, '../i18n');

const allLocaleFiles = fs.readdirSync(I18N_DIR)
  .filter(f => f.endsWith('.ts') && f !== 'index.ts');

const enUS = fs.readFileSync(path.join(I18N_DIR, 'en-US.ts'), 'utf-8');

// Extract top-level section names: lines that match "  sectionName: {"
const TOP_LEVEL_RE = /^  (\w+): \{/gm;
const enUSSections: string[] = [];
let m: RegExpExecArray | null;
while ((m = TOP_LEVEL_RE.exec(enUS)) !== null) {
  enUSSections.push(m[1]);
}

describe('i18n locale completeness — all namespaces present in every locale', () => {
  it('en-US.ts has the expected core namespaces', () => {
    expect(enUSSections).toContain('toolMenu');
    expect(enUSSections).toContain('quickIconSelector');
    expect(enUSSections).toContain('exportImageDialog');
    expect(enUSSections).toContain('viewTabs');
    expect(enUSSections).toContain('nodePanel');
    expect(enUSSections).toContain('mainMenu');
    expect(enUSSections).toContain('helpDialog');
    expect(enUSSections).toContain('zoomControls');
  });

  for (const file of allLocaleFiles) {
    if (file === 'en-US.ts') continue;

    it(`${file} contains all top-level sections from en-US.ts`, () => {
      const src = fs.readFileSync(path.join(I18N_DIR, file), 'utf-8');
      for (const section of enUSSections) {
        expect(src).toContain(`${section}:`);
      }
    });
  }
});
