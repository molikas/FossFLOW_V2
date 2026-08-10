import { Coords, Rectangle as RectangleType } from 'src/types';
import { UNPROJECTED_TILE_SIZE } from 'src/config';
import { getColorVariant } from 'src/utils';
import { getRenderedAreaCorners } from 'src/utils/renderedGeometry';
import { TilePositionFn } from 'src/utils/renderedGeometry';
import { SpriteBatch, UVRect } from 'src/webgl/glSpriteBatch';
import { walkDashes, buildAaLineQuad, AA_FEATHER } from 'src/webgl/lineStyle';
import { glRGB } from 'src/webgl/scene/glColor';

// ---------------------------------------------------------------------------
// Grouping-rectangle FILLS + BORDERS for the merged bulk canvas (ADR 0038 §8).
//
// Lifted verbatim out of the pre-merge `RectanglesCanvas.buildInstances` so that
// the per-entity geometry — which is the part that was owner-verified pixel by
// pixel (the analytic-AA borders, the half-stroke fill inset, the dashed-loop
// walker) — is MOVED rather than rewritten. What changed is only WHEN it runs:
// the merged build interleaves it with the other three types in one sorted pass.
//
// Picking stays geometric (getItemAtTile over rectangles[].from/to), so the bulk
// still needs no DOM; the DOM <Rectangles> layer keeps only the dragged rect.
// ---------------------------------------------------------------------------

export interface RectangleEmitterInput {
  batch: SpriteBatch;
  /** Model colour id → css value. */
  colorsById: Map<string, string>;
  getTilePos: TilePositionFn;
  isIso: boolean;
}

export interface RectangleEmitter {
  emit(rect: RectangleType): void;
}

export const createRectangleEmitter = ({
  batch: b,
  colorsById,
  getTilePos,
  isIso
}: RectangleEmitterInput): RectangleEmitter => {
  const white = b.white;
  const dot = b.dot;

  // Authored widths are UNPROJECTED tile-px; getTilePos returns PROJECTED scene
  // points, so scale border widths by the projection's linear factor (== the
  // DOM's getProjectionCss scale) or they draw ~1/scale too thick.
  const g0 = getTilePos({ tile: { x: 0, y: 0 } });
  const g1 = getTilePos({ tile: { x: 1, y: 0 } });
  const widthScale =
    Math.hypot(g1.x - g0.x, g1.y - g0.y) / UNPROJECTED_TILE_SIZE || 1;

  // Border edge as an ANALYTIC-AA line quad (shapeMode 1) — crisp at every iso
  // angle/zoom via the shader's fwidth() coverage ramp (guidelines §12);
  // buildAaLineQuad fattens by AA_FEATHER for ramp room and reports the true
  // halfWidth.
  const segment = (
    p0: Coords,
    p1: Coords,
    w: number,
    r: number,
    g: number,
    bl: number,
    a: number
  ) => {
    const q = buildAaLineQuad(p0, p1, w, AA_FEATHER);
    b.addSprite(
      q.anchorX,
      q.anchorY,
      q.localOriginX,
      q.localOriginY,
      q.ux,
      q.uy,
      q.vx,
      q.vy,
      white,
      r,
      g,
      bl,
      a,
      0,
      1, // shapeMode: analytic line
      q.halfWidth
    );
  };

  return {
    emit(rect) {
      const fillValue = rect.customColor || colorsById.get(rect.color ?? '');
      // ADR 0039 addendum (STYL-03): absent IS the "no fill" representation now —
      // outline-only, exactly like the legacy `'transparent'` sentinel this still
      // reads. Must agree with the DOM <Rectangle> path.
      const isTransparent = !fillValue || fillValue === 'transparent';
      // ADR 0023 off-grid: the shared vertex math — the DOM <Rectangle> path and
      // this bulk MUST agree on where a rect is drawn (bug #3 lived in exactly
      // that gap), so the corners come from renderedGeometry.
      const [c0, c1, c2, c3] = getRenderedAreaCorners(
        rect.from,
        rect.to,
        rect.offset,
        getTilePos,
        isIso ? 'ISOMETRIC' : '2D'
      );

      // Border metrics (needed BEFORE the fill so the fill can inset away from
      // the stroke — see below).
      const strokeColor =
        rect.borderColor ||
        (isTransparent
          ? '#9e9e9e'
          : getColorVariant(fillValue as string, 'dark', { grade: 2 }));
      const strokeW = (rect.borderWidth ?? (isTransparent ? 2 : 1)) * widthScale;

      // Fill (skip for an explicit transparent choice — outline only). INSET by
      // half the stroke so the fill's hard edge never lands exactly on the border
      // centreline: a fill edge coincident with the analytic-AA stroke centreline
      // cancels the stroke's coverage on the fill's excluded (bottom/right, per
      // the top-left fill rule) boundary — the "rectangle's bottom border missing
      // in 2D" bug. Mirrors the DOM IsoTileArea, which insets its <rect> by
      // halfStroke for the same reason.
      if (!isTransparent) {
        const [fr, fg, fb] = glRGB(fillValue as string);
        const uLen = Math.hypot(c1.x - c0.x, c1.y - c0.y) || 1;
        const vLen = Math.hypot(c3.x - c0.x, c3.y - c0.y) || 1;
        // Clamp so a thick border on a small rect can't invert the fill quad.
        const ins = Math.min(strokeW / 2, uLen / 2, vLen / 2);
        const uhx = (c1.x - c0.x) / uLen;
        const uhy = (c1.y - c0.y) / uLen;
        const vhx = (c3.x - c0.x) / vLen;
        const vhy = (c3.y - c0.y) / vLen;
        b.addSprite(
          c0.x + ins * (uhx + vhx),
          c0.y + ins * (uhy + vhy),
          0,
          0,
          c1.x - c0.x - 2 * ins * uhx,
          c1.y - c0.y - 2 * ins * uhy,
          c3.x - c0.x - 2 * ins * vhx,
          c3.y - c0.y - 2 * ins * vhy,
          white as UVRect,
          fr,
          fg,
          fb,
          rect.fillOpacity ?? 1,
          0
        );
      }

      const [sr, sg, sb] = glRGB(strokeColor);
      const sa = rect.borderOpacity ?? 1;
      const jr = strokeW / 2;
      // Border corner/join as an ANALYTIC-AA disc (shapeMode 2) — crisp round
      // join instead of a mip-softened sampled dot.
      const capDot = (p: Coords) => {
        const R = jr + AA_FEATHER;
        b.addSprite(
          p.x,
          p.y,
          -R,
          -R,
          2 * R,
          0,
          0,
          2 * R,
          dot,
          sr,
          sg,
          sb,
          sa,
          0,
          2, // shapeMode: analytic disc
          jr
        );
      };
      const borderStyle = rect.borderStyle ?? 'SOLID';
      if (borderStyle === 'DASHED' || borderStyle === 'DOTTED') {
        const loop = [c0, c1, c2, c3, c0];
        const dashLen = borderStyle === 'DASHED' ? strokeW * 3 : strokeW;
        walkDashes(loop, dashLen, strokeW * 2, (p0, p1) => {
          segment(p0, p1, strokeW, sr, sg, sb, sa);
          capDot(p0);
          capDot(p1);
        });
      } else {
        segment(c0, c1, strokeW, sr, sg, sb, sa);
        segment(c1, c2, strokeW, sr, sg, sb, sa);
        segment(c2, c3, strokeW, sr, sg, sb, sa);
        segment(c3, c0, strokeW, sr, sg, sb, sa);
        for (const c of [c0, c1, c2, c3]) capDot(c);
      }
    }
  };
};
