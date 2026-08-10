/**
 * Promoted from the 2026-07 exploratory lane (R1/PROJ-01, PROJ-02, PROJ-04).
 *
 * `getProjectBounds` / `getUnprojectedBounds` / `getFitToViewParams` had ZERO
 * tests, and all three campaign findings were in them. Both consumers —
 * fit-to-view and the image export — framed the wrong region.
 */
import {
  getProjectBounds,
  getUnprojectedBounds
} from '../renderer';
import { sortByPosition } from '../isoMath';
import { PROJECT_BOUNDING_BOX_PADDING } from 'src/config';
import type { View } from 'src/types';

const PAD = PROJECT_BOUNDING_BOX_PADDING;

// jsdom ships no canvas 2D context, and `getProjectBounds` re-measures every
// text box through `getTextBoxDimensions`, which throws without one. The
// campaign's rig notes flag this as a wrong-verdict source: a test that dies in
// SETUP looks like a finding. Deterministic approximation, not a claim about
// glyph metrics — these assertions key off the frame's DIRECTION, which is
// measurement-independent. (Two other suites hand-roll the same stub locally;
// left local here rather than shared, because `isoMath.richtext.test.ts`
// deliberately asserts the no-context path and a global install would fight it.)
beforeAll(() => {
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: (id: string) => unknown;
  };
  proto.getContext = ((contextId: string) => {
    if (contextId !== '2d') return null;
    let font = '16px sans-serif';
    return {
      get font() {
        return font;
      },
      set font(next: string) {
        font = next;
      },
      measureText: (text: string) => {
        const px = Number.parseFloat(
          /(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '16'
        );
        return { width: text.length * px * 0.55 };
      }
    };
  }) as never;
});

const makeView = (overrides: Partial<View> = {}): View =>
  ({
    id: 'v1',
    name: 'View',
    items: [],
    connectors: [],
    rectangles: [],
    textBoxes: [],
    labels: [],
    layers: [],
    ...overrides
  }) as unknown as View;

const bounds = (view: View) => sortByPosition(getProjectBounds(view));

describe('getProjectBounds — text-box rows (PROJ-01)', () => {
  /** A 6-row text box anchored at y = 0. `size` is what the scene carries. */
  const sixRowBox = {
    id: 'tb1',
    tile: { x: 0, y: 0 },
    orientation: 'X',
    content: '<p>a</p><p>b</p><p>c</p><p>d</p><p>e</p><p>f</p>',
    // getTextBoxDimensions re-measures from content; the assertions below key
    // off the ANCHOR side, which is direction-only and measurement-independent.
    size: { width: 2, height: 6 }
  };

  it('extends DOWNWARD from the anchor, the way the box actually grows', () => {
    const b = bounds(makeView({ textBoxes: [sixRowBox] as never }));

    // A text box grows to `tile.y − (height − 1)` — `getTextBoxEndTile`, the
    // authority the hit test and the selection outline both read. The old code
    // ADDED size.height instead, so a 6-row box at y=0 gave lowY=−3 / highY=+9:
    // its own rows were OUTSIDE the frame and six empty tiles above were inside.
    expect(b.lowY).toBeLessThan(-PAD);
    expect(b.highY).toBe(PAD);
  });

  it('the miss does not grow with the row count any more', () => {
    const two = bounds(
      makeView({
        textBoxes: [{ ...sixRowBox, size: { width: 2, height: 2 } }] as never
      })
    );
    const twelve = bounds(
      makeView({
        textBoxes: [{ ...sixRowBox, size: { width: 2, height: 12 } }] as never
      })
    );
    // Both frames sit on the same side of the anchor; only the extent differs.
    expect(two.highY).toBe(PAD);
    expect(twelve.highY).toBe(PAD);
    expect(twelve.lowY).toBeLessThanOrEqual(two.lowY);
  });
});

describe('getProjectBounds — floating Labels (PROJ-02)', () => {
  it('frames a Label dragged clear of every other entity', () => {
    const view = makeView({
      items: [{ id: 'n1', tile: { x: 0, y: 0 } }] as never,
      labels: [{ id: 'l1', tile: { x: 40, y: 40 }, text: 'far' }] as never
    });

    const b = bounds(view);

    // Before the fix the label was enumerated nowhere here: bounds were exactly
    // (−3,−3)..(3,3) and the label sat 37 tiles outside — outside fit-to-view
    // and outside the exported image.
    expect(b.highX).toBeGreaterThanOrEqual(40);
    expect(b.highY).toBeGreaterThanOrEqual(40);
  });

  it('a view of labels alone is still framed', () => {
    const b = bounds(
      makeView({
        labels: [
          { id: 'l1', tile: { x: -5, y: 2 }, text: 'a' },
          { id: 'l2', tile: { x: 7, y: -3 }, text: 'b' }
        ] as never
      })
    );
    expect(b.lowX).toBe(-5 - PAD);
    expect(b.highX).toBe(7 + PAD);
  });
});

describe('getUnprojectedBounds — pixel extents (PROJ-04)', () => {
  it('reports the pixel extent, without the inclusive tile-count +1', () => {
    const view = makeView({
      items: [
        { id: 'n1', tile: { x: 0, y: 0 } },
        { id: 'n2', tile: { x: 4, y: 4 } }
      ] as never
    });

    // A synthetic projection with a known scale makes the expected extent exact.
    const getTilePosition = ({ tile }: { tile: { x: number; y: number } }) => ({
      x: tile.x * 10,
      y: tile.y * 10
    });

    const corners = getProjectBounds(view).map((c) => getTilePosition({ tile: c }));
    const sorted = sortByPosition(corners);
    const out = getUnprojectedBounds(view, getTilePosition as never);

    // `getBoundingBoxSize` adds +1 because it counts TILES; these are PIXELS.
    // The old code mixed the two and the 1 px propagated into the fit zoom.
    expect(out.width).toBe(sorted.highX - sorted.lowX);
    expect(out.height).toBe(sorted.highY - sorted.lowY);
    expect(out.x).toBe(sorted.lowX);
    expect(out.y).toBe(sorted.lowY);
  });

  it('an empty view still reports a finite frame', () => {
    const out = getUnprojectedBounds(makeView());
    expect(Number.isFinite(out.width)).toBe(true);
    expect(out.width).toBeGreaterThan(0);
  });
});
