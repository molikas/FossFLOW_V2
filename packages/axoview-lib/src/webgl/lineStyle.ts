// ---------------------------------------------------------------------------
// lineStyle — shared polyline dash/dot walkers for the WebGL bulk layers
// (SceneCanvas, SceneCanvas). Pure geometry: they walk a polyline in
// scene space and invoke a callback for each dash sub-span / dot centre, so the
// caller emits its own quads/caps. Keeping the walk in one place is what makes
// connector and rectangle line-styles measure the SAME way (consistent widths /
// dash metrics across element types).
//
// Both walkers iterate by an INTEGER dash/dot index rather than accumulating a
// float cursor. An earlier float-accumulating version could stall: near a dash
// boundary the "on" span length rounds to ~0, and `cursor += tinyValue` is
// absorbed by float precision once the cursor is a few hundred px in — the loop
// then never advances and emits sprites until the GPU staging buffer exhausts
// memory (RangeError: Array buffer allocation failed). Integer indices always
// advance, and MAX_SPANS_PER_SEGMENT is a belt-and-braces cap against a
// pathologically tiny period.
//
// Dash lengths are the caller's concern and are authored relative to the
// element's (already projection-scaled) stroke width, mirroring each element's
// DOM strokeDasharray so the unselected GPU bulk matches the selected DOM path.
// ---------------------------------------------------------------------------

import { Coords } from 'src/types';

const EPS = 1e-3;
// A single edge never needs more spans than this in a real diagram; hitting it
// means the period is pathologically small — stop rather than exhaust memory.
const MAX_SPANS_PER_SEGMENT = 20000;

// Analytic edge-AA feather, in SCENE units, added on EACH perpendicular side of a
// stroke/disc quad so the fragment's fwidth() coverage ramp (§12) has room and is
// not clipped by the quad boundary. Build-time constant (NOT zoom-scaled — that
// would rebuild geometry per frame, violating the no-per-frame-CPU invariant): the
// fragment ramp is ~1 SCREEN px at any zoom via fwidth, and a sub-pixel stroke at
// extreme zoom-out simply fades (cov peaks <1) rather than clipping visibly.
// Shared by SceneCanvas + SceneCanvas so their strokes feather identically.
export const AA_FEATHER = 1.5;

/** Place a dot at arc-length 0, spacing, 2·spacing, … along a polyline. */
export const walkDots = (
  poly: Coords[],
  spacing: number,
  cb: (p: Coords) => void
): void => {
  if (spacing < EPS) return;
  let s = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < EPS) continue;
    const ux = (b.x - a.x) / segLen;
    const uy = (b.y - a.y) / segLen;
    const segEnd = s + segLen;
    // First dot index whose global position (k·spacing) falls at/after s.
    const kStart = Math.ceil(s / spacing - 1e-6);
    for (let k = kStart, n = 0; k * spacing <= segEnd + 1e-6; k++, n++) {
      if (n >= MAX_SPANS_PER_SEGMENT) break;
      const d = k * spacing - s;
      cb({ x: a.x + ux * d, y: a.y + uy * d });
    }
    s = segEnd;
  }
};

/**
 * Emit the "on" sub-spans of a [dashLen, gapLen] pattern along a polyline. Phase
 * is continuous across vertices, so a dash wraps a corner as two sub-spans that
 * meet at the vertex — the same visual as an SVG polyline strokeDasharray.
 */
export const walkDashes = (
  poly: Coords[],
  dashLen: number,
  gapLen: number,
  cb: (p0: Coords, p1: Coords) => void
): void => {
  const period = dashLen + gapLen;
  if (period < EPS) return;
  let s = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < EPS) continue;
    const ux = (b.x - a.x) / segLen;
    const uy = (b.y - a.y) / segLen;
    const segEnd = s + segLen;
    // Dash k spans global [k·period, k·period + dashLen]; iterate the k's that
    // overlap this segment and clip each to it.
    const kStart = Math.floor(s / period);
    for (let k = kStart, n = 0; k * period < segEnd; k++, n++) {
      if (n >= MAX_SPANS_PER_SEGMENT) break;
      const onStart = Math.max(k * period, s);
      const onEnd = Math.min(k * period + dashLen, segEnd);
      if (onEnd <= onStart) continue;
      const l0 = onStart - s;
      const l1 = onEnd - s;
      cb(
        { x: a.x + ux * l0, y: a.y + uy * l0 },
        { x: a.x + ux * l1, y: a.y + uy * l1 }
      );
    }
    s = segEnd;
  }
};

// ---------------------------------------------------------------------------
// Analytic edge-AA line geometry (crisp iso lines) — SHIPPED, owner-verified.
//
// A connector/rectangle stroke body used to be a SOLID `white`-texel
// parallelogram whose long edges aliased in iso (the shear turns every segment
// diagonal), and MSAA only half-fixed it (diagonals but not axis-aligned/sampled
// cases). The fix (deck.gl / Mapbox) is analytic edge-AA: expand the stroke quad
// by a small feather, carry the perpendicular distance-from-centreline as a
// varying, and threshold the alpha against the true half-width in the fragment
// shader via fwidth() — a controlled ~1px feather at ANY zoom/shear, no texture.
//
// This helper is the CPU/geometry half: it fattens `segment()`'s parallelogram
// (anchor p0, perpendicular width basis `v`, centred via localOrigin = -v/2) by
// `feather` (AA_FEATHER above) on each perpendicular side so the fragment ramp
// isn't clipped by the quad boundary, and reports the true `halfWidth` the shader
// thresholds. It is wired into SceneCanvas + SceneCanvas `segment()`
// (shapeMode 1); round caps/joins use the sibling analytic disc (shapeMode 2).
// The companion vertex varying + fragment coverage live in glSpriteBatch's
// VERT_SRC/FRAG_SRC; the design + trade-offs vs SDF/MSAA are in
// docs/canvas-rendering-guidelines.md §12. All pixel-blind to CI — owner verifies.
// ---------------------------------------------------------------------------

/** An analytic-AA stroke quad, ready to feed glSpriteBatch.addSprite (+ SDF shader). */
export interface AaLineQuad {
  /** Quad anchor in tile space (= p0). */
  anchorX: number;
  anchorY: number;
  /** Local origin = -v/2, so the centreline (q.y = 0.5) lies on p0→p1. */
  localOriginX: number;
  localOriginY: number;
  /** Along-segment basis `u` (length = segment length). */
  ux: number;
  uy: number;
  /** Perpendicular basis `v` (length = width + 2·feather — the FAT quad). */
  vx: number;
  vy: number;
  /** True stroke half-width in scene units; the fragment thresholds |vDist| here. */
  halfWidth: number;
  /** Feather half-width in scene units (the quad's over-extent on each side). */
  feather: number;
}

/**
 * Expand a segment p0→p1 of stroke `width` into an analytic-AA-ready quad,
 * fattened by `feather` (scene units) on each perpendicular side. Degenerate
 * (zero-length) segments return a collapsed quad rather than NaN.
 */
export const buildAaLineQuad = (
  p0: Coords,
  p1: Coords,
  width: number,
  feather: number
): AaLineQuad => {
  const ax = p1.x - p0.x;
  const ay = p1.y - p0.y;
  const len = Math.hypot(ax, ay) || 1;
  const halfWidth = width / 2;
  const fatHalf = halfWidth + feather;
  const nx = -ay / len; // perpendicular unit
  const ny = ax / len;
  const vx = nx * fatHalf * 2; // |v| = width + 2·feather
  const vy = ny * fatHalf * 2;
  return {
    anchorX: p0.x,
    anchorY: p0.y,
    localOriginX: -vx / 2,
    localOriginY: -vy / 2,
    ux: ax,
    uy: ay,
    vx,
    vy,
    halfWidth,
    feather
  };
};
