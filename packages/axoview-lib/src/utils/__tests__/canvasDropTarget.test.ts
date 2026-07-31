/**
 * Promoted from the 2026-07 exploratory lane (I2/TCH-05, I5/CTX-01) — the two
 * halves of "was this released over the canvas?".
 *
 * The campaign found the question asked three ways and answered right once. The
 * mouse placement modes asked nothing and committed on the tap-slop `moved` flag
 * alone (CTX-01: a palette drag released back over the Elements panel dropped a
 * node at the tile behind it). The touch palette path asked
 * `getBoundingClientRect` containment, which calls every overlaying panel
 * "canvas" — the panels sit INSIDE the renderer's rect (TCH-05: renderer rect
 * {0,46,1280,674} contains the panel icon at x:61).
 *
 * The rect-containment case below is the one that matters: it is the exact
 * geometry the campaign measured, and the old test would pass it.
 */
import {
  isPointOverCanvas,
  mouseClientPoint,
  isCanvasDrop
} from '../canvasDropTarget';

const CANVAS_CHILD = { nodeType: 1 } as unknown as Element;
const PANEL_CHILD = { nodeType: 1 } as unknown as Element;

/** A renderer whose rect matches the campaign's measurement. */
const renderer = {
  getBoundingClientRect: () => ({
    left: 0,
    top: 46,
    right: 1280,
    bottom: 720,
    width: 1280,
    height: 674
  }),
  contains: (node: unknown) => node === CANVAS_CHILD
} as unknown as HTMLElement;

const stubHit = (el: Element | null) => {
  document.elementFromPoint = jest.fn(
    () => el
  ) as unknown as typeof document.elementFromPoint;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('isPointOverCanvas', () => {
  it('is true for a point that hit-tests inside the renderer', () => {
    stubHit(CANVAS_CHILD);
    expect(isPointOverCanvas(renderer, 640, 400)).toBe(true);
  });

  it('is true when the hit IS the renderer itself', () => {
    stubHit(renderer as unknown as Element);
    expect(isPointOverCanvas(renderer, 640, 400)).toBe(true);
  });

  it('is FALSE over a panel drawn on top — even though the point is inside the rect', () => {
    // The headline case. x:61,y:200 is inside {0,46,1280,720}, which is why the
    // old rect-containment test called it canvas (TCH-05).
    stubHit(PANEL_CHILD);
    expect(isPointOverCanvas(renderer, 61, 200)).toBe(false);
  });

  it('is false with no renderer and false when the point hits nothing', () => {
    stubHit(CANVAS_CHILD);
    expect(isPointOverCanvas(null, 640, 400)).toBe(false);
    stubHit(null);
    expect(isPointOverCanvas(renderer, -50, -50)).toBe(false);
  });
});

describe('mouseClientPoint', () => {
  it('converts a renderer-relative mouse position back to client coordinates', () => {
    // getMouse stores `screen` as clientX - rect.left / clientY - rect.top.
    expect(mouseClientPoint(renderer, { x: 100, y: 200 })).toEqual({
      x: 100,
      y: 246
    });
  });

  it('is null with no renderer', () => {
    expect(mouseClientPoint(null, { x: 1, y: 2 })).toBeNull();
  });
});

describe('isCanvasDrop — the shared placement gate', () => {
  it('accepts a release ON the interactions box without hit-testing', () => {
    stubHit(PANEL_CHILD);
    expect(isCanvasDrop(renderer, true, { x: 0, y: 0 }, false)).toBe(true);
  });

  it('refuses an arming tap (off-canvas release, no travel)', () => {
    stubHit(CANVAS_CHILD);
    expect(isCanvasDrop(renderer, false, { x: 10, y: 10 }, false)).toBe(false);
  });

  it('accepts a drag-from-panel that ends over the canvas', () => {
    stubHit(CANVAS_CHILD);
    expect(isCanvasDrop(renderer, false, { x: 500, y: 400 }, true)).toBe(true);
  });

  it('refuses a drag-from-panel released back over the panel (CTX-01)', () => {
    stubHit(PANEL_CHILD);
    expect(isCanvasDrop(renderer, false, { x: 61, y: 154 }, true)).toBe(false);
  });
});
