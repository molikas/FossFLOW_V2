/**
 * PERF REGRESSION — H-3: ExportImageDialog must be wrapped in React.memo
 *
 * ExportImageDialog was not memoised.  Every UiOverlay re-render (which
 * previously happened at mouse rate) would re-create the dialog subtree even
 * when dialog === null and the dialog was not mounted.  React's reconciler
 * still evaluates the expression:
 *
 *   {dialog === DialogTypeEnum.EXPORT_IMAGE && <ExportImageDialog ... />}
 *
 * If ExportImageDialog itself is not memoised, once mounted it re-renders on
 * every parent update.  The dialog contains heavy canvas/SVG logic.
 *
 * Contract: ExportImageDialog must be wrapped in React.memo.
 */

import * as fs from 'fs';
import * as path from 'path';

const DIALOG_PATH = path.resolve(
  __dirname,
  '../components/ExportImageDialog/ExportImageDialog.tsx'
);

describe('ExportImageDialog memo — H-3 regression', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(DIALOG_PATH, 'utf8');
  });

  it('ExportImageDialog is exported as a React.memo component', () => {
    // Must match: export const ExportImageDialog = memo(
    const isMemo = /export\s+const\s+ExportImageDialog\s*=\s*memo\s*\(/.test(source);
    expect(isMemo).toBe(true);
  });

  it('memo is imported from react in ExportImageDialog', () => {
    const importsMemo = /import\s+[^;]*\bmemo\b[^;]*from\s+['"]react['"]/.test(source);
    expect(importsMemo).toBe(true);
  });
});
