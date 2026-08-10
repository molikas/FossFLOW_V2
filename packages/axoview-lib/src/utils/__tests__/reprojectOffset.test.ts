/**
 * Promoted from the 2026-07 exploratory lane (R1/PROJ-06, R1/PROJ-07 — both
 * ruled 2026-07-30, ADR 0023 addendums).
 */
import {
  reprojectOffset,
  isometricStrategy,
  cartesian2DStrategy
} from '../coordinateTransforms';
import { getRenderedAreaCorners } from '../renderedGeometry';
import { makeTilePositionFn } from '../coordinateTransforms';
import { TILE_PROJECTION_MULTIPLIERS, UNPROJECTED_TILE_SIZE } from 'src/config';

describe('reprojectOffset — the residual across a projection switch (PROJ-07)', () => {
  // The campaign's measured residual: inside the ISO tile diamond
  // (58 / 70.75 = 0.82), outside the 2D tile square (58 > 50).
  const MEASURED = { x: 58, y: 0 };

  it('a residual inside the ISO cell lands inside the 2D cell', () => {
    const half2D = UNPROJECTED_TILE_SIZE / 2;
    const out = reprojectOffset(
      isometricStrategy,
      cartesian2DStrategy,
      MEASURED
    );

    // Carried byte-identical (the bug), 58 > 50 put the item mostly over the
    // NEIGHBOURING 2D cell — where tile-based collision lets a second item sit.
    expect(Math.abs(out.x)).toBeLessThanOrEqual(half2D);
    expect(Math.abs(out.y)).toBeLessThanOrEqual(half2D);
  });

  it('round-trips exactly — repeated toggling cannot drift', () => {
    for (const offset of [
      MEASURED,
      { x: -37, y: 19 },
      { x: 0, y: 0 },
      { x: 12.5, y: -44.25 }
    ]) {
      const there = reprojectOffset(
        isometricStrategy,
        cartesian2DStrategy,
        offset
      );
      const back = reprojectOffset(
        cartesian2DStrategy,
        isometricStrategy,
        there
      );
      expect(back.x).toBeCloseTo(offset.x, 9);
      expect(back.y).toBeCloseTo(offset.y, 9);
    }
  });

  it('is the identity when the projection does not change', () => {
    const out = reprojectOffset(
      isometricStrategy,
      isometricStrategy,
      MEASURED
    );
    expect(out.x).toBeCloseTo(MEASURED.x, 9);
    expect(out.y).toBeCloseTo(MEASURED.y, 9);
  });

  it('leaves a zero residual at zero', () => {
    expect(
      reprojectOffset(isometricStrategy, cartesian2DStrategy, { x: 0, y: 0 })
    ).toEqual({ x: 0, y: 0 });
  });
});

describe('area quads use the exact projection ratio (PROJ-06)', () => {
  const getTilePosition = makeTilePositionFn(isometricStrategy);

  /**
   * The far corner of an N-tile-wide area quad vs the exact projection of the
   * tile it claims. The 3-decimal constants drifted hypot(0.05, 0.05) px per
   * tile of extent — 1.41 px at 20 tiles, 2.83 px at 40.
   */
  const farCornerDrift = (widthTiles: number) => {
    const from = { x: 0, y: 0 };
    const to = { x: widthTiles - 1, y: 0 };
    const corners = getRenderedAreaCorners(
      from,
      to,
      undefined,
      getTilePosition,
      'ISOMETRIC'
    );
    // Corner [1] is the origin plus the full width along the run axis.
    const base = getTilePosition({ tile: { x: 0, y: 0 }, origin: 'LEFT' });
    const exactW = widthTiles * UNPROJECTED_TILE_SIZE;
    const exact = {
      x: base.x + (TILE_PROJECTION_MULTIPLIERS.width / 2) * exactW,
      y: base.y - (TILE_PROJECTION_MULTIPLIERS.height / 2) * exactW
    };
    return Math.hypot(corners[1].x - exact.x, corners[1].y - exact.y);
  };

  it.each([1, 20, 40, 200])(
    'a %i-tile quad lands on the exact projection, not 0.05px/tile off',
    (tiles) => {
      expect(farCornerDrift(tiles)).toBeLessThan(1e-9);
    }
  );

  it('a 20-tile quad is no longer ~1.4 px adrift', () => {
    // The campaign's measurement, pinned as the thing that must not come back.
    expect(farCornerDrift(20)).toBeLessThan(0.01);
  });
});
