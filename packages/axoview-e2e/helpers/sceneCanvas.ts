/**
 * Oracles for the ONE merged bulk canvas (R3/GPU-13, ADR 0038 §8).
 *
 * Before the merge, "what did the renderer actually do?" was answered per layer,
 * and cross-type paint order could be read straight off DOM mount order. Neither
 * works now: there is a single `<canvas>`, and order lives in the sort key. These
 * are the replacements.
 *
 * The substrate is NOT pixel-blind to CI: the context is created with
 * `preserveDrawingBuffer: true` (image export depends on it, ADR 0038 §4), so a
 * spec can `drawImage` the canvas into a 2D scratch and read pixels back. That,
 * plus the per-type counters the canvas publishes, gives two independent answers
 * without a single screenshot comparison.
 *
 * Not a spec file — helpers only.
 */
import type { Page } from '@playwright/test';

/** The merged bulk canvas. Four test ids collapsed into this one. */
export const SCENE_CANVAS = 'axoview-scene-canvas';
export const SCENE_CANVAS_SELECTOR = `[data-testid="${SCENE_CANVAS}"]`;

export interface SceneCounters {
  present: boolean;
  /** Total instances-worth of entities drawn, ALL types (no longer == N). */
  drawCount: number | null;
  /** The ADR 0020 anti-cheat channel: must equal N. */
  nodesDrawn: number | null;
  connectorsDrawn: number | null;
  rectanglesDrawn: number | null;
  /** Node NAME chips (the LOD-gated ones). */
  labelsDrawn: number | null;
  /** Floating Label chips (ADR 0031). */
  floatingLabelsDrawn: number | null;
  allIconsDrawn: string | null;
  /** Advances only when the O(N) build runs — the invalidation oracle. */
  buildCount: number | null;
  /** Atlas pages in use, and therefore binds per frame (§8 measurement 1). */
  atlasPages: number | null;
  drawCalls: number | null;
}

export const sceneCounters = (page: Page): Promise<SceneCounters> =>
  page.evaluate((sel: string) => {
    const c = document.querySelector(sel) as HTMLElement | null;
    const num = (v: string | undefined) => (v === undefined ? null : Number(v));
    if (!c) {
      return {
        present: false,
        drawCount: null,
        nodesDrawn: null,
        connectorsDrawn: null,
        rectanglesDrawn: null,
        labelsDrawn: null,
        floatingLabelsDrawn: null,
        allIconsDrawn: null,
        buildCount: null,
        atlasPages: null,
        drawCalls: null
      };
    }
    return {
      present: true,
      drawCount: num(c.dataset.drawCount),
      nodesDrawn: num(c.dataset.nodesDrawn),
      connectorsDrawn: num(c.dataset.connectorsDrawn),
      rectanglesDrawn: num(c.dataset.rectanglesDrawn),
      labelsDrawn: num(c.dataset.labelsDrawn),
      floatingLabelsDrawn: num(c.dataset.floatingLabelsDrawn),
      allIconsDrawn: c.dataset.allIconsDrawn ?? null,
      buildCount: num(c.dataset.buildCount),
      atlasPages: num(c.dataset.atlasPages),
      drawCalls: num(c.dataset.drawCalls)
    };
  }, SCENE_CANVAS_SELECTOR);

/**
 * Non-transparent pixel count in the merged canvas's preserved drawing buffer.
 * Returns -1 when the canvas is absent or has no backing store, and -2 when a 2D
 * context could not be obtained — both distinguishable from a legitimate 0, so a
 * spec asserts its precondition rather than reading a rig failure as "the
 * renderer painted nothing".
 */
export const paintedPixels = (
  page: Page,
  selector: string = SCENE_CANVAS_SELECTOR
): Promise<number> =>
  page.evaluate((sel: string) => {
    const gl = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!gl || !gl.width || !gl.height) return -1;
    const scratch = document.createElement('canvas');
    scratch.width = gl.width;
    scratch.height = gl.height;
    const ctx = scratch.getContext('2d');
    if (!ctx) return -2;
    ctx.drawImage(gl, 0, 0);
    const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n += 1;
    return n;
  }, selector);

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * The average colour of a square patch of the merged canvas, centred on a
 * VIEWPORT point.
 *
 * A patch rather than one texel: a single pixel lands on antialiased edges and
 * on the chip's text, so it is noisy in a way an average over ~11×11 is not.
 * The point is given in CSS/viewport coordinates (what `boundingBox` and the
 * canvas POM speak); the canvas backing store may be a different scale, so it is
 * converted here.
 *
 * This is how cross-type paint order is asserted now that mount order carries no
 * ordering meaning: sample where two entities overlap and see whose colour won.
 */
export const canvasPatchColor = (
  page: Page,
  point: { x: number; y: number },
  half = 5
): Promise<Rgba | null> =>
  page.evaluate(
    ([sel, px, py, h]) => {
      const gl = document.querySelector(sel as string) as HTMLCanvasElement | null;
      if (!gl || !gl.width || !gl.height) return null;
      const rect = gl.getBoundingClientRect();
      const sx = gl.width / rect.width;
      const sy = gl.height / rect.height;
      const cx = Math.round(((px as number) - rect.left) * sx);
      const cy = Math.round(((py as number) - rect.top) * sy);
      const half = h as number;
      const x0 = Math.max(0, cx - half);
      const y0 = Math.max(0, cy - half);
      const w = Math.min(gl.width - x0, half * 2 + 1);
      const hgt = Math.min(gl.height - y0, half * 2 + 1);
      if (w <= 0 || hgt <= 0) return null;
      const scratch = document.createElement('canvas');
      scratch.width = gl.width;
      scratch.height = gl.height;
      const ctx = scratch.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(gl, 0, 0);
      const data = ctx.getImageData(x0, y0, w, hgt).data;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const n = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        a += data[i + 3];
      }
      return { r: r / n, g: g / n, b: b / n, a: a / n };
    },
    [SCENE_CANVAS_SELECTOR, point.x, point.y, half] as const
  );

/** Manhattan-ish distance between two patch colours, alpha included. */
export const colorDistance = (a: Rgba, b: Rgba): number =>
  Math.abs(a.r - b.r) +
  Math.abs(a.g - b.g) +
  Math.abs(a.b - b.b) +
  Math.abs(a.a - b.a);
