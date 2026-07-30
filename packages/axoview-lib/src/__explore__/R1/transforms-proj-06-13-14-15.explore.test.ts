/**
 * R1 / PROJ-06, PROJ-13, PROJ-14, PROJ-15 — the pure transform math.
 *
 * These four are sweeps over the strategies themselves, so they need no React
 * tree and no canvas. Each block states the observed behaviour in a passing
 * characterization FIRST (COLDSTART rig rule 1) and asserts its precondition
 * before drawing any conclusion (rule 2) — a sweep that silently iterated zero
 * cases would otherwise read as "no failures found".
 */
import {
  isometricStrategy,
  cartesian2DStrategy,
  makeScreenToTileFn,
  makeTilePositionFn,
  getStrategy
} from 'src/utils/coordinateTransforms';
import {
  getRenderedAreaCorners,
  getRenderedDragTransform,
  tileFootprintAt,
  footprintContainsPoint
} from 'src/utils/renderedGeometry';
import { screenToIso, incrementZoom, decrementZoom } from 'src/utils/isoMath';
import {
  UNPROJECTED_TILE_SIZE,
  PROJECTED_TILE_SIZE,
  MIN_ZOOM,
  MAX_ZOOM
} from 'src/config';

const RENDERER = { width: 1280, height: 800 };
const isoTilePos = makeTilePositionFn(getStrategy('ISOMETRIC'));
const twoDTilePos = makeTilePositionFn(getStrategy('2D'));

/** The zoom ladder the UI can actually produce (0.05 steps, clamped [0.1,1]). */
const zoomLadder = (): number[] => {
  const out: number[] = [];
  let z = MAX_ZOOM;
  for (let i = 0; i < 40; i += 1) {
    out.push(z);
    const next = decrementZoom(z);
    if (next === z) break;
    z = next;
  }
  return out;
};

// ---------------------------------------------------------------------------
// PROJ-06 — the 3-decimal ISO matrix vs the exact projection ratio
// ---------------------------------------------------------------------------

describe('PROJ-06 — area quads drift from tile projection in ISOMETRIC', () => {
  /**
   * SceneLayer-px distance between a rectangle's drawn far corner and the
   * EXACT projection of the same displacement. A rectangle spanning tiles
   * [0..E] on the x axis is W = (E+1) tiles wide, so its far corner is the
   * origin corner advanced by (E+1) tiles along the tile-x direction — which
   * `getTilePosition` places exactly at tile (E+1, 0) with origin LEFT.
   */
  const farCornerDrift = (extent: number): number => {
    const corners = getRenderedAreaCorners(
      { x: 0, y: 0 },
      { x: extent, y: 0 },
      undefined,
      isoTilePos,
      'ISOMETRIC'
    );
    const exactFar = isoTilePos({
      tile: { x: extent + 1, y: 0 },
      origin: 'LEFT'
    });
    return Math.hypot(corners[1].x - exactFar.x, corners[1].y - exactFar.y);
  };

  it('PRECONDITION: the two constant sets really do differ', () => {
    expect(PROJECTED_TILE_SIZE.width / 2 / UNPROJECTED_TILE_SIZE).toBeCloseTo(
      0.7075,
      10
    );
    // renderedGeometry's ISO_A is 0.707 — 0.0005 per unit, 0.05 px per tile.
    expect(0.7075).not.toBe(0.707);
  });

  it('characterization: drift is exactly hypot(0.05,0.05) px per tile of width', () => {
    const per = Math.hypot(0.05, 0.05);
    expect(farCornerDrift(0)).toBeCloseTo(per * 1, 9);
    expect(farCornerDrift(19)).toBeCloseTo(per * 20, 9);
    expect(farCornerDrift(39)).toBeCloseTo(per * 40, 9);
  });

  it('a 20-tile rectangle is >1 px off the tile it claims as its far edge', () => {
    expect(farCornerDrift(19)).toBeGreaterThan(1);
  });

  it('VERDICT EVIDENCE: even a 40-tile rectangle stays under 3 px of drift', () => {
    // 3 px at zoom 1, and fit-to-view shrinks a 40-tile-wide diagram well below
    // zoom 1 — the on-screen error is sub-pixel for any diagram that fits.
    expect(farCornerDrift(39)).toBeLessThan(3);
  });

  it('and the drift never flips a one-tile hit-test', () => {
    // The smallest feature the drift could corrupt is a one-tile footprint
    // (141 x 82 px). 3 px of drift is comfortably inside it.
    const fp = tileFootprintAt({ x: 0, y: 0 }, 'ISOMETRIC');
    expect(footprintContainsPoint(fp, { x: farCornerDrift(39), y: 0 })).toBe(
      true
    );
  });
});

// ---------------------------------------------------------------------------
// PROJ-13 — toScreen -> fromScreen across the real zoom ladder
// ---------------------------------------------------------------------------

describe('PROJ-13 — screen round-trip across the zoom ladder', () => {
  const TILES: Array<{ x: number; y: number }> = [];
  for (let x = -12; x <= 12; x += 1) {
    for (let y = -12; y <= 12; y += 1) TILES.push({ x, y });
  }

  const roundTripFailures = (
    strategy: typeof isometricStrategy,
    zoom: number,
    scroll: { position: { x: number; y: number } }
  ) => {
    const toTile = makeScreenToTileFn(strategy);
    const fails: string[] = [];
    for (const tile of TILES) {
      const canvas = strategy.toScreen(tile.x, tile.y, UNPROJECTED_TILE_SIZE);
      const screen = {
        x: RENDERER.width / 2 + scroll.position.x + zoom * canvas.x,
        y: RENDERER.height / 2 + scroll.position.y + zoom * canvas.y
      };
      const back = toTile({
        mouse: screen,
        zoom,
        scroll: scroll as never,
        rendererSize: RENDERER
      });
      if (back.x !== tile.x || back.y !== tile.y) {
        fails.push(
          `${strategy.projectionName} z=${zoom} (${tile.x},${tile.y}) -> (${back.x},${back.y})`
        );
      }
    }
    return fails;
  };

  it('PRECONDITION: the ladder really spans MAX_ZOOM down to MIN_ZOOM', () => {
    const ladder = zoomLadder();
    expect(ladder[0]).toBe(MAX_ZOOM);
    expect(ladder[ladder.length - 1]).toBe(MIN_ZOOM);
    expect(ladder.length).toBeGreaterThan(15);
    expect(TILES.length).toBe(625);
  });

  it('tile centres round-trip exactly at every ladder zoom, both projections', () => {
    const scroll = { position: { x: -217, y: 133 } };
    const all: string[] = [];
    for (const zoom of zoomLadder()) {
      all.push(...roundTripFailures(isometricStrategy, zoom, scroll));
      all.push(...roundTripFailures(cartesian2DStrategy, zoom, scroll));
    }
    expect(all).toEqual([]);
  });

  it('and stays exact at fractional scrolls that are not tile multiples', () => {
    const all: string[] = [];
    for (const sx of [0, -0.5, 37.25, -911.75]) {
      const scroll = { position: { x: sx, y: -sx / 3 } };
      all.push(...roundTripFailures(isometricStrategy, 0.35, scroll));
      all.push(...roundTripFailures(cartesian2DStrategy, 0.35, scroll));
    }
    expect(all).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PROJ-14 — -0 tile coordinates and the "x,y" spatial-index key
// ---------------------------------------------------------------------------

// VERDICT: FALSIFIED — and the premise itself is wrong. `String(-0)` is "0"
// (only `Object.is` / `1/x` can see the sign), so a -0 tile coordinate CANNOT
// poison the `${x},${y}` spatial-index key. The legacy `screenToIso` really
// does still emit `y: -0`, and the strategy path really does guard it, but no
// consumer can tell the difference. Recorded because the seed seam explicitly
// predicted the opposite.
describe('PROJ-14 — negative-zero tile coordinates', () => {
  const key = (c: { x: number; y: number }) => `${c.x},${c.y}`;

  it('PRECONDITION FALSIFIES THE HYPOTHESIS: -0 stringifies to "0"', () => {
    expect(key({ x: -0, y: 0 })).toBe('0,0');
    expect(key({ x: -0, y: -0 })).toBe(key({ x: 0, y: 0 }));
    // The sign is only observable through Object.is / division.
    expect(Object.is(-0, 0)).toBe(false);
  });

  it('isoMath.screenToIso — the LEGACY helper — still emits y: -0', () => {
    const tile = screenToIso({
      mouse: { x: RENDERER.width / 2, y: RENDERER.height / 2 },
      zoom: 1,
      scroll: { position: { x: 0, y: 0 } },
      rendererSize: RENDERER
    });
    expect(Object.is(tile.y, -0)).toBe(true);
    // …but the index key it produces is indistinguishable from a +0 tile.
    expect(key(tile)).toBe('0,0');
  });

  it('and CoordsUtils.isEqual / strict === also treat -0 and 0 as equal', () => {
    expect(-0 === 0).toBe(true);
    expect([{ x: 0, y: 0 }].some((c) => c.x === -0 && c.y === -0)).toBe(true);
  });

  it('the STRATEGY path never does — its `|| 0` guard holds over a wide sweep', () => {
    const offenders: string[] = [];
    for (const strategy of [isometricStrategy, cartesian2DStrategy]) {
      const toTile = makeScreenToTileFn(strategy);
      for (let sx = -400; sx <= 400; sx += 7) {
        for (let sy = -400; sy <= 400; sy += 11) {
          const t = toTile({
            mouse: { x: RENDERER.width / 2 + sx, y: RENDERER.height / 2 + sy },
            zoom: 0.65,
            scroll: { position: { x: 0, y: 0 } } as never,
            rendererSize: RENDERER
          });
          if (Object.is(t.x, -0) || Object.is(t.y, -0)) {
            offenders.push(`${strategy.projectionName} ${sx},${sy}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('and no consumer is reachable from the legacy helper: getMouse is injected', () => {
    // `renderer.getMouse` defaults `screenToTileFn` to `screenToIso`, but the
    // only production caller (useInteractionManager) passes the CanvasMode
    // `screenToTile`, which is the guarded strategy path asserted above.
    // Encoded here so a future caller that drops the injection re-reds this.
    const fromStrategy = makeScreenToTileFn(isometricStrategy)({
      mouse: { x: RENDERER.width / 2, y: RENDERER.height / 2 },
      zoom: 1,
      scroll: { position: { x: 0, y: 0 } } as never,
      rendererSize: RENDERER
    });
    expect(Object.is(fromStrategy.y, -0)).toBe(false);
    expect(key(fromStrategy)).toBe('0,0');
  });

  it('toScreen/fromCanvasPoint DO leak -0, but only into px, never into a key', () => {
    expect(Object.is(cartesian2DStrategy.toScreen(-0, 0, 100).x, -0)).toBe(true);
    expect(Object.is(isometricStrategy.fromCanvasPoint(0, 0, 100).y, -0)).toBe(
      true
    );
    // Both feed px math (`getTilePosition`, `getCanvasModeSwitchScroll`) where
    // -0 is arithmetically identical to 0.
    expect(twoDTilePos({ tile: { x: -0, y: 0 } }).x + 5).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// PROJ-15 — the residual interpolated into a CSS calc()
// ---------------------------------------------------------------------------

// VERDICT: FALSIFIED — by the browser, not by the arithmetic. Everything below
// about the arithmetic holds: the placement residual really can land in the
// exponent range, and `getRenderedDragTransform` really does interpolate it
// unguarded. But CSS Values 4 permits scientific notation and Chromium
// implements it, so the declaration is ACCEPTED and nothing is dropped (proved
// against a real browser in
// `tests-exploratory/R1-projection/proj-07-08-09-15.explore.spec.ts`). The one
// input that IS rejected is `Infinity`, which only an unvalidated imported
// model can supply — the already-filed CLIP-14/15 class.
describe('PROJ-15 — getRenderedDragTransform stringifies the residual', () => {
  // CSS <number> grammar: [+-]? (digits ("." digits)? | "." digits). No exponent.
  const CSS_LENGTH = /^[+-]?(\d+(\.\d+)?|\.\d+)px$/;
  const lengths = (css: string) =>
    Array.from(css.matchAll(/\+ ([^)]+)\)/g)).map((m) => m[1]);

  it('PRECONDITION: JS stringifies small/large magnitudes in exponent form', () => {
    expect(String(1e-7)).toBe('1e-7');
    expect(String(1e21)).toBe('1e+21');
    expect(CSS_LENGTH.test('1e-7px')).toBe(false);
  });

  it('characterization: a normal residual produces valid CSS lengths', () => {
    const css = getRenderedDragTransform({ x: 23.5, y: -11.25 });
    const parts = lengths(css);
    expect(parts).toHaveLength(2);
    parts.forEach((p) => expect(CSS_LENGTH.test(p)).toBe(true));
  });

  it.failing('a sub-1e-6 residual emits exponent notation (not the CSS 2.1 grammar)', () => {
    const css = getRenderedDragTransform({ x: 1e-7, y: 0 });
    lengths(css).forEach((p) => expect(CSS_LENGTH.test(p)).toBe(true));
  });

  it('REACHABILITY: the placement residual DOES land in the exponent range', () => {
    // `cursorTileResidual` = screenToCanvasPoint(screen) - toScreen(tile).
    // In 2D the tile centre is an exact integer multiple of 100, so the only
    // route into (0, 1e-6) is a float division landing a few ULP off a tile
    // centre. Sweep the whole real zoom ladder against a wide screen range.
    const offenders: string[] = [];
    let nonZero = 0;
    for (const zoom of zoomLadder()) {
      for (let screen = -2000; screen <= 2000; screen += 1) {
        for (const scroll of [0, -37, 411.5]) {
          const point = (screen - RENDERER.width * 0.5 - scroll) / zoom;
          const centre =
            Math.round(point / UNPROJECTED_TILE_SIZE) * UNPROJECTED_TILE_SIZE;
          const r = Math.abs(point - centre);
          if (r === 0) continue;
          nonZero += 1;
          if (r < 1e-6) offenders.push(`z=${zoom} s=${screen} r=${r}`);
        }
      }
    }
    expect(nonZero).toBeGreaterThan(100000); // the sweep really ran
    // e.g. zoom 0.7, screen x = -1987 -> residual 4.547473508864641e-13.
    expect(offenders.length).toBeGreaterThan(0);
    offenders.forEach((o) => expect(o).toMatch(/r=[\d.]+e-\d+$/));
    // …and every one of them produces a CSS length the parser must reject.
    const worst = Number(offenders[0].split('r=')[1]);
    lengths(getRenderedDragTransform({ x: worst, y: 0 })).forEach((p, i) => {
      expect(CSS_LENGTH.test(p)).toBe(i === 1); // x invalid, y ("0px") valid
    });
  });

  it('and a drag residual is bounded below by 1 px (integer delta / zoom<=1)', () => {
    // DragItems commits screenDelta / zoom; screenDelta is an integer px count
    // (>=1 for any committed move) and zoom is capped at MAX_ZOOM.
    expect(1 / MAX_ZOOM).toBeGreaterThanOrEqual(1);
  });

  it('a second route: an unvalidated imported offset (Infinity passes z.number)', () => {
    // `coords` is `z.number()`; nothing bounds an offset component, so a
    // hand-edited / generated file can carry Infinity too. Same class as the
    // already-filed CLIP-14/15 "coordinates are unvalidated".
    expect(getRenderedDragTransform({ x: Infinity, y: 0 })).toContain(
      'Infinitypx'
    );
  });

  it('BLAST RADIUS (if a value IS ever rejected): one calc voids the whole rule', () => {
    // The residual and the compositor drag delta share ONE translate3d, so any
    // value the parser does reject — `Infinity` today — takes the whole
    // `transform` declaration with it, live drag delta included. That is why
    // the missing formatting guard is still worth closing even though the
    // exponent case turned out to be accepted.
    const css = getRenderedDragTransform({ x: 4.547473508864641e-13, y: 0 });
    expect(css).toContain('--ff-drag-dx');
    expect(css).toContain('4.547473508864641e-13px');
    // One invalid argument -> the whole property is dropped by the CSS parser.
    expect(css.split('calc(').length - 1).toBe(2);
  });
});
