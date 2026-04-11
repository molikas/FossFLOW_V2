// @ts-nocheck
/**
 * Unit tests for pure isoMath utilities.
 * Canvas-dependent functions (getTextWidth, getTextBoxDimensions) are excluded.
 */

import {
  getTilePosition,
  isoToScreen,
  sortByPosition,
  getGridSubset,
  isWithinBounds,
  getBoundingBox,
  getBoundingBoxSize,
  getIsoMatrix,
  getIsoProjectionCss,
  getTranslateCSS,
  incrementZoom,
  decrementZoom,
  getConnectorDirectionIcon,
  hasMovedTile,
  getTileScrollPosition,
  convertBoundsToNamedAnchors,
  getRectangleFromSize,
  getAnchorAtTile,
  getAnchorParent,
  normalisePositionFromOrigin
} from 'src/utils/isoMath';

// ---------------------------------------------------------------------------
// getTilePosition — all TileOrigin branches
// ---------------------------------------------------------------------------

describe('getTilePosition', () => {
  const tile = { x: 2, y: 2 };

  it('CENTER (default) returns base position', () => {
    const result = getTilePosition({ tile });
    expect(typeof result.x).toBe('number');
    expect(typeof result.y).toBe('number');
  });

  it('TOP offsets y by -halfH', () => {
    const center = getTilePosition({ tile });
    const top = getTilePosition({ tile, origin: 'TOP' });
    expect(top.x).toBe(center.x);
    expect(top.y).toBeLessThan(center.y);
  });

  it('BOTTOM offsets y by +halfH', () => {
    const center = getTilePosition({ tile });
    const bottom = getTilePosition({ tile, origin: 'BOTTOM' });
    expect(bottom.x).toBe(center.x);
    expect(bottom.y).toBeGreaterThan(center.y);
  });

  it('LEFT offsets x by -halfW', () => {
    const center = getTilePosition({ tile });
    const left = getTilePosition({ tile, origin: 'LEFT' });
    expect(left.x).toBeLessThan(center.x);
    expect(left.y).toBe(center.y);
  });

  it('RIGHT offsets x by +halfW', () => {
    const center = getTilePosition({ tile });
    const right = getTilePosition({ tile, origin: 'RIGHT' });
    expect(right.x).toBeGreaterThan(center.x);
    expect(right.y).toBe(center.y);
  });
});

// ---------------------------------------------------------------------------
// isoToScreen
// ---------------------------------------------------------------------------

describe('isoToScreen', () => {
  it('centres the tile position within the renderer', () => {
    const rendererSize = { width: 800, height: 600 };
    const result = isoToScreen({ tile: { x: 0, y: 0 }, rendererSize });
    expect(result.x).toBe(rendererSize.width / 2);
    expect(result.y).toBe(rendererSize.height / 2);
  });
});

// ---------------------------------------------------------------------------
// sortByPosition / getGridSubset / isWithinBounds
// ---------------------------------------------------------------------------

describe('sortByPosition', () => {
  it('returns correct low/high bounds', () => {
    const tiles = [{ x: 3, y: 1 }, { x: 1, y: 4 }, { x: 2, y: 2 }];
    const { lowX, lowY, highX, highY } = sortByPosition(tiles);
    expect(lowX).toBe(1);
    expect(lowY).toBe(1);
    expect(highX).toBe(3);
    expect(highY).toBe(4);
  });
});

describe('getGridSubset', () => {
  it('returns all tiles between corners inclusive', () => {
    const tiles = [{ x: 0, y: 0 }, { x: 2, y: 2 }];
    const subset = getGridSubset(tiles);
    expect(subset).toHaveLength(9); // 3×3
  });
});

describe('isWithinBounds', () => {
  const bounds = [{ x: 0, y: 0 }, { x: 4, y: 4 }];

  it('returns true for tile inside bounds', () => {
    expect(isWithinBounds({ x: 2, y: 2 }, bounds)).toBe(true);
  });

  it('returns true for tile on boundary', () => {
    expect(isWithinBounds({ x: 0, y: 0 }, bounds)).toBe(true);
    expect(isWithinBounds({ x: 4, y: 4 }, bounds)).toBe(true);
  });

  it('returns false for tile outside bounds', () => {
    expect(isWithinBounds({ x: 5, y: 5 }, bounds)).toBe(false);
    expect(isWithinBounds({ x: -1, y: 2 }, bounds)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getBoundingBox / getBoundingBoxSize
// ---------------------------------------------------------------------------

describe('getBoundingBox', () => {
  it('returns 4-corner bounding box without offset', () => {
    const tiles = [{ x: 1, y: 2 }, { x: 5, y: 8 }];
    const box = getBoundingBox(tiles);
    expect(box).toHaveLength(4);
    expect(box[0]).toEqual({ x: 1, y: 2 }); // low x, low y
    expect(box[2]).toEqual({ x: 5, y: 8 }); // high x, high y
  });

  it('expands bounding box by offset', () => {
    const tiles = [{ x: 2, y: 2 }, { x: 4, y: 4 }];
    const box = getBoundingBox(tiles, { x: 1, y: 1 });
    expect(box[0]).toEqual({ x: 1, y: 1 });
    expect(box[2]).toEqual({ x: 5, y: 5 });
  });
});

describe('getBoundingBoxSize', () => {
  it('returns correct width and height', () => {
    const box = [{ x: 1, y: 2 }, { x: 5, y: 6 }, { x: 5, y: 2 }, { x: 1, y: 6 }];
    const size = getBoundingBoxSize(box);
    expect(size.width).toBe(5);  // 5 - 1 + 1
    expect(size.height).toBe(5); // 6 - 2 + 1
  });
});

// ---------------------------------------------------------------------------
// getIsoMatrix / getIsoProjectionCss
// ---------------------------------------------------------------------------

describe('getIsoMatrix', () => {
  it('returns base values for X orientation', () => {
    const matrix = getIsoMatrix('X');
    expect(matrix).toHaveLength(6);
    expect(matrix[0]).toBeCloseTo(0.707);
  });

  it('returns flipped values for Y orientation', () => {
    const matrixX = getIsoMatrix('X');
    const matrixY = getIsoMatrix('Y');
    expect(matrixY[1]).toBe(-matrixX[1]);
    expect(matrixY[2]).toBe(-matrixX[2]);
  });

  it('falls through to default (X) when no orientation given', () => {
    const defaultMatrix = getIsoMatrix();
    const xMatrix = getIsoMatrix('X');
    expect(defaultMatrix).toEqual(xMatrix);
  });
});

describe('getIsoProjectionCss', () => {
  it('returns a matrix() CSS string', () => {
    const css = getIsoProjectionCss();
    expect(css).toMatch(/^matrix\(/);
  });
});

// ---------------------------------------------------------------------------
// getTranslateCSS
// ---------------------------------------------------------------------------

describe('getTranslateCSS', () => {
  it('returns translate CSS string with provided coords', () => {
    expect(getTranslateCSS({ x: 10, y: 20 })).toBe('translate(10px, 20px)');
  });

  it('defaults to (0, 0) when no coords provided', () => {
    expect(getTranslateCSS()).toBe('translate(0px, 0px)');
  });
});

// ---------------------------------------------------------------------------
// incrementZoom / decrementZoom — boundary clamping
// ---------------------------------------------------------------------------

describe('incrementZoom', () => {
  it('increments zoom by ZOOM_INCREMENT (0.05)', () => {
    const result = incrementZoom(0.5);
    expect(result).toBeCloseTo(0.55);
  });

  it('does not exceed MAX_ZOOM (1)', () => {
    expect(incrementZoom(0.99)).toBe(1);
    expect(incrementZoom(1)).toBe(1);
  });
});

describe('decrementZoom', () => {
  it('decrements zoom by ZOOM_INCREMENT (0.05)', () => {
    const result = decrementZoom(0.5);
    expect(result).toBeCloseTo(0.45);
  });

  it('does not go below MIN_ZOOM (0.1)', () => {
    expect(decrementZoom(0.11)).toBeCloseTo(0.1);
    expect(decrementZoom(0.1)).toBe(0.1);
  });
});

// ---------------------------------------------------------------------------
// getConnectorDirectionIcon — all rotation branches
// ---------------------------------------------------------------------------

describe('getConnectorDirectionIcon', () => {
  it('returns null when fewer than 2 tiles', () => {
    expect(getConnectorDirectionIcon([])).toBeNull();
    expect(getConnectorDirectionIcon([{ x: 0, y: 0 }])).toBeNull();
  });

  it('rotation 90 when moving right with same y', () => {
    const result = getConnectorDirectionIcon([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
    expect(result?.rotation).toBe(90);
  });

  it('rotation 135 when moving right and down', () => {
    const result = getConnectorDirectionIcon([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(result?.rotation).toBe(135);
  });

  it('rotation 45 when moving right and up', () => {
    const result = getConnectorDirectionIcon([{ x: 0, y: 1 }, { x: 1, y: 0 }]);
    expect(result?.rotation).toBe(45);
  });

  it('rotation -90 when moving left with same y', () => {
    const result = getConnectorDirectionIcon([{ x: 1, y: 0 }, { x: 0, y: 0 }]);
    expect(result?.rotation).toBe(-90);
  });

  it('rotation -135 when moving left and down', () => {
    const result = getConnectorDirectionIcon([{ x: 1, y: 0 }, { x: 0, y: 1 }]);
    expect(result?.rotation).toBe(-135);
  });

  it('rotation -45 when moving left and up', () => {
    const result = getConnectorDirectionIcon([{ x: 1, y: 1 }, { x: 0, y: 0 }]);
    expect(result?.rotation).toBe(-45);
  });

  it('rotation 180 when moving straight down (same x, y increases)', () => {
    const result = getConnectorDirectionIcon([{ x: 0, y: 0 }, { x: 0, y: 1 }]);
    expect(result?.rotation).toBe(180);
  });

  it('rotation 0 when moving straight up (same x, y decreases)', () => {
    const result = getConnectorDirectionIcon([{ x: 0, y: 1 }, { x: 0, y: 0 }]);
    expect(result?.rotation).toBe(0);
  });

  it('rotation -90 when same tile (iconTile === lastTile)', () => {
    const result = getConnectorDirectionIcon([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    expect(result?.rotation).toBe(-90);
  });
});

// ---------------------------------------------------------------------------
// hasMovedTile
// ---------------------------------------------------------------------------

describe('hasMovedTile', () => {
  it('returns false when delta is null', () => {
    expect(hasMovedTile({ delta: null })).toBe(false);
  });

  it('returns false when delta tile is {0, 0}', () => {
    expect(hasMovedTile({ delta: { tile: { x: 0, y: 0 } } })).toBe(false);
  });

  it('returns true when delta tile is non-zero', () => {
    expect(hasMovedTile({ delta: { tile: { x: 1, y: 0 } } })).toBe(true);
    expect(hasMovedTile({ delta: { tile: { x: 0, y: -1 } } })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getTileScrollPosition
// ---------------------------------------------------------------------------

describe('getTileScrollPosition', () => {
  it('returns negated tile screen position', () => {
    const result = getTileScrollPosition({ x: 0, y: 0 });
    expect(Math.abs(result.x)).toBe(0);
    expect(Math.abs(result.y)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// convertBoundsToNamedAnchors
// ---------------------------------------------------------------------------

describe('convertBoundsToNamedAnchors', () => {
  it('maps bounding box corners to named anchors', () => {
    const box = [
      { x: 0, y: 0 }, // BOTTOM_LEFT
      { x: 4, y: 0 }, // BOTTOM_RIGHT
      { x: 4, y: 4 }, // TOP_RIGHT
      { x: 0, y: 4 }  // TOP_LEFT
    ] as any;
    const anchors = convertBoundsToNamedAnchors(box);
    expect(anchors.BOTTOM_LEFT).toEqual({ x: 0, y: 0 });
    expect(anchors.BOTTOM_RIGHT).toEqual({ x: 4, y: 0 });
    expect(anchors.TOP_RIGHT).toEqual({ x: 4, y: 4 });
    expect(anchors.TOP_LEFT).toEqual({ x: 0, y: 4 });
  });
});

// ---------------------------------------------------------------------------
// getRectangleFromSize
// ---------------------------------------------------------------------------

describe('getRectangleFromSize', () => {
  it('returns from/to rectangle from origin and size', () => {
    const result = getRectangleFromSize({ x: 1, y: 2 }, { width: 3, height: 4 });
    expect(result.from).toEqual({ x: 1, y: 2 });
    expect(result.to).toEqual({ x: 4, y: 6 });
  });
});

// ---------------------------------------------------------------------------
// normalisePositionFromOrigin
// ---------------------------------------------------------------------------

describe('normalisePositionFromOrigin', () => {
  it('subtracts position from origin', () => {
    const result = normalisePositionFromOrigin({
      position: { x: 3, y: 4 },
      origin: { x: 10, y: 10 }
    });
    expect(result).toEqual({ x: 7, y: 6 });
  });
});

// ---------------------------------------------------------------------------
// getAnchorAtTile
// ---------------------------------------------------------------------------

describe('getAnchorAtTile', () => {
  const anchors = [
    { id: 'a1', ref: { tile: { x: 1, y: 1 } } },
    { id: 'a2', ref: { tile: { x: 3, y: 3 } } },
    { id: 'a3', ref: { item: 'item-1' } }
  ] as any[];

  it('returns anchor at matching tile', () => {
    const result = getAnchorAtTile({ x: 1, y: 1 }, anchors);
    expect(result?.id).toBe('a1');
  });

  it('returns undefined when no anchor at tile', () => {
    const result = getAnchorAtTile({ x: 9, y: 9 }, anchors);
    expect(result).toBeUndefined();
  });

  it('skips anchors without tile ref', () => {
    // a3 has no tile ref — should not match
    const result = getAnchorAtTile({ x: 0, y: 0 }, [{ id: 'a3', ref: { item: 'item-1' } } as any]);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAnchorParent
// ---------------------------------------------------------------------------

describe('getAnchorParent', () => {
  const connectors = [
    { id: 'con1', anchors: [{ id: 'a1', ref: {} }, { id: 'a2', ref: {} }] },
    { id: 'con2', anchors: [{ id: 'a3', ref: {} }] }
  ] as any[];

  it('returns the connector that owns the anchor', () => {
    const result = getAnchorParent('a3', connectors);
    expect(result.id).toBe('con2');
  });

  it('throws when anchor id is not found', () => {
    expect(() => getAnchorParent('unknown', connectors)).toThrow();
  });
});
