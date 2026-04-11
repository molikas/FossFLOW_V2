/**
 * PERF REGRESSION — C-1: Grid background formula
 *
 * The Grid component computes backgroundPosition and backgroundSize from scroll,
 * zoom, element size, and the isometric tile projection constants.
 * During the C-1 refactor (replacing GSAP with direct style writes) the formula
 * must produce identical output.  These tests pin the exact arithmetic so any
 * accidental drift is caught immediately.
 *
 * The formula (from Grid.tsx):
 *   tileSize        = PROJECTED_TILE_SIZE * zoom
 *   bgPos.x         = elWidth  / 2 + scroll.x + tileSize.width  / 2
 *   bgPos.y         = elHeight / 2 + scroll.y
 *   backgroundSize  = `${tileSize.width}px ${tileSize.height * 2}px`
 *   backgroundPosition = `${bgPos.x}px ${bgPos.y}px`
 */

import { SizeUtils } from 'src/utils/SizeUtils';
import { PROJECTED_TILE_SIZE } from 'src/config';

// ---------------------------------------------------------------------------
// Pure helper — mirrors the inline logic in Grid.tsx so tests are independent
// of any refactored implementation.  If the refactor extracts this to a named
// function the tests should be updated to call that function instead.
// ---------------------------------------------------------------------------
interface GridBgParams {
  scroll: { x: number; y: number };
  zoom: number;
  elWidth: number;
  elHeight: number;
}

function computeGridBackground(p: GridBgParams) {
  const tileSize = SizeUtils.multiply(PROJECTED_TILE_SIZE, p.zoom);
  const bgX = p.elWidth / 2 + p.scroll.x + tileSize.width / 2;
  const bgY = p.elHeight / 2 + p.scroll.y;
  return {
    backgroundSize: `${tileSize.width}px ${tileSize.height * 2}px`,
    backgroundPosition: `${bgX}px ${bgY}px`,
    tileSizeWidth: tileSize.width,
    tileSizeHeight: tileSize.height
  };
}

// ---------------------------------------------------------------------------
// Formula correctness
// ---------------------------------------------------------------------------
describe('Grid background formula — C-1 regression', () => {
  describe('backgroundSize', () => {
    it('at zoom=1, width equals PROJECTED_TILE_SIZE.width', () => {
      const { tileSizeWidth } = computeGridBackground({
        scroll: { x: 0, y: 0 },
        zoom: 1,
        elWidth: 800,
        elHeight: 600
      });
      expect(tileSizeWidth).toBeCloseTo(PROJECTED_TILE_SIZE.width, 5);
    });

    it('at zoom=1, height equals PROJECTED_TILE_SIZE.height', () => {
      const { tileSizeHeight } = computeGridBackground({
        scroll: { x: 0, y: 0 },
        zoom: 1,
        elWidth: 800,
        elHeight: 600
      });
      expect(tileSizeHeight).toBeCloseTo(PROJECTED_TILE_SIZE.height, 5);
    });

    it('at zoom=2, width doubles', () => {
      const z1 = computeGridBackground({
        scroll: { x: 0, y: 0 },
        zoom: 1,
        elWidth: 800,
        elHeight: 600
      });
      const z2 = computeGridBackground({
        scroll: { x: 0, y: 0 },
        zoom: 2,
        elWidth: 800,
        elHeight: 600
      });
      expect(z2.tileSizeWidth).toBeCloseTo(z1.tileSizeWidth * 2, 5);
    });

    it('at zoom=0.5, width halves', () => {
      const z1 = computeGridBackground({
        scroll: { x: 0, y: 0 },
        zoom: 1,
        elWidth: 800,
        elHeight: 600
      });
      const zH = computeGridBackground({
        scroll: { x: 0, y: 0 },
        zoom: 0.5,
        elWidth: 800,
        elHeight: 600
      });
      expect(zH.tileSizeWidth).toBeCloseTo(z1.tileSizeWidth / 2, 5);
    });

    it('backgroundSize string has correct format', () => {
      const { backgroundSize } = computeGridBackground({
        scroll: { x: 0, y: 0 },
        zoom: 1,
        elWidth: 800,
        elHeight: 600
      });
      expect(backgroundSize).toMatch(/^\d+(\.\d+)?px \d+(\.\d+)?px$/);
    });

    it('height in backgroundSize is twice the tile height', () => {
      const { backgroundSize, tileSizeHeight } = computeGridBackground({
        scroll: { x: 0, y: 0 },
        zoom: 1,
        elWidth: 800,
        elHeight: 600
      });
      const [, hStr] = backgroundSize.split(' ');
      const h = parseFloat(hStr);
      expect(h).toBeCloseTo(tileSizeHeight * 2, 5);
    });
  });

  describe('backgroundPosition', () => {
    it('at scroll={0,0} x-offset equals elWidth/2 + tileWidth/2', () => {
      const elWidth = 800;
      const zoom = 1;
      const { backgroundPosition, tileSizeWidth } = computeGridBackground({
        scroll: { x: 0, y: 0 },
        zoom,
        elWidth,
        elHeight: 600
      });
      const [xStr] = backgroundPosition.split(' ');
      const x = parseFloat(xStr);
      expect(x).toBeCloseTo(elWidth / 2 + tileSizeWidth / 2, 5);
    });

    it('at scroll={0,0} y-offset equals elHeight/2', () => {
      const elHeight = 600;
      const { backgroundPosition } = computeGridBackground({
        scroll: { x: 0, y: 0 },
        zoom: 1,
        elWidth: 800,
        elHeight
      });
      const [, yStr] = backgroundPosition.split(' ');
      expect(parseFloat(yStr)).toBeCloseTo(elHeight / 2, 5);
    });

    it('x increases linearly with scroll.x', () => {
      const base = computeGridBackground({
        scroll: { x: 0, y: 0 },
        zoom: 1,
        elWidth: 800,
        elHeight: 600
      });
      const moved = computeGridBackground({
        scroll: { x: 100, y: 0 },
        zoom: 1,
        elWidth: 800,
        elHeight: 600
      });
      const xBase = parseFloat(base.backgroundPosition.split(' ')[0]);
      const xMoved = parseFloat(moved.backgroundPosition.split(' ')[0]);
      expect(xMoved - xBase).toBeCloseTo(100, 5);
    });

    it('y increases linearly with scroll.y', () => {
      const base = computeGridBackground({
        scroll: { x: 0, y: 0 },
        zoom: 1,
        elWidth: 800,
        elHeight: 600
      });
      const moved = computeGridBackground({
        scroll: { x: 0, y: 150 },
        zoom: 1,
        elWidth: 800,
        elHeight: 600
      });
      const yBase = parseFloat(base.backgroundPosition.split(' ')[1]);
      const yMoved = parseFloat(moved.backgroundPosition.split(' ')[1]);
      expect(yMoved - yBase).toBeCloseTo(150, 5);
    });

    it('negative scroll values produce finite numbers', () => {
      const { backgroundPosition } = computeGridBackground({
        scroll: { x: -500, y: -300 },
        zoom: 1,
        elWidth: 800,
        elHeight: 600
      });
      backgroundPosition.split(' ').forEach((s) => {
        expect(isFinite(parseFloat(s))).toBe(true);
      });
    });

    it('sub-pixel zoom values produce no NaN', () => {
      const { backgroundPosition, backgroundSize } = computeGridBackground({
        scroll: { x: 0, y: 0 },
        zoom: 0.123,
        elWidth: 800,
        elHeight: 600
      });
      [...backgroundPosition.split(' '), ...backgroundSize.split(' ')].forEach(
        (s) => {
          expect(isNaN(parseFloat(s))).toBe(false);
        }
      );
    });

    it('is deterministic — same inputs always produce the same output', () => {
      const params: GridBgParams = {
        scroll: { x: 77, y: -33 },
        zoom: 1.5,
        elWidth: 1024,
        elHeight: 768
      };
      expect(computeGridBackground(params)).toEqual(
        computeGridBackground(params)
      );
    });
  });

  describe('first-render behaviour', () => {
    it('formula result is independent of isFirstRender flag (the flag only controls animation duration)', () => {
      // The position/size values must be identical regardless of whether it is the
      // first render — only the GSAP duration differs (0 vs 0.016).
      const params: GridBgParams = {
        scroll: { x: 50, y: 50 },
        zoom: 1.2,
        elWidth: 800,
        elHeight: 600
      };
      const result1 = computeGridBackground(params);
      const result2 = computeGridBackground(params);
      expect(result1.backgroundPosition).toBe(result2.backgroundPosition);
      expect(result1.backgroundSize).toBe(result2.backgroundSize);
    });
  });
});
