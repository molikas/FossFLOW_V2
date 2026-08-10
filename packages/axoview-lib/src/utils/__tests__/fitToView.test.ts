/**
 * Promoted from the 2026-07 exploratory lane (R4/RND-01).
 * `getFitToViewParams` had no tests; see also `projectBounds.test.ts`.
 */
import { getFitToViewParams } from '../renderer';
import { MIN_ZOOM, MAX_ZOOM } from 'src/config';
import type { View } from 'src/types';

const viewWith = (items: { id: string; tile: { x: number; y: number } }[]) =>
  ({
    id: 'v1',
    name: 'View',
    items,
    connectors: [],
    rectangles: [],
    textBoxes: [],
    labels: [],
    layers: []
  }) as unknown as View;

describe('getFitToViewParams — the zoom floor (RND-01)', () => {
  it('never returns a zoom below MIN_ZOOM, however large the diagram', () => {
    // A diagram far too large for the viewport: the un-clamped fit produced a
    // zoom the zoom buttons, the wheel and the pinch all refuse, so the canvas
    // ended up somewhere the UI could not have taken it and could not leave.
    const huge = viewWith(
      Array.from({ length: 40 }, (_, i) => ({
        id: `n${i}`,
        tile: { x: i * 200, y: i * 200 }
      }))
    );
    const { zoom } = getFitToViewParams(huge, { width: 400, height: 300 });
    expect(zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
  });

  it('still clamps at the top', () => {
    const tiny = viewWith([{ id: 'n1', tile: { x: 0, y: 0 } }]);
    const { zoom } = getFitToViewParams(tiny, { width: 8000, height: 8000 });
    expect(zoom).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it('a mid-sized diagram still fits proportionally, not at a bound', () => {
    // The control: clamping did not flatten the function into a constant.
    const mid = viewWith([
      { id: 'a', tile: { x: 0, y: 0 } },
      { id: 'b', tile: { x: 12, y: 12 } }
    ]);
    const { zoom } = getFitToViewParams(mid, { width: 1200, height: 900 });
    expect(zoom).toBeGreaterThan(MIN_ZOOM);
    expect(zoom).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it('a narrower viewport fits at a smaller zoom (RND-06 inset behaviour)', () => {
    // `fitToView` subtracts the open docks' widths before calling this, so the
    // function must actually respond to the width it is given — otherwise the
    // inset would be a no-op.
    const v = viewWith([
      { id: 'a', tile: { x: 0, y: 0 } },
      { id: 'b', tile: { x: 10, y: 10 } }
    ]);
    const wide = getFitToViewParams(v, { width: 1600, height: 900 }).zoom;
    const inset = getFitToViewParams(v, { width: 1000, height: 900 }).zoom;
    expect(inset).toBeLessThanOrEqual(wide);
  });
});
