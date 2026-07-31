// Coordinate transform strategies for ISOMETRIC and 2D canvas modes.
//
// Each strategy encapsulates:
//   toScreen   — tile (x,y) → projected canvas position (no zoom, no scroll; SceneLayer handles those)
//   fromScreen — raw screen (x,y) → tile (x,y), accounting for zoom + scroll + renderer center
//   gridTileUrl — path to the SVG background tile asset
//   projectionName — discriminator for consumer logic (e.g. whether to apply CSS matrix)
//
// Both strategies use UNPROJECTED_TILE_SIZE as the canonical tile unit so that
// scene-layer geometry (SVG polylines, etc.) is always drawn in the same coordinate space.

import { PROJECTED_TILE_SIZE, UNPROJECTED_TILE_SIZE } from 'src/config';
import type { Coords, Scroll, Size, TileOrigin } from 'src/types';

// SVG imports are inlined as data-URI strings at build time.
// TypeScript may infer them as React.FC (module.d.ts global.d.ts) — cast to string.
import gridTileSvgRaw from 'src/assets/grid-tile-bg.svg';
import gridTile2dSvgRaw from 'src/assets/grid-tile-2d.svg';
const gridTileSvg = gridTileSvgRaw as unknown as string;
const gridTile2dSvg = gridTile2dSvgRaw as unknown as string;

// ---------------------------------------------------------------------------
// Strategy interface
// ---------------------------------------------------------------------------

export interface CoordinateTransformStrategy {
  /**
   * Convert tile (x, y) to a canvas-space position.
   * This is the CENTER of the tile. Origin offsets are applied by the context wrapper.
   * @param tileX  Tile X coordinate
   * @param tileY  Tile Y coordinate
   * @param tileSize  Canonical (unprojected) tile size in px
   */
  toScreen(tileX: number, tileY: number, tileSize: number): { x: number; y: number };

  /**
   * Inverse of {@link toScreen}: convert an (unscaled, scroll-less) canvas-space
   * point back to a *fractional* tile coordinate. Used to find which tile sits
   * under a given canvas point when re-projecting across a canvas-mode switch.
   * @param canvasX  Canvas-space x (same space toScreen returns)
   * @param canvasY  Canvas-space y
   * @param tileSize  Canonical (unprojected) tile size in px
   */
  fromCanvasPoint(canvasX: number, canvasY: number, tileSize: number): Coords;

  /**
   * Convert a screen-space mouse position to tile coordinates.
   * @param screenX  Mouse x relative to renderer left edge
   * @param screenY  Mouse y relative to renderer top edge
   * @param tileSize  Canonical (unprojected) tile size in px
   * @param zoom  Current zoom level (same as CSS scale on SceneLayer)
   * @param scroll  Current scroll position
   * @param rendererSize  Current renderer dimensions
   */
  fromScreen(
    screenX: number,
    screenY: number,
    tileSize: number,
    zoom: number,
    scroll: Scroll,
    rendererSize: Size
  ): Coords;

  /** Path to the SVG tile used as Grid background */
  gridTileUrl: string;

  /** Discriminator — used by useIsoProjection to decide whether to apply the ISO CSS matrix */
  projectionName: 'ISOMETRIC' | '2D';
}

// ---------------------------------------------------------------------------
// Helpers — origin offset applied in getTilePosition wrapper
// ---------------------------------------------------------------------------

const applyOriginOffset = (
  pos: Coords,
  origin: TileOrigin | undefined,
  halfW: number,
  halfH: number
): Coords => {
  switch (origin) {
    case 'TOP':
      return { x: pos.x, y: pos.y - halfH };
    case 'BOTTOM':
      return { x: pos.x, y: pos.y + halfH };
    case 'LEFT':
      return { x: pos.x - halfW, y: pos.y };
    case 'RIGHT':
      return { x: pos.x + halfW, y: pos.y };
    case 'CENTER':
    default:
      return pos;
  }
};

// ---------------------------------------------------------------------------
// Isometric strategy
// ---------------------------------------------------------------------------

export const isometricStrategy: CoordinateTransformStrategy = {
  projectionName: 'ISOMETRIC',
  gridTileUrl: gridTileSvg,

  toScreen(tileX, tileY, tileSize) {
    // The projected tile dimensions preserve the TILE_PROJECTION_MULTIPLIERS ratio.
    // We re-derive halfW/halfH from tileSize rather than the global constant so
    // this function is self-contained and testable with any tile size.
    const projectedWidth = tileSize * (PROJECTED_TILE_SIZE.width / UNPROJECTED_TILE_SIZE);
    const projectedHeight = tileSize * (PROJECTED_TILE_SIZE.height / UNPROJECTED_TILE_SIZE);
    const halfW = projectedWidth / 2;
    const halfH = projectedHeight / 2;
    return {
      x: halfW * tileX - halfW * tileY,
      y: -(halfH * tileX + halfH * tileY)
    };
  },

  fromCanvasPoint(canvasX, canvasY, tileSize) {
    const projectedWidth = tileSize * (PROJECTED_TILE_SIZE.width / UNPROJECTED_TILE_SIZE);
    const projectedHeight = tileSize * (PROJECTED_TILE_SIZE.height / UNPROJECTED_TILE_SIZE);
    const halfW = projectedWidth / 2;
    const halfH = projectedHeight / 2;
    // Invert toScreen: canvasX = halfW(tx - ty), canvasY = -halfH(tx + ty).
    const diff = canvasX / halfW; // tx - ty
    const sum = -canvasY / halfH; // tx + ty
    return { x: (diff + sum) / 2, y: (sum - diff) / 2 };
  },

  fromScreen(screenX, screenY, tileSize, zoom, scroll, rendererSize) {
    const projectedWidth = tileSize * (PROJECTED_TILE_SIZE.width / UNPROJECTED_TILE_SIZE);
    const projectedHeight = tileSize * (PROJECTED_TILE_SIZE.height / UNPROJECTED_TILE_SIZE);
    const scaledW = projectedWidth * zoom;
    const scaledH = projectedHeight * zoom;

    const projX = -rendererSize.width * 0.5 + screenX - scroll.position.x;
    const projY = -rendererSize.height * 0.5 + screenY - scroll.position.y;

    return {
      x: Math.floor((projX + scaledW / 2) / scaledW - projY / scaledH),
      y: (-Math.floor((projY + scaledH / 2) / scaledH + projX / scaledW)) || 0
    };
  }
};

// ---------------------------------------------------------------------------
// Cartesian 2D strategy
// ---------------------------------------------------------------------------

export const cartesian2DStrategy: CoordinateTransformStrategy = {
  projectionName: '2D',
  gridTileUrl: gridTile2dSvg,

  toScreen(tileX, tileY, tileSize) {
    // Negative Y matches the ISO convention: positive tileY goes UP on screen.
    // This keeps diagram spatial relationships identical between modes —
    // elements that were "north" in ISO stay north in 2D.
    // `+ 0` avoids the JS -0 oddity when tileY === 0.
    return {
      x: tileX * tileSize,
      y: -tileY * tileSize + 0
    };
  },

  fromCanvasPoint(canvasX, canvasY, tileSize) {
    // Invert toScreen: canvasX = tx * tileSize, canvasY = -ty * tileSize.
    return { x: canvasX / tileSize, y: -canvasY / tileSize || 0 };
  },

  fromScreen(screenX, screenY, tileSize, zoom, scroll, rendererSize) {
    const scaledTile = tileSize * zoom;
    const half = scaledTile / 2;
    const relX = -rendererSize.width * 0.5 + screenX - scroll.position.x;
    const relY = -rendererSize.height * 0.5 + screenY - scroll.position.y;
    return {
      // +half matches the ISO convention: tile snaps at boundaries (midpoints
      // between tile centers) rather than at the tile centers themselves.
      x: Math.floor((relX + half) / scaledTile),
      // Invert Y to match toScreen's -tileY convention, apply same +half correction.
      // `|| 0` converts -0 to 0.
      y: Math.floor((-relY + half) / scaledTile) || 0
    };
  }
};

// ---------------------------------------------------------------------------
// Bound helper factories — used by CanvasModeContext
// ---------------------------------------------------------------------------

/**
 * Returns a getTilePosition function bound to the given strategy.
 * Matches the existing isoMath.ts getTilePosition signature exactly.
 */
export const makeTilePositionFn =
  (strategy: CoordinateTransformStrategy) =>
  ({ tile, origin }: { tile: Coords; origin?: TileOrigin }): Coords => {
    const center = strategy.toScreen(tile.x, tile.y, UNPROJECTED_TILE_SIZE);

    // Origin offsets — computed from the strategy's projected tile dimensions.
    // For ISO: halfW ≈ 70.75, halfH ≈ 40.95
    // For 2D:  halfW = halfH = 50 (square tiles)
    const projW = UNPROJECTED_TILE_SIZE * (PROJECTED_TILE_SIZE.width / UNPROJECTED_TILE_SIZE);
    const projH = UNPROJECTED_TILE_SIZE * (PROJECTED_TILE_SIZE.height / UNPROJECTED_TILE_SIZE);

    const halfW =
      strategy.projectionName === 'ISOMETRIC'
        ? projW / 2
        : UNPROJECTED_TILE_SIZE / 2;
    const halfH =
      strategy.projectionName === 'ISOMETRIC'
        ? projH / 2
        : UNPROJECTED_TILE_SIZE / 2;

    return applyOriginOffset(center, origin, halfW, halfH);
  };

/**
 * Returns a screenToTile function bound to the given strategy.
 * Matches the existing isoMath.ts screenToIso calling convention.
 */
export const makeScreenToTileFn =
  (strategy: CoordinateTransformStrategy) =>
  ({
    mouse,
    zoom,
    scroll,
    rendererSize
  }: {
    mouse: Coords;
    zoom: number;
    scroll: Scroll;
    rendererSize: Size;
  }): Coords =>
    strategy.fromScreen(
      mouse.x,
      mouse.y,
      UNPROJECTED_TILE_SIZE,
      zoom,
      scroll,
      rendererSize
    );

/** The transform strategy for a canvas mode. */
export const getStrategy = (
  canvasMode: 'ISOMETRIC' | '2D'
): CoordinateTransformStrategy =>
  canvasMode === '2D' ? cartesian2DStrategy : isometricStrategy;

/**
 * The unprojected (pre-zoom, pre-scroll) canvas point under a screen-space
 * cursor — the inverse of the SceneLayer's `translate(scroll) scale(zoom)`.
 * `toScreen`/`fromCanvasPoint` operate in this space, so it is the bridge from
 * a raw mouse position to the off-grid residual (ADR 0023 resolvePlacement).
 */
export const screenToCanvasPoint = (
  screen: Coords,
  zoom: number,
  scroll: Scroll,
  rendererSize: Size
): Coords => ({
  x: (screen.x - rendererSize.width * 0.5 - scroll.position.x) / zoom,
  y: (screen.y - rendererSize.height * 0.5 - scroll.position.y) / zoom
});

/**
 * The cursor's canvas point for ADR 0023 pixel-accurate hit-testing, or
 * `undefined` when the viewport state needed to compute it isn't there. The real
 * store always populates zoom/scroll/rendererSize; the mode-action unit tests
 * construct partial `uiState` mocks, and hit-testing must not throw on those.
 * `getItemAtTile` treats an absent `point` as "use the raw integer tile", which
 * is exactly the pre-off-grid behaviour those tests assert.
 */
export const cursorCanvasPoint = (
  viewport: { zoom?: number; scroll?: Scroll; rendererSize?: Size },
  screen: Coords | undefined
): Coords | undefined => {
  if (!screen || !viewport.scroll?.position || !viewport.rendererSize) {
    return undefined;
  }
  return screenToCanvasPoint(
    screen,
    viewport.zoom || 1,
    viewport.scroll,
    viewport.rendererSize
  );
};

// ---------------------------------------------------------------------------
// Canvas-mode (iso↔2D) switch — preserve zoom + viewport center
// ---------------------------------------------------------------------------

/**
 * Compute the `scroll.position` that keeps the tile currently under the viewport
 * center centered after a projection swap, preserving the user's zoom.
 *
 * The SceneLayer renders a tile at screen `rendererCenter + scroll.position +
 * zoom · toScreen(tile)`, so the canvas point under the viewport center is
 * `-scroll.position / zoom` — independent of renderer size. We map that point
 * back to a (fractional) tile under the *old* projection, re-project it under
 * the *new* one, and choose the scroll that lands it back at the center.
 *
 * Replaces the old `fitToView()` force-fit on canvas-mode change (ADR-tracked
 * locked decision #6) which discarded the user's zoom and recentred the whole
 * diagram.
 */
export const getCanvasModeSwitchScroll = (
  fromStrategy: CoordinateTransformStrategy,
  toStrategy: CoordinateTransformStrategy,
  zoom: number,
  scroll: Scroll,
  tileSize: number = UNPROJECTED_TILE_SIZE
): Coords => {
  // Degenerate zoom — nothing meaningful to preserve; keep the current scroll.
  if (!zoom) return { ...scroll.position };

  const centerTile = fromStrategy.fromCanvasPoint(
    -scroll.position.x / zoom,
    -scroll.position.y / zoom,
    tileSize
  );
  const newCanvas = toStrategy.toScreen(centerTile.x, centerTile.y, tileSize);

  return { x: -zoom * newCanvas.x, y: -zoom * newCanvas.y };
};

/**
 * The same off-grid residual, expressed in the NEW projection's screen plane.
 *
 * R1/PROJ-07, ruled 2026-07-30. `offset` (ADR 0023) is a POST-projection
 * SceneLayer-px residual, so it does not survive a projection change: a real
 * drag committed (58, 0) px, which is inside the ISO tile diamond (58/70.75 =
 * 0.82) but outside the 2D tile square (58 > 50). Carrying it byte-identical
 * through an iso→2D switch drew an item that had been inside its own cell
 * mostly over the NEIGHBOURING cell — where tile-based collision will happily
 * let a second item sit, because the model tile never changed.
 *
 * `toScreen_new(fromCanvasPoint_old(o))` is the ruling's formula and the same
 * map the viewport centre already uses ({@link getCanvasModeSwitchScroll}): read
 * the residual as a fractional tile under the OLD projection, then re-project it
 * under the NEW one. Both are linear, and they are an exact inverse pair, so
 * ISO→2D→ISO restores the original value and repeated toggling cannot drift.
 */
export const reprojectOffset = (
  fromStrategy: CoordinateTransformStrategy,
  toStrategy: CoordinateTransformStrategy,
  offset: Coords,
  tileSize: number = UNPROJECTED_TILE_SIZE
): Coords => {
  const asTile = fromStrategy.fromCanvasPoint(offset.x, offset.y, tileSize);
  return toStrategy.toScreen(asTile.x, asTile.y, tileSize);
};
