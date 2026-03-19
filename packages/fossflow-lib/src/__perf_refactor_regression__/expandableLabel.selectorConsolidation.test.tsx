/**
 * PERF REGRESSION — N-4: ExpandableLabel must use a single consolidated selector
 *
 * ExpandableLabel had two separate useUiStateStore() calls:
 *   const forceExpandLabels = useUiStateStore((state) => state.expandLabels);
 *   const editorMode        = useUiStateStore((state) => state.editorMode);
 *   const labelSettings     = useUiStateStore((state) => state.labelSettings);
 *
 * With N nodes visible, that is N×3 independent store subscriptions.  Any
 * uiStateStore update triggers N×3 selector evaluations.
 *
 * The fix: merge into a single useUiStateStore call with shallow equality.
 *
 * Contract:
 *  - ExpandableLabel.tsx contains at most ONE useUiStateStore() call site
 *  - That call site uses the shallow equality function
 */

import * as fs from 'fs';
import * as path from 'path';

const LABEL_PATH = path.resolve(
  __dirname,
  '../components/Label/ExpandableLabel.tsx'
);

describe('ExpandableLabel selector consolidation — N-4 regression', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(LABEL_PATH, 'utf8');
  });

  it('ExpandableLabel has at most one useUiStateStore() call site', () => {
    const matches = source.match(/\buseUiStateStore\s*\(/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  it('ExpandableLabel uses shallow equality in its useUiStateStore call', () => {
    const hasShallow = /useUiStateStore\s*\([^)]*,[^)]*shallow/.test(source) ||
      // Multi-line form
      /useUiStateStore[\s\S]{0,200}shallow/.test(source);
    expect(hasShallow).toBe(true);
  });

  it('shallow is imported in ExpandableLabel', () => {
    const importsShallow = /import\s+[^;]*\bshallow\b[^;]*from\s+['"]zustand/.test(source);
    expect(importsShallow).toBe(true);
  });
});
