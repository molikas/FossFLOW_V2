/**
 * Promoted from the 2026-07 exploratory lane (R3/GPU-09, R3/GPU-04, GPU-05).
 */
import { ellipsize } from '../itemRaster';
import { isNodeLabelDrawn, LABEL_LOD_ZOOM } from 'src/config/labelSettings';

/** A context whose text width is a fixed px per character — exact arithmetic. */
const ctxWithCharWidth = (px: number) =>
  ({
    measureText: (t: string) => ({ width: t.length * px })
  }) as unknown as CanvasRenderingContext2D;

describe('ellipsize — the bulk chip stops cutting mid-glyph (GPU-09)', () => {
  const ctx = ctxWithCharWidth(10);

  it('returns a fitting string untouched', () => {
    expect(ellipsize(ctx, 'abcde', 100)).toBe('abcde');
    // Exactly filling is still fitting.
    expect(ellipsize(ctx, 'abcde', 50)).toBe('abcde');
  });

  it('truncates an overflowing name with an ellipsis that FITS', () => {
    // The measured shape: a long name against a much narrower chip interior.
    const long = 'a'.repeat(68);
    const out = ellipsize(ctx, long, 226);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length * 10).toBeLessThanOrEqual(226);
    // Before the fix the FULL name was drawn and hard-cut at the texture edge.
    expect(out.length).toBeLessThan(long.length);
  });

  it('keeps as many characters as fit', () => {
    // 100px / 10px per char = 10 glyphs, one of which is the ellipsis.
    expect(ellipsize(ctx, 'abcdefghijklmnop', 100)).toBe('abcdefghi…');
  });

  it('degrades to a bare ellipsis rather than an empty chip', () => {
    expect(ellipsize(ctx, 'abcdef', 10)).toBe('…');
    expect(ellipsize(ctx, 'abcdef', 5)).toBe('…');
  });

  it('handles the degenerate inputs', () => {
    expect(ellipsize(ctx, '', 100)).toBe('');
    expect(ellipsize(ctx, 'abc', 0)).toBe('abc');
    expect(ellipsize(ctx, 'abc', -5)).toBe('abc');
  });
});

describe('isNodeLabelDrawn — one LOD decision for draw AND hit (GPU-04/05)', () => {
  it('draws above the LOD floor', () => {
    expect(isNodeLabelDrawn(LABEL_LOD_ZOOM, false)).toBe(true);
    expect(isNodeLabelDrawn(1, false)).toBe(true);
  });

  it('does not draw below it with the setting off', () => {
    expect(isNodeLabelDrawn(LABEL_LOD_ZOOM - 0.01, false)).toBe(false);
    expect(isNodeLabelDrawn(0.15, false)).toBe(false);
  });

  it('DOES draw below it when "keep labels readable" is on', () => {
    // This is the case that produced the bug: the hit layer used a fixed 0.4,
    // so the accessibility setting whose purpose is keeping labels legible when
    // zoomed out was the one manufacturing visible-but-inert ones. Measured at
    // zoom 0.15 with the setting on: labelsDrawn=1, hit proxies 0.
    expect(isNodeLabelDrawn(0.15, true)).toBe(true);
    expect(isNodeLabelDrawn(0.1, true)).toBe(true);
  });

  it('the old fixed hit threshold (0.4) disagreed with it — the bug', () => {
    const OLD_HIT_MIN_ZOOM = 0.4;
    const painted = isNodeLabelDrawn(0.3, false);
    const hittableUnderTheOldRule = 0.3 >= OLD_HIT_MIN_ZOOM;
    expect(painted).toBe(true);
    expect(hittableUnderTheOldRule).toBe(false);
    // Nothing may be painted at a zoom where it cannot be hit — both sides read
    // this predicate now, so the two cannot disagree again.
  });
});
