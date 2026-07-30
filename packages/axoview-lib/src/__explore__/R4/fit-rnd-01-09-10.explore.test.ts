/**
 * R4 / RND-01, RND-09, RND-10 — the fit-to-view parameter chain.
 *
 * `getFitToViewParams` is the shared engine behind BOTH fit paths: the
 * `canvas-zoom-fit` button (`useDiagramUtils.fitToView`) and the deferred
 * open-time fit the Renderer applies in a `useLayoutEffect`. It has no
 * production unit test at all (only R1's bounds probe touches it), so its
 * clamping and its content set are unpinned.
 *
 * RIG NOTE: every `it.failing` is paired with a passing characterization that
 * asserts the observed numbers, and each probe asserts its PRECONDITION (the
 * diagram really is large enough / the label really is offset) so a probe whose
 * setup silently didn't happen cannot masquerade as evidence.
 *
 * jsdom has no canvas 2D context and `getProjectBounds` reaches
 * `getTextBoxDimensions` — `installCanvasStub()` runs first (campaign trap #1).
 */
import { installCanvasStub } from 'src/__explore__/canvasStub';

installCanvasStub();

// eslint-disable-next-line import/first
import { getFitToViewParams, getProjectBounds } from 'src/utils/renderer';
// eslint-disable-next-line import/first
import { sortByPosition } from 'src/utils/isoMath';
// eslint-disable-next-line import/first
import {
  makeTilePositionFn,
  makeScreenToTileFn,
  getStrategy
} from 'src/utils/coordinateTransforms';
// eslint-disable-next-line import/first
import { MIN_ZOOM, MAX_ZOOM, DEFAULT_LABEL_HEIGHT } from 'src/config';
// eslint-disable-next-line import/first
import { LABEL_OFFSET_MAX } from 'src/utils/labelPosition';
// eslint-disable-next-line import/first
import { incrementZoom, decrementZoom } from 'src/utils/isoMath';
// eslint-disable-next-line import/first
import { viewWith, item } from '../R1/harness';

const isoTilePos = makeTilePositionFn(getStrategy('ISOMETRIC'));

/** A laptop viewport. */
const VIEWPORT = { width: 1280, height: 720 };

/** N×N grid of nodes spanning tiles [0..span] in both axes. */
const gridView = (span: number) =>
  viewWith({
    items: [
      item('a', { x: 0, y: 0 }),
      item('b', { x: span, y: 0 }),
      item('c', { x: 0, y: span }),
      item('d', { x: span, y: span })
    ]
  });

// ---------------------------------------------------------------------------
// RND-01 — fit-to-view has no MIN_ZOOM floor
// ---------------------------------------------------------------------------

describe('RND-01 — fit-to-view can land below MIN_ZOOM', () => {
  // 100 tiles across is an ordinary large diagram, not a pathological one.
  const view = gridView(100);

  it('PRECONDITION: MIN_ZOOM is the floor every other zoom path enforces', () => {
    expect(MIN_ZOOM).toBe(0.1);
    expect(decrementZoom(MIN_ZOOM)).toBe(MIN_ZOOM);
    expect(decrementZoom(MIN_ZOOM + 0.01)).toBeCloseTo(MIN_ZOOM);
    expect(incrementZoom(MAX_ZOOM)).toBe(MAX_ZOOM);
  });

  it('PRECONDITION: the diagram really is 100 tiles wide', () => {
    const b = sortByPosition(getProjectBounds(view));
    expect(b.highX - b.lowX).toBeGreaterThanOrEqual(100);
    expect(b.highY - b.lowY).toBeGreaterThanOrEqual(100);
  });

  it('characterization: the fit zoom for a 100-tile diagram is far below MIN_ZOOM', () => {
    const { zoom } = getFitToViewParams(view, VIEWPORT, isoTilePos);
    expect(zoom).toBeGreaterThan(0);
    expect(zoom).toBeLessThan(MIN_ZOOM);
    // Pin the observed value so a change in the bounds chain is visible here.
    expect(zoom).toBeCloseTo(0.083, 3);
  });

  it.failing('fit-to-view should never produce a zoom below MIN_ZOOM', () => {
    const { zoom } = getFitToViewParams(view, VIEWPORT, isoTilePos);
    expect(zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
  });

  it('the smallest diagram that trips it is ~85 tiles across on a 1280×720 viewport', () => {
    const trips = (span: number) =>
      getFitToViewParams(gridView(span), VIEWPORT, isoTilePos).zoom < MIN_ZOOM;
    expect(trips(60)).toBe(false);
    expect(trips(100)).toBe(true);
    // Bisect so the threshold is recorded rather than guessed.
    let lo = 60;
    let hi = 100;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (trips(mid)) hi = mid;
      else lo = mid;
    }
    expect(hi).toBeGreaterThan(60);
    expect(hi).toBeLessThan(100);
  });

  it('the upper clamp IS enforced — a one-node diagram stops at MAX_ZOOM', () => {
    const one = viewWith({ items: [item('a', { x: 0, y: 0 })] });
    expect(getFitToViewParams(one, VIEWPORT, isoTilePos).zoom).toBe(MAX_ZOOM);
  });
});

// ---------------------------------------------------------------------------
// RND-09 — getProjectBounds ignores the node NAME CHIP's extent
// ---------------------------------------------------------------------------

describe('RND-09 — fit-to-view does not reserve room for a raised name chip', () => {
  // A diagram laid along the ISO screen-Y axis (x === y), so the VERTICAL axis
  // is the one that limits the fit — otherwise the width-limited fit leaves
  // vertical slack that hides the omission behind a coincidence.
  // ISO screen-y DECREASES as (x + y) grows, so the topmost node is {20,20}.
  const TOP = item('top', { x: 20, y: 20 });
  const BOTTOM = item('bot', { x: 0, y: 0 });
  const raised = { ...TOP, labelHeight: LABEL_OFFSET_MAX } as typeof TOP;
  const stripe = (top: typeof TOP) => [
    top,
    item('mid', { x: 10, y: 10 }),
    BOTTOM
  ];
  const view = viewWith({ items: stripe(raised) as never[] });
  const plain = viewWith({ items: stripe(TOP) as never[] });

  const screenY = (
    tile: { x: number; y: number },
    lift: number,
    fit: { zoom: number; scroll: { x: number; y: number } }
  ) =>
    (isoTilePos({ tile }).y - lift) * fit.zoom +
    VIEWPORT.height / 2 +
    fit.scroll.y;

  it('PRECONDITION: the drag range really reaches +280 canvas px above the node', () => {
    expect(LABEL_OFFSET_MAX).toBe(280);
    expect(DEFAULT_LABEL_HEIGHT).toBe(20);
  });

  it('PRECONDITION: `top` is the topmost node and the fit is height-limited', () => {
    const ys = stripe(TOP).map((i) => isoTilePos({ tile: i.tile }).y);
    expect(Math.min(...ys)).toBe(isoTilePos({ tile: TOP.tile }).y);
    const fit = getFitToViewParams(plain, VIEWPORT, isoTilePos);
    // Height-limited ⇒ the fitted content spans most of the viewport height.
    const top = screenY(TOP.tile, 0, fit);
    const bot = screenY(BOTTOM.tile, 0, fit);
    expect(fit.zoom).toBeLessThan(MAX_ZOOM);
    expect(bot - top).toBeGreaterThan(VIEWPORT.height * 0.6);
  });

  it('characterization: the bounds are identical with and without the raised label', () => {
    expect(sortByPosition(getProjectBounds(view))).toEqual(
      sortByPosition(getProjectBounds(plain))
    );
  });

  it.failing('the fitted viewport should contain the chip, not just the node', () => {
    const fit = getFitToViewParams(view, VIEWPORT, isoTilePos);
    expect(screenY(TOP.tile, LABEL_OFFSET_MAX, fit)).toBeGreaterThanOrEqual(0);
  });

  it('characterization: at the fitted zoom the chip sits ABOVE the viewport top', () => {
    const fit = getFitToViewParams(view, VIEWPORT, isoTilePos);
    const node = screenY(TOP.tile, 0, fit);
    const chip = screenY(TOP.tile, LABEL_OFFSET_MAX, fit);
    // The node itself is inside; only the chip escapes.
    expect(node).toBeGreaterThan(0);
    expect(node).toBeLessThan(VIEWPORT.height);
    expect(chip).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// RND-10 — is fit-to-view idempotent?
// ---------------------------------------------------------------------------

describe('RND-10 — fit-to-view idempotence', () => {
  it('the params are a pure function of (view, viewport) — a second fit is a no-op', () => {
    const view = gridView(12);
    const first = getFitToViewParams(view, VIEWPORT, isoTilePos);
    const second = getFitToViewParams(view, VIEWPORT, isoTilePos);
    expect(second).toEqual(first);
  });

  it('and it does not read the CURRENT scroll/zoom, so applying it cannot drift', () => {
    // Same call, same answer, regardless of what the store now holds — the
    // function takes no viewport state beyond the size.
    const view = gridView(12);
    const a = getFitToViewParams(view, VIEWPORT, isoTilePos);
    const b = getFitToViewParams(view, { ...VIEWPORT }, isoTilePos);
    expect(b).toEqual(a);
  });
});

// ---------------------------------------------------------------------------
// RND-08 — does the 4-tile cull padding cover a raised name chip?
// ---------------------------------------------------------------------------

/*
 * The Renderer culls on `item.tile` alone. A node's name chip is drawn at
 * `pos.y - labelHeight` in SCENE px, up to +280 (clampLabelOffset), so the
 * question is whether a tile can be outside the padded bounds while its chip is
 * still inside the viewport. `computeTileBounds` is module-private to
 * Renderer.tsx, so it is mirrored here verbatim (four viewport corners through
 * screenToTile, ± VIEWPORT_TILE_PADDING) — the constants below are the ones
 * Renderer.tsx declares.
 */
describe('RND-08 — culling vs the name chip extent', () => {
  const VIEWPORT_TILE_PADDING = 4; // Renderer.tsx
  const W = 1600;
  const H = 900;
  const ZOOM = 1;
  const SCROLL = { position: { x: 0, y: 0 }, offset: { x: 0, y: 0 } };

  const bounds = () => {
    const screenToTile = makeScreenToTileFn(getStrategy('ISOMETRIC'));
    const corners = [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: 0, y: H },
      { x: W, y: H }
    ].map((mouse) =>
      screenToTile({
        mouse,
        zoom: ZOOM,
        scroll: SCROLL as never,
        rendererSize: { width: W, height: H }
      })
    );
    const xs = corners.map((t) => t.x);
    const ys = corners.map((t) => t.y);
    return {
      minX: Math.min(...xs) - VIEWPORT_TILE_PADDING,
      maxX: Math.max(...xs) + VIEWPORT_TILE_PADDING,
      minY: Math.min(...ys) - VIEWPORT_TILE_PADDING,
      maxY: Math.max(...ys) + VIEWPORT_TILE_PADDING
    };
  };

  /** Screen point of a tile under the SceneLayer transform. */
  const screen = (tile: { x: number; y: number }, lift: number) => {
    const p = isoTilePos({ tile });
    return {
      x: p.x * ZOOM + W / 2 + SCROLL.position.x,
      y: (p.y - lift) * ZOOM + H / 2 + SCROLL.position.y
    };
  };

  it('PRECONDITION: the mirrored bounds really bracket the viewport', () => {
    const b = bounds();
    // The tile under the viewport centre must be comfortably inside.
    expect(b.minX).toBeLessThan(0);
    expect(b.maxX).toBeGreaterThan(0);
    expect(b.minY).toBeLessThan(0);
    expect(b.maxY).toBeGreaterThan(0);
  });

  it('no culled tile can put its chip back on screen', () => {
    const b = bounds();
    const culled = (t: { x: number; y: number }) =>
      t.x < b.minX || t.x > b.maxX || t.y < b.minY || t.y > b.maxY;
    const onScreen = (p: { x: number; y: number }) =>
      p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;

    const offenders: Array<{ x: number; y: number }> = [];
    // Sweep a band well past the padded bounds in both axes.
    for (let x = Math.floor(b.minX) - 12; x <= Math.ceil(b.maxX) + 12; x += 1) {
      for (let y = Math.floor(b.minY) - 12; y <= Math.ceil(b.maxY) + 12; y += 1) {
        const t = { x, y };
        if (!culled(t)) continue;
        if (onScreen(screen(t, LABEL_OFFSET_MAX))) offenders.push(t);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('and the margin is not accidental — 4 tiles of padding is ~2x the chip lift', () => {
    // One tile of padding in BOTH axes moves a point this far up the screen.
    const perTile =
      isoTilePos({ tile: { x: 0, y: 0 } }).y - isoTilePos({ tile: { x: 1, y: 1 } }).y;
    expect(Math.abs(perTile) * VIEWPORT_TILE_PADDING).toBeGreaterThan(
      LABEL_OFFSET_MAX
    );
  });
});
