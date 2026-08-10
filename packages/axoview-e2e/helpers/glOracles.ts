/**
 * Shared oracles for the rendering block (R2–R5).
 *
 * The R2 mapper note claimed the WebGL substrate is "pixel-blind to CI". It is
 * not: every bulk canvas is created with `preserveDrawingBuffer: true` (so image
 * export can read it), which means a probe can `drawImage` it into a 2D canvas
 * and count non-transparent pixels. Together with the `data-build-count` /
 * `data-draw-count` / `data-all-icons-drawn` attributes the layers already
 * publish, that gives three independent answers to "what did this layer
 * actually do?" without a single screenshot comparison.
 *
 * Shared GL read-back oracles for the render-block e2e specs. (Formerly the
 * exploratory lane rig; moved to helpers/ at the 2026-08-10 lane dissolution.)
 */
import type { Page } from '@playwright/test';

/**
 * The bulk GPU scene layer.
 *
 * There were FOUR, stacked by mount order — which is exactly what R3/GPU-13
 * filed. Wave 5 merged them into one WebGL2 context ordered by one sort (ADR
 * 0038 §8), so this is a one-element list and "which layer painted this?" is
 * answered by the per-type counters (`data-nodes-drawn`,
 * `data-connectors-drawn`, `data-rectangles-drawn`, `data-labels-drawn`,
 * `data-floating-labels-drawn`) rather than by which canvas has pixels.
 */
export const BULK_LAYERS = ['axoview-scene-canvas'] as const;

export type BulkLayer = (typeof BULK_LAYERS)[number];

export const layerSelector = (id: BulkLayer | string) =>
  `[data-testid="${id}"]`;

/**
 * Non-transparent pixel count in a bulk canvas's preserved drawing buffer.
 * Returns -1 when the canvas is absent or has no backing store, and -2 when a
 * 2D context could not be obtained — both distinguishable from a legitimate 0
 * so a probe can assert its precondition instead of reading a rig failure as
 * "the layer painted nothing".
 */
export const paintedPixels = (
  page: Page,
  id: BulkLayer | string
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
  }, layerSelector(id));

/** `paintedPixels` for every bulk layer, keyed by testid. */
export const paintedPixelsAll = async (
  page: Page
): Promise<Record<string, number>> => {
  const out: Record<string, number> = {};
  for (const id of BULK_LAYERS) out[id] = await paintedPixels(page, id);
  return out;
};

export interface LayerCounters {
  buildCount: number | null;
  drawCount: number | null;
  allIconsDrawn: string | null;
  present: boolean;
}

/**
 * The counters each bulk layer publishes on its canvas element.
 * `buildCount` advances only when the O(N) `buildInstances` pass runs, so it is
 * the invalidation oracle: "did this layer rebuild its geometry?".
 */
export const layerCounters = (
  page: Page,
  id: BulkLayer | string
): Promise<LayerCounters> =>
  page.evaluate((sel: string) => {
    const c = document.querySelector(sel) as HTMLElement | null;
    if (!c) return { buildCount: null, drawCount: null, allIconsDrawn: null, present: false };
    const num = (v: string | undefined) =>
      v === undefined ? null : Number(v);
    return {
      buildCount: num(c.dataset.buildCount),
      drawCount: num(c.dataset.drawCount),
      allIconsDrawn: c.dataset.allIconsDrawn ?? null,
      present: true
    };
  }, layerSelector(id));

export const countersAll = async (
  page: Page
): Promise<Record<string, LayerCounters>> => {
  const out: Record<string, LayerCounters> = {};
  for (const id of BULK_LAYERS) out[id] = await layerCounters(page, id);
  return out;
};

/** Force a GL context loss on one bulk layer; returns the handle to restore it. */
export const loseContext = (page: Page, id: BulkLayer | string) =>
  page.evaluate((sel: string) => {
    const c = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!c) return 'no-canvas';
    const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
    const ext = gl?.getExtension('WEBGL_lose_context') as {
      loseContext: () => void;
      restoreContext: () => void;
    } | null;
    if (!ext) return 'no-extension';
    (window as never as Record<string, unknown>)['__glLoseExt__' + sel] = ext;
    ext.loseContext();
    return 'lost';
  }, layerSelector(id));

export const restoreContext = (page: Page, id: BulkLayer | string) =>
  page.evaluate((sel: string) => {
    const ext = (window as never as Record<string, unknown>)[
      '__glLoseExt__' + sel
    ] as { restoreContext: () => void } | undefined;
    if (!ext) return 'no-handle';
    ext.restoreContext();
    return 'restored';
  }, layerSelector(id));

export const isContextLost = (
  page: Page,
  id: BulkLayer | string
): Promise<boolean | null> =>
  page.evaluate((sel: string) => {
    const c = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!c) return null;
    const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
    return gl ? gl.isContextLost() : null;
  }, layerSelector(id));

/** The active canvas projection, straight from the store. */
export const canvasMode = (page: Page): Promise<string> =>
  page.evaluate(() => (window as any).__axoview__.ui.getState().canvasMode);

export const setCanvasMode = (page: Page, mode: 'ISOMETRIC' | '2D') =>
  page.evaluate(
    (m) => (window as any).__axoview__.ui.getState().actions.setCanvasMode(m),
    mode
  );

export const setZoom = (page: Page, zoom: number) =>
  page.evaluate(
    (z) => (window as any).__axoview__.ui.getState().actions.setZoom(z),
    zoom
  );
