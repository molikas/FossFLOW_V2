// ---------------------------------------------------------------------------
// itemRaster — Canvas2D rasterisation of node/label chips into offscreen canvases
// for upload as GL textures (glSpriteBatch's putCanvas → texImage2D atlas). The chip PIXELS are
// produced by the exact same roundRect/fillText/decoration code the Canvas2D bulk
// path used (ports of NodesCanvas' inline chip block and labelChip.drawLabelChip),
// so the GL scene is visually identical to the old one — only compositing moved
// to the GPU.
//
// Supersample: chips are rasterised at SUPERSAMPLE × device pixels and drawn
// through a mipmapped texture, so glyphs stay crisp up to ~SUPERSAMPLE× zoom-in
// and clean (mip-minified) when zoomed out. Textures are content-keyed and cached
// on the GPU, so pan/zoom never re-rasterises — only a content/style edit does.
// ---------------------------------------------------------------------------

import { Label } from 'src/types';
import {
  drawLabelChip,
  roundRectPath,
  ChipColors,
  LabelChipLayout
} from 'src/utils/labelChip';

// 2× keeps text crisp to 2× zoom-in; beyond that it softens (acceptable — the
// old Canvas2D path re-rendered per frame and stayed crisp at any zoom, the one
// fidelity trade of the texture-cache approach). Multiplied by dpr by the caller.
export const CHIP_SUPERSAMPLE = 2;

// One reusable scratch canvas — a rasterised chip is uploaded to its GL texture
// synchronously (inside glSpriteBatch's putCanvas), so a single scratch is safe to recycle.
let scratch: HTMLCanvasElement | null = null;
const getScratch = (
  wCss: number,
  hCss: number,
  ss: number
): HTMLCanvasElement => {
  if (!scratch) scratch = document.createElement('canvas');
  scratch.width = Math.max(1, Math.ceil(wCss * ss));
  scratch.height = Math.max(1, Math.ceil(hCss * ss));
  return scratch;
};

export interface NodeChipStyle {
  radius: number;
  padX: number;
  padY: number;
  bg: string;
  border: string;
  fontSize: number;
  nameFont: string;
  nameLineH: number;
  textColor: string;
  underline: boolean;
  strike: boolean;
}

/**
 * `text` trimmed with a trailing ellipsis so it fits `maxWidth` under the
 * context's CURRENT font. Returns the text unchanged when it already fits.
 *
 * R3/GPU-09. The DOM path WRAPS a long node name (three lines, two shown); this
 * one truncates. That is a deliberate, stated non-parity: wrapping the bulk chip
 * means `measureNodeLabel` returning a line list and `chipH` growing per line,
 * which changes chip geometry for every node and for the hit proxy that mirrors
 * it. Truncated-with-an-ellipsis and wrapped are both legible; cut mid-glyph at
 * the texture edge is not, and that is what this removes.
 *
 * Binary search rather than a character walk — this runs once per chip per
 * rebuild, and a long name is exactly the case where the walk is slowest.
 */
export const ellipsize = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string => {
  if (maxWidth <= 0 || !text) return text;
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ELLIPSIS = '…';
  // Not even the ellipsis fits — draw it anyway rather than an empty chip.
  if (ctx.measureText(ELLIPSIS).width > maxWidth) return ELLIPSIS;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + ELLIPSIS).width <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo) + ELLIPSIS;
};

// Port of NodesCanvas' inline chip block (lines ~535–573), drawn at LOCAL origin
// (0,0)→(chipW,chipH). Anchoring (tile-centre / labelHeight sign) is the caller's
// job — it maps this texture onto a quad. Returns the scratch canvas ready to
// upload; do not retain it across calls.
export const rasterizeNodeChip = (
  name: string,
  chipW: number,
  chipH: number,
  s: NodeChipStyle,
  ss: number
): HTMLCanvasElement => {
  const cnv = getScratch(chipW, chipH, ss);
  const ctx = cnv.getContext('2d')!;
  ctx.setTransform(ss, 0, 0, ss, 0, 0);
  ctx.clearRect(0, 0, chipW, chipH);

  // Inset the border 1px so it isn't clipped at the texture edge / trimmed by the
  // atlas's half-texel UV inset (would drop the border on the right/bottom).
  const m = 1;
  roundRectPath(ctx, m, m, chipW - 2 * m, chipH - 2 * m, s.radius);
  ctx.fillStyle = s.bg;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = s.border;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const textX = s.padX;
  const textY = s.padY;
  ctx.font = s.nameFont;
  ctx.fillStyle = s.textColor;
  // R3/GPU-09: this used to be a bare `fillText(name, …)`. `measureNodeLabel`
  // clamps the chip to LABEL_CHIP_MAX_W, but nothing clamped the TEXT, so a long
  // name ran past the chip's inner width and was hard-cut mid-glyph at the
  // texture edge — measured with a 68-character name needing 612 px against a
  // 226 px interior. Truncate with a measured ellipsis instead.
  ctx.fillText(
    ellipsize(ctx, name, chipW - s.padX * 2),
    textX,
    textY + (s.nameLineH - s.fontSize) / 2
  );

  if (s.strike || s.underline) {
    ctx.strokeStyle = s.textColor;
    ctx.lineWidth = Math.max(1, s.fontSize / 14);
    const innerW = chipW - s.padX * 2;
    if (s.strike) {
      const strikeY = textY + s.nameLineH / 2;
      ctx.beginPath();
      ctx.moveTo(textX, strikeY);
      ctx.lineTo(textX + innerW, strikeY);
      ctx.stroke();
    }
    if (s.underline) {
      const underY = textY + (s.nameLineH - s.fontSize) / 2 + s.fontSize * 0.95;
      ctx.beginPath();
      ctx.moveTo(textX, underY);
      ctx.lineTo(textX + innerW, underY);
      ctx.stroke();
    }
  }
  return cnv;
};

// Rasterise a floating Label chip via the shared drawLabelChip (same pixels as
// LabelsCanvas). drawLabelChip centres at (cx,cy) → here (chipW/2, chipH/2) so
// the chip fills the local (0,0)→(chipW,chipH) box.
export const rasterizeLabelChip = (
  label: Label,
  layout: LabelChipLayout,
  colors: ChipColors,
  ss: number
): HTMLCanvasElement => {
  const cnv = getScratch(layout.chipW, layout.chipH, ss);
  const ctx = cnv.getContext('2d')!;
  ctx.setTransform(ss, 0, 0, ss, 0, 0);
  ctx.clearRect(0, 0, layout.chipW, layout.chipH);
  drawLabelChip(ctx, layout.chipW / 2, layout.chipH / 2, label, layout, colors);
  return cnv;
};
