import { Coords, Size, Scroll } from 'src/types';
import { CoordsUtils, SizeUtils } from 'src/utils';
import {
  PROJECTED_TILE_SIZE,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_INCREMENT
} from 'src/config';
import {
  getGridSubset,
  isWithinBounds,
  screenToIso,
  incrementZoom,
  decrementZoom,
  getItemAtTile
} from '../renderer';

const getRendererSize = (tileSize: Size, zoom: number = 1): Size => {
  const projectedTileSize = SizeUtils.multiply(PROJECTED_TILE_SIZE, zoom);

  return {
    width: projectedTileSize.width * tileSize.width,
    height: projectedTileSize.height * tileSize.height
  };
};

const getScroll = (coords: Coords): Scroll => {
  return {
    position: coords,
    offset: CoordsUtils.zero()
  };
};

describe('Tests renderer utils', () => {
  test('getGridSubset() works correctly', () => {
    const gridSubset = getGridSubset([
      { x: 5, y: 5 },
      { x: 7, y: 7 }
    ]);

    expect(gridSubset).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 5, y: 7 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 6, y: 7 },
      { x: 7, y: 5 },
      { x: 7, y: 6 },
      { x: 7, y: 7 }
    ]);
  });

  test('isWithinBounds() works correctly', () => {
    const bounds: Coords[] = [
      { x: 4, y: 4 },
      { x: 6, y: 6 }
    ];

    const withinBounds = isWithinBounds({ x: 5, y: 5 }, bounds);
    const onBorder = isWithinBounds({ x: 4, y: 4 }, bounds);
    const outsideBounds = isWithinBounds({ x: 3, y: 3 }, bounds);

    expect(withinBounds).toBe(true);
    expect(onBorder).toBe(true);
    expect(outsideBounds).toBe(false);
  });

  test('isWithinBounds() works with reversed bounds (bottom-right to top-left drag)', () => {
    // Lasso dragged from bottom-right to top-left — sortByPosition normalises the order
    const bounds: Coords[] = [
      { x: 6, y: 6 },
      { x: 4, y: 4 }
    ];

    expect(isWithinBounds({ x: 5, y: 5 }, bounds)).toBe(true);
    expect(isWithinBounds({ x: 4, y: 4 }, bounds)).toBe(true);
    expect(isWithinBounds({ x: 6, y: 6 }, bounds)).toBe(true);
    expect(isWithinBounds({ x: 3, y: 5 }, bounds)).toBe(false);
    expect(isWithinBounds({ x: 5, y: 7 }, bounds)).toBe(false);
  });

  test('isWithinBounds() works for a single-tile selection', () => {
    const bounds: Coords[] = [
      { x: 3, y: 3 },
      { x: 3, y: 3 }
    ];

    expect(isWithinBounds({ x: 3, y: 3 }, bounds)).toBe(true);
    expect(isWithinBounds({ x: 3, y: 4 }, bounds)).toBe(false);
    expect(isWithinBounds({ x: 4, y: 3 }, bounds)).toBe(false);
  });

  test('isWithinBounds() — far-corner tiles are included, just-outside tiles are not', () => {
    const bounds: Coords[] = [
      { x: 2, y: 2 },
      { x: 5, y: 5 }
    ];

    // All four corners are inside
    expect(isWithinBounds({ x: 2, y: 2 }, bounds)).toBe(true);
    expect(isWithinBounds({ x: 5, y: 5 }, bounds)).toBe(true);
    expect(isWithinBounds({ x: 2, y: 5 }, bounds)).toBe(true);
    expect(isWithinBounds({ x: 5, y: 2 }, bounds)).toBe(true);

    // One tile outside each edge
    expect(isWithinBounds({ x: 1, y: 3 }, bounds)).toBe(false);
    expect(isWithinBounds({ x: 6, y: 3 }, bounds)).toBe(false);
    expect(isWithinBounds({ x: 3, y: 1 }, bounds)).toBe(false);
    expect(isWithinBounds({ x: 3, y: 6 }, bounds)).toBe(false);
  });

  test('screenToIso() works correctly when mouse is at center of project', () => {
    const zoom = 1;
    const rendererSize = getRendererSize({ width: 10, height: 10 }, zoom);
    const scroll = getScroll({ x: 0, y: 0 });
    const tile = screenToIso({
      mouse: {
        x: rendererSize.width / 2,
        y: rendererSize.height / 2
      },
      zoom,
      scroll,
      rendererSize
    });

    expect(tile).toEqual({ x: 0, y: -0 });
  });

  test('screenToIso() works correctly when mouse is at topLeft corner of project', () => {
    const zoom = 1;
    const rendererSize = getRendererSize({ width: 10, height: 10 }, zoom);
    const scroll = getScroll({ x: 0, y: 0 });
    const tile = screenToIso({
      mouse: {
        x: 0,
        y: 0
      },
      zoom,
      scroll,
      rendererSize
    });

    expect(tile).toEqual({ x: 0, y: 10 });
  });

  test('screenToIso() works correctly when mouse is at topLeft corner of project and zoom is 0.5', () => {
    const zoom = 0.5;
    const rendererSize = getRendererSize({ width: 10, height: 10 }, zoom);
    const scroll = getScroll({ x: 0, y: 0 });
    const tile = screenToIso({
      mouse: {
        x: 0,
        y: 0
      },
      zoom,
      scroll,
      rendererSize
    });

    expect(tile).toEqual({ x: 0, y: 10 });
  });

  test('screenToIso() works correctly when mouse is at center of project and zoom 0.5 and halfway scrolled', () => {
    const zoom = 1;
    const rendererSize = getRendererSize({ width: 10, height: 10 }, zoom);
    const scroll = getScroll({
      x: rendererSize.width / 2,
      y: rendererSize.height / 2
    });
    const tile = screenToIso({
      mouse: {
        x: rendererSize.width / 2,
        y: rendererSize.height / 2
      },
      zoom,
      scroll,
      rendererSize
    });

    expect(tile).toEqual({ x: 0, y: 10 });
  });
});

describe('incrementZoom / decrementZoom — boundary enforcement', () => {
  test('incrementZoom at MAX_ZOOM returns MAX_ZOOM (clamped)', () => {
    expect(incrementZoom(MAX_ZOOM)).toBe(MAX_ZOOM);
  });

  test('incrementZoom above MAX_ZOOM still returns MAX_ZOOM', () => {
    expect(incrementZoom(MAX_ZOOM + 0.5)).toBe(MAX_ZOOM);
  });

  test('decrementZoom at MIN_ZOOM returns MIN_ZOOM (clamped)', () => {
    expect(decrementZoom(MIN_ZOOM)).toBe(MIN_ZOOM);
  });

  test('decrementZoom below MIN_ZOOM still returns MIN_ZOOM', () => {
    expect(decrementZoom(0)).toBe(MIN_ZOOM);
    expect(decrementZoom(-1)).toBe(MIN_ZOOM);
  });

  test('incrementZoom adds ZOOM_INCREMENT from a mid-range value', () => {
    expect(incrementZoom(0.5)).toBeCloseTo(0.5 + ZOOM_INCREMENT, 5);
  });

  test('decrementZoom subtracts ZOOM_INCREMENT from a mid-range value', () => {
    expect(decrementZoom(0.5)).toBeCloseTo(0.5 - ZOOM_INCREMENT, 5);
  });

  test('result never has more than 2 decimal places (no float drift across full range)', () => {
    let zoom = MIN_ZOOM;
    while (zoom < MAX_ZOOM) {
      zoom = incrementZoom(zoom);
      const decimals = zoom.toString().includes('.')
        ? zoom.toString().split('.')[1].length
        : 0;
      expect(decimals).toBeLessThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// getItemAtTile() — stacked rectangle selection (Bug fix: z-order hit-test)
// ---------------------------------------------------------------------------
describe('getItemAtTile() — stacked rectangle z-order', () => {
  const emptyScene = {
    items: [],
    textBoxes: [],
    connectors: [],
    hitConnectors: [],
    rectangles: []
  };

  test('stacked rectangles — returns the last in array (visually topmost)', () => {
    const scene = {
      ...emptyScene,
      rectangles: [
        { id: 'r-bottom', from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
        { id: 'r-top', from: { x: 0, y: 0 }, to: { x: 5, y: 5 } }
      ]
    };
    const result = getItemAtTile({ tile: { x: 2, y: 2 }, scene } as any);
    expect(result).toEqual({ type: 'RECTANGLE', id: 'r-top' });
  });

  test('stacked rectangles — first in array (visually below) is not returned when top covers the same tile', () => {
    const scene = {
      ...emptyScene,
      rectangles: [
        { id: 'r-bottom', from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
        { id: 'r-top', from: { x: 0, y: 0 }, to: { x: 5, y: 5 } }
      ]
    };
    const result = getItemAtTile({ tile: { x: 2, y: 2 }, scene } as any);
    expect(result?.id).not.toBe('r-bottom');
  });

  test('single rectangle — hit-test still works', () => {
    const scene = {
      ...emptyScene,
      rectangles: [{ id: 'solo', from: { x: 1, y: 1 }, to: { x: 4, y: 4 } }]
    };
    expect(getItemAtTile({ tile: { x: 2, y: 2 }, scene } as any)).toEqual({
      type: 'RECTANGLE',
      id: 'solo'
    });
    expect(getItemAtTile({ tile: { x: 5, y: 5 }, scene } as any)).toBeNull();
  });

  test('tile outside all rectangles — returns null', () => {
    const scene = {
      ...emptyScene,
      rectangles: [
        { id: 'r1', from: { x: 0, y: 0 }, to: { x: 3, y: 3 } },
        { id: 'r2', from: { x: 5, y: 5 }, to: { x: 8, y: 8 } }
      ]
    };
    expect(getItemAtTile({ tile: { x: 4, y: 4 }, scene } as any)).toBeNull();
  });
});
