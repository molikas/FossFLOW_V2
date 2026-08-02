// Rendered geometry — the single source of truth for "where is this item
// actually drawn?" (ADR 0023 off-grid positioning).
//
// ---------------------------------------------------------------------------
// Coordinate spaces (canonical definition — cite THIS file, not the ADR text)
// ---------------------------------------------------------------------------
//
//   screen px      pointer coords relative to the renderer's top-left.
//        │           ÷ zoom, − scroll, − renderer centre  (screenToCanvasPoint)
//        ▼
//   SceneLayer px  a.k.a. canvas px, "post-projection" px. The space every
//        │         SceneLayer child is laid out in: `getTilePosition` returns
//        │         it, `screenToCanvasPoint`/`cursorCanvasPoint` return it, and
//        │         `style.left/top` on a SceneLayer child is expressed in it.
//        │         Zoom and scroll are applied ONCE by the SceneLayer's own
//        │         transform, so nothing below it re-applies them.
//        │           strategy.fromCanvasPoint  (projection⁻¹)
//        ▼
//   tile           the authoritative integer grid coordinate on the model.
//
// An item's `offset` (ADR 0023) is a **SceneLayer px** residual — NOT unprojected
// px, despite ADR 0023 §1's original wording (corrected by its 2026-07-23
// addendum). The derivation is load-bearing: `DragItems` commits
// `preciseDelta = screenDelta / zoom`, which is a translate in SceneLayer space,
// applied AFTER the projection. That is why composing it is a plain vector add
// in both ISOMETRIC and 2D, and why it must never be rounded into a tile —
// it is sub-tile, and rounding it discards up to half a tile (the proven-wrong
// fix; see the ADR 0023 addendum).
//
// ---------------------------------------------------------------------------
// Why this module exists
// ---------------------------------------------------------------------------
//
// ADR 0023 put `offset` beside the authoritative integer `tile`, and every
// renderer / chrome / hit-test site hand-rolled `getTilePosition(tile) + offset`.
// Seven consumers forgot, which is the whole 2026-07 off-grid bug cluster
// (commit 8ee54861). Composition now happens here, once. Adding a hand-rolled
// composition anywhere in `src` fails `renderedGeometry.contract.test.ts`.
//
// Pure functions only — no React, no store access. Consumers pass in the
// projection accessor (`getTilePosition` from `useCanvasMode()`, or
// `makeTilePositionFn(getStrategy(canvasMode))` off the render path).

import {
  PROJECTED_TILE_SIZE,
  UNPROJECTED_TILE_SIZE,
  TILE_PROJECTION_MULTIPLIERS
} from 'src/config';
import type { CanvasMode, Coords, TileOrigin } from 'src/types';

/** The projection accessor every consumer already has (`useCanvasMode()`). */
export type TilePositionFn = (args: {
  tile: Coords;
  origin?: TileOrigin;
}) => Coords;

/** Anything positioned by an integer tile plus an optional off-grid residual. */
export interface RenderedPlacement {
  tile: Coords;
  offset?: Coords;
}

/**
 * A drawn footprint in SceneLayer px: a convex quad, plus the rendered centre.
 * ISOMETRIC gives a diamond / parallelogram, 2D an axis-aligned rect.
 */
export interface RenderedFootprint {
  corners: [Coords, Coords, Coords, Coords];
  center: Coords;
}

// Shared zero so the snapped path never allocates.
const NO_OFFSET: Coords = { x: 0, y: 0 };

// X-orientation iso matrix (a,b,c,d) for area quads; e,f translation is
// sub-pixel and ignored.
//
// R1/PROJ-06, ruled 2026-07-30: DERIVED from the projection constants, not
// hardcoded. These were 3-decimal literals (0.707 / 0.409), moved verbatim from
// `SceneCanvas` when this module was extracted, deliberately, so that the
// extraction changed no rendered pixel. But the exact ratio `getTilePosition`
// uses is ±(0.7075, 0.4095) — half of `TILE_PROJECTION_MULTIPLIERS` — so an
// area quad drifted hypot(0.05, 0.05) px per tile of extent against a node drawn
// on the same tile: 1.41 px at 20 tiles, 2.83 px at 40. It never flipped a
// one-tile hit test and it shrinks with fit-to-view zoom, which is why it
// survived; the owner's call was that a frozen-wrong constant is drift, not a
// contract, and that the one-time pixel movement is worth paying (CI is
// pixel-blind, so it costs nothing there).
//
// Deriving rather than re-typing 0.7075/0.4095 is the point: the two paths now
// have ONE source, so a future change to the projection ratio moves both.
const ISO_A = TILE_PROJECTION_MULTIPLIERS.width / 2;
const ISO_B = -TILE_PROJECTION_MULTIPLIERS.height / 2;
const ISO_C = TILE_PROJECTION_MULTIPLIERS.width / 2;
const ISO_D = TILE_PROJECTION_MULTIPLIERS.height / 2;

/**
 * The post-projection px translate an item adds on top of its tile position.
 * `{x:0,y:0}` (a shared constant) when the item is snapped.
 *
 * Use this when the consumer needs the residual as a *translate* rather than a
 * composed point — CSS vars, `translate3d`, chrome shifted off an already
 * computed box.
 */
export const getRenderedOffset = (item: { offset?: Coords }): Coords =>
  item.offset ?? NO_OFFSET;

/**
 * The compositor drag transform with NO off-grid residual — a module constant so
 * the snapped path keeps a referentially stable style object.
 */
export const RENDERED_DRAG_TRANSFORM =
  'translate3d(var(--ff-drag-dx, 0px), var(--ff-drag-dy, 0px), 0)';

/**
 * The off-grid residual folded into the SAME `translate3d` that hosts the live
 * drag delta, so the two add on the compositor. The DOM wrapper idiom shared by
 * `<Rectangle>` and `<TextBox>`: the element inside stays positioned from its
 * integer tile, and this transform carries the residual.
 */
export const getRenderedDragTransform = (offset?: Coords): string =>
  offset
    ? `translate3d(calc(var(--ff-drag-dx, 0px) + ${offset.x}px), calc(var(--ff-drag-dy, 0px) + ${offset.y}px), 0)`
    : RENDERED_DRAG_TRANSFORM;

/**
 * Where an item's tile anchor is actually drawn, in SceneLayer px.
 * The one composition of tile projection + off-grid residual.
 */
export const getRenderedTilePosition = (
  item: RenderedPlacement,
  getTilePosition: TilePositionFn,
  origin?: TileOrigin
): Coords => {
  const base = getTilePosition({ tile: item.tile, origin });
  const off = item.offset;
  if (!off) return base;
  return { x: base.x + off.x, y: base.y + off.y };
};

/**
 * The single-tile footprint an item is drawn on: the iso tile diamond or the 2D
 * tile square, centred on the item's RENDERED position. This is what
 * pixel-accurate item hit-testing compares the cursor against.
 */
export const getRenderedTileFootprint = (
  item: RenderedPlacement,
  getTilePosition: TilePositionFn,
  canvasMode: CanvasMode
): RenderedFootprint => {
  const center = getRenderedTilePosition(item, getTilePosition, 'CENTER');
  return tileFootprintAt(center, canvasMode);
};

/**
 * The tile footprint centred on an already-resolved rendered point. Split out so
 * hit-test loops can resolve the centre once and skip a second projection call.
 */
export const tileFootprintAt = (
  center: Coords,
  canvasMode: CanvasMode
): RenderedFootprint => {
  if (canvasMode === '2D') {
    const half = UNPROJECTED_TILE_SIZE / 2;
    return {
      center,
      corners: [
        { x: center.x - half, y: center.y - half },
        { x: center.x + half, y: center.y - half },
        { x: center.x + half, y: center.y + half },
        { x: center.x - half, y: center.y + half }
      ]
    };
  }
  // Iso diamond: TOP, RIGHT, BOTTOM, LEFT.
  const halfW = PROJECTED_TILE_SIZE.width / 2;
  const halfH = PROJECTED_TILE_SIZE.height / 2;
  return {
    center,
    corners: [
      { x: center.x, y: center.y - halfH },
      { x: center.x + halfW, y: center.y },
      { x: center.x, y: center.y + halfH },
      { x: center.x - halfW, y: center.y }
    ]
  };
};

/**
 * The four drawn corners of a tile-range area (rectangle, text box) in
 * SceneLayer px, offset included — origin first, then clockwise in draw order.
 *
 * This IS the WebGL bulk path's vertex math (ADR 0038): `SceneCanvas`
 * calls it per rectangle per frame, so it stays allocation-light (one point
 * object per corner, nothing else) and takes no options object.
 */
export const getRenderedAreaCorners = (
  from: Coords,
  to: Coords,
  offset: Coords | undefined,
  getTilePosition: TilePositionFn,
  canvasMode: CanvasMode
): [Coords, Coords, Coords, Coords] => {
  const lowX = Math.min(from.x, to.x);
  const highX = Math.max(from.x, to.x);
  const lowY = Math.min(from.y, to.y);
  const highY = Math.max(from.y, to.y);
  const W = (highX - lowX + 1) * UNPROJECTED_TILE_SIZE;
  const H = (highY - lowY + 1) * UNPROJECTED_TILE_SIZE;
  // The committed px residual is a post-projection scene translate (the same
  // value the DOM <Rectangle> composes into its translate3d). All four corners
  // derive from the origin `p`, so shifting `p` shifts the whole fill/border —
  // otherwise the WebGL bulk snaps an off-grid rect back to its grid cell while
  // its selection frame sits at the offset position.
  const ox = offset?.x ?? 0;
  const oy = offset?.y ?? 0;
  if (canvasMode !== '2D') {
    const base = getTilePosition({ tile: { x: lowX, y: highY }, origin: 'LEFT' });
    const p = { x: base.x + ox, y: base.y + oy };
    return [
      p,
      { x: p.x + ISO_A * W, y: p.y + ISO_B * W },
      { x: p.x + ISO_A * W + ISO_C * H, y: p.y + ISO_B * W + ISO_D * H },
      { x: p.x + ISO_C * H, y: p.y + ISO_D * H }
    ];
  }
  const c = getTilePosition({ tile: { x: lowX, y: highY }, origin: 'CENTER' });
  const p = {
    x: c.x - UNPROJECTED_TILE_SIZE / 2 + ox,
    y: c.y - UNPROJECTED_TILE_SIZE / 2 + oy
  };
  return [
    p,
    { x: p.x + W, y: p.y },
    { x: p.x + W, y: p.y + H },
    { x: p.x, y: p.y + H }
  ];
};

/**
 * {@link getRenderedAreaCorners} as a footprint. Used by hit-testing, so a
 * rectangle / text box is grabbed against the EXACT quad the bulk renderer
 * draws — same function, no second derivation to drift.
 */
export const getRenderedAreaFootprint = (
  from: Coords,
  to: Coords,
  offset: Coords | undefined,
  getTilePosition: TilePositionFn,
  canvasMode: CanvasMode
): RenderedFootprint => {
  const corners = getRenderedAreaCorners(
    from,
    to,
    offset,
    getTilePosition,
    canvasMode
  );
  return {
    corners,
    center: {
      x: (corners[0].x + corners[2].x) / 2,
      y: (corners[0].y + corners[2].y) / 2
    }
  };
};

/**
 * Is a SceneLayer-px point inside a drawn footprint? Convex, boundary-inclusive,
 * winding-agnostic — every footprint this module produces is a convex quad.
 *
 * Boundary-inclusive matters: it makes the tile-diamond test here identical to
 * the `|dx|/halfW + |dy|/halfH <= 1` form it replaced.
 */
export const footprintContainsPoint = (
  footprint: RenderedFootprint,
  point: Coords
): boolean => {
  const { corners } = footprint;
  let negative = false;
  let positive = false;
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const cross =
      (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (cross < 0) negative = true;
    else if (cross > 0) positive = true;
    if (negative && positive) return false;
  }
  return true;
};
