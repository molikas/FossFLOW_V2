import { isPointInPolygon, screenPathToTilePath, createSmoothPath } from '../pointInPolygon';

// ---------------------------------------------------------------------------
// isPointInPolygon — ray casting
// ---------------------------------------------------------------------------
describe('isPointInPolygon', () => {
  it('returns false for polygon with fewer than 3 vertices', () => {
    expect(isPointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
    expect(isPointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toBe(false);
    expect(isPointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });

  it('returns true for point inside a triangle', () => {
    // Triangle: (0,0), (10,0), (5,10)
    const triangle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
    expect(isPointInPolygon({ x: 5, y: 4 }, triangle)).toBe(true);
  });

  it('returns false for point outside a triangle', () => {
    const triangle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
    expect(isPointInPolygon({ x: 0, y: 10 }, triangle)).toBe(false);
    expect(isPointInPolygon({ x: 15, y: 5 }, triangle)).toBe(false);
    expect(isPointInPolygon({ x: 5, y: -1 }, triangle)).toBe(false);
  });

  it('returns true for point inside a square', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(isPointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(isPointInPolygon({ x: 1, y: 1 }, square)).toBe(true);
    expect(isPointInPolygon({ x: 9, y: 9 }, square)).toBe(true);
  });

  it('returns false for point outside a square', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(isPointInPolygon({ x: -1, y: 5 }, square)).toBe(false);
    expect(isPointInPolygon({ x: 11, y: 5 }, square)).toBe(false);
    expect(isPointInPolygon({ x: 5, y: 11 }, square)).toBe(false);
    expect(isPointInPolygon({ x: 5, y: -1 }, square)).toBe(false);
  });

  it('returns true for point inside an irregular polygon', () => {
    // L-shaped polygon
    const poly = [
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 },
      { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }
    ];
    expect(isPointInPolygon({ x: 1, y: 1 }, poly)).toBe(true);
    expect(isPointInPolygon({ x: 3, y: 1 }, poly)).toBe(true);
  });

  it('returns false for point outside an irregular polygon', () => {
    const poly = [
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 },
      { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }
    ];
    // This point is in the "missing" part of the L
    expect(isPointInPolygon({ x: 3, y: 3 }, poly)).toBe(false);
  });

  it('handles negative coordinates', () => {
    const square = [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }];
    expect(isPointInPolygon({ x: 0, y: 0 }, square)).toBe(true);
    expect(isPointInPolygon({ x: -3, y: 3 }, square)).toBe(true);
    expect(isPointInPolygon({ x: 6, y: 0 }, square)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// screenPathToTilePath
// ---------------------------------------------------------------------------
describe('screenPathToTilePath', () => {
  it('maps each point through the transform function', () => {
    const screenPath = [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }];
    // Shift each coordinate by (1, 2)
    const transform = (c: { x: number; y: number }) => ({ x: c.x + 1, y: c.y + 2 });
    const result = screenPathToTilePath(screenPath, transform);
    expect(result).toEqual([{ x: 11, y: 22 }, { x: 31, y: 42 }, { x: 51, y: 62 }]);
  });

  it('returns empty array for empty input', () => {
    expect(screenPathToTilePath([], jest.fn())).toEqual([]);
  });

  it('calls transform once per point', () => {
    const transform = jest.fn((c: any) => c);
    const points = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    screenPathToTilePath(points, transform);
    expect(transform).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// createSmoothPath
// ---------------------------------------------------------------------------
describe('createSmoothPath', () => {
  it('returns empty string for fewer than 2 points', () => {
    expect(createSmoothPath([])).toBe('');
    expect(createSmoothPath([{ x: 0, y: 0 }])).toBe('');
  });

  it('returns a path string starting with M for 2+ points', () => {
    const path = createSmoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    expect(path).toMatch(/^M 0,0/);
  });

  it('path for 2 points contains M, L, Q and ends with Z', () => {
    const path = createSmoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    expect(path).toContain('M 0,0');
    expect(path).toContain('L ');
    expect(path).toContain('Q ');
    expect(path.trimEnd()).toMatch(/Z$/);
  });

  it('path for 3+ points contains quadratic curves', () => {
    const points = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 5 }, { x: 10, y: 10 }];
    const path = createSmoothPath(points);
    // Should have multiple Q commands (quadratic bezier)
    const qCount = (path.match(/Q /g) ?? []).length;
    expect(qCount).toBeGreaterThan(1);
    expect(path.trimEnd()).toMatch(/Z$/);
  });

  it('closes path with Z', () => {
    const path = createSmoothPath([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }
    ]);
    expect(path).toContain(' Z');
  });
});
