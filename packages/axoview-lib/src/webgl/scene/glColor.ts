import chroma from 'chroma-js';

/**
 * Parse a CSS colour to a WebGL [r,g,b] triple (0..1). Falls back to mid-grey on
 * a parse miss.
 *
 * One copy, shared by every merged-bulk emitter. The four pre-merge canvases each
 * carried their own identical `glRGB` — the duplicate-implementation class wave 4
 * spent a gate on (F5/ICON-01/02), so the merge collapses it rather than moving
 * it four times.
 */
export const glRGB = (css: string): [number, number, number] => {
  try {
    const [r, g, b] = chroma(css).gl();
    return [r, g, b];
  } catch {
    return [0.5, 0.5, 0.5];
  }
};
