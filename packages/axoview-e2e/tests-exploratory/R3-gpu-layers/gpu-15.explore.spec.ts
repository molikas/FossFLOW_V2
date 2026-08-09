/**
 * R3 — GPU-15: rounded rectangle corners are sharp on the bulk and round on the
 * dragged DOM rect (known_issues: Open, cosmetic — deliberately not fixed in
 * wave 3; this probe is its fix detector).
 *
 * GPU-15 puts the two rectangle renderers side by side: the bulk's own header
 * says "only corner radius (rounded rects) is still approximated (sharp corners)
 * on the bulk", while the DOM `Rectangle` passes `cornerRadius={22}` into
 * `IsoTileArea`'s `rx`. 2D mode makes the footprint axis-aligned so the corner
 * test is a single pixel read.
 *
 * Post canvas-merge note (2026-08-09): the probe reads the merged
 * `axoview-scene-canvas` (the per-type canvases are gone — GPU-13). On this
 * one-rectangle diagram the painted bbox is still exactly the rectangle. The
 * GPU-14 legs that shared this file characterized the pre-merge per-layer
 * atlas counters; their bug is Fixed (R2 atlas entry) and the merge closed
 * their premise by construction, so they were retired — see git history of
 * `gpu-14-15.explore.spec.ts`.
 */
import {
  exploreTest as test,
  expect,
  expectModelHealthy
} from '../../fixtures/explore.fixture';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { getViewRectangleCount } from '../../helpers/store';
import { setCanvasMode } from '../_rig/glOracles';

const SCENE = 'axoview-scene-canvas';

test.describe('GPU-15 — rectangle corner radius across the two renderers', () => {
  test('the bulk paints a square corner where the DOM rect rounds it', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(120_000);
    const canvas = new CanvasPOM(page);
    // 2D makes the footprint axis-aligned, so "is the corner square?" is one
    // pixel read instead of a diamond-vertex argument.
    await setCanvasMode(page, '2D');
    await page.waitForTimeout(400);

    const fromT = { x: -2, y: -2 };
    const toT = { x: 2, y: 2 };
    const from = await canvas.tileToScreen(fromT);
    const to = await canvas.tileToScreen(toT);
    await canvas.switchToRectangleMode();
    await canvas.dragFromTo(from, to);
    await expect.poll(() => getViewRectangleCount(page), { timeout: 5_000 }).toBe(1);
    await page.keyboard.press('s'); // back to CURSOR
    await page.evaluate(() => {
      (window as any).__axoview__.ui.getState().actions.setItemControls(null);
    });
    await page.waitForTimeout(700);

    // The bulk footprint: painted bbox + whether the pixel just inside each
    // corner of that bbox is painted. A radius of 22 scene px would leave the
    // corners clear.
    const bulk = await page.evaluate((sel: string) => {
      const cv = document.querySelector(sel) as HTMLCanvasElement | null;
      if (!cv || !cv.width) return { error: 'no canvas' } as any;
      const s = document.createElement('canvas');
      s.width = cv.width;
      s.height = cv.height;
      const ctx = s.getContext('2d')!;
      ctx.drawImage(cv, 0, 0);
      const W = s.width;
      const H = s.height;
      const d = ctx.getImageData(0, 0, W, H).data;
      const on = (x: number, y: number) => d[(y * W + x) * 4 + 3] > 16;
      let x0 = W;
      let y0 = H;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!on(x, y)) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
      if (x1 < 0) return { error: 'nothing painted' } as any;
      const inset = 2;
      return {
        bbox: [x0, y0, x1, y1],
        width: x1 - x0 + 1,
        height: y1 - y0 + 1,
        corners: {
          tl: on(x0 + inset, y0 + inset),
          tr: on(x1 - inset, y0 + inset),
          bl: on(x0 + inset, y1 - inset),
          br: on(x1 - inset, y1 - inset)
        }
      };
    }, `[data-testid="${SCENE}"]`);
    expect(bulk.error, `bulk probe: ${bulk.error}`).toBeUndefined();

    // Now the DOM half: the Renderer keeps ONLY the dragged rect in the DOM, so
    // the comparison needs a live drag. Real mouse — this is a hit-tested
    // gesture.
    const box = (await canvas.interactionsLayer().boundingBox())!;
    const interior = await canvas.tileToScreen({ x: 0, y: 0 });
    const target = await canvas.tileToScreen({ x: 1, y: 1 });
    await page.mouse.move(box.x + interior.x, box.y + interior.y);
    await page.mouse.down();
    await page.mouse.move(box.x + target.x, box.y + target.y, { steps: 12 });

    const dom = await page.evaluate(() => {
      const el = document.querySelector('[data-drag-id]');
      const rect = el
        ? (el.querySelector('rect') as SVGRectElement | null)
        : null;
      const mode = (window as any).__axoview__.ui.getState().mode?.type;
      return {
        mode,
        dragEl: !!el,
        rx: rect ? rect.getAttribute('rx') : null,
        ry: rect ? rect.getAttribute('ry') : null
      };
    });
    await page.mouse.up();
    await page.waitForTimeout(300);

    test.info().annotations.push({
      type: 'GPU-15',
      description: `bulk ${JSON.stringify(bulk)} | dom ${JSON.stringify(dom)}`
    });

    // PRECONDITION: the drag really engaged and produced a DOM rect — without
    // it the rx read below would be meaningless.
    expect(dom.dragEl, `no [data-drag-id] element mid-drag (mode=${dom.mode})`).toBe(true);
    expect(dom.rx, 'the DOM rect must publish an rx').not.toBeNull();

    // The finding: the DOM rect is rounded (rx = cornerRadius 22 − halfStroke)…
    expect(Number(dom.rx)).toBeGreaterThan(0);
    // …while the bulk paints all four corners of its bounding box, i.e. square.
    expect(bulk.corners.tl).toBe(true);
    expect(bulk.corners.tr).toBe(true);
    expect(bulk.corners.bl).toBe(true);
    expect(bulk.corners.br).toBe(true);

    await expectModelHealthy(page, 'GPU-15 after the rectangle drag');
  });
});
