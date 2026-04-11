/**
 * Regression: browser native drag hijacks custom drag interactions
 *
 * When mousedown lands on an SVG icon or <img> node the browser fires dragstart
 * and takes over the pointer — mousemove events stop flowing so DRAG_ITEMS never
 * receives updates and the element slides as a ghost image instead.
 *
 * Fix: rendererEl.addEventListener('dragstart', e => e.preventDefault())
 * Scope: rendererEl only (not window) so toolbar/dialog drag-and-drop is unaffected.
 */

import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(
  path.resolve(__dirname, '../interaction/useInteractionManager.ts'),
  'utf8'
);

describe('dragstart prevention — native drag regression', () => {
  it('registers dragstart handler on rendererEl, not on window', () => {
    // Should be on rendererEl
    expect(src).toMatch(/rendererEl\?\.addEventListener\(['"]dragstart['"]/);
    // Must NOT be on the bare window listener (el.addEventListener)
    const windowDragStart = src.match(
      /\bel\.addEventListener\(['"]dragstart['"]/
    );
    expect(windowDragStart).toBeNull();
  });

  it('removes dragstart handler on cleanup (no leak)', () => {
    expect(src).toMatch(/rendererEl\?\.removeEventListener\(['"]dragstart['"]/);
  });

  it('dragstart handler calls preventDefault', () => {
    const handlerMatch = src.match(
      /const onDragStart\s*=\s*\(.*?\)\s*=>\s*\w+\.preventDefault\(\)/
    );
    expect(handlerMatch).not.toBeNull();
  });
});
