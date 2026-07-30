/**
 * R3 — GPU-14 (an atlas overflow paints an incomplete frame and still reports a
 * completed build) and GPU-15 (rounded rectangle corners are sharp on the bulk
 * and round on the dragged DOM rect).
 *
 * GPU-14 carries R2's finding forward: the chip atlas has no eviction and no
 * overflow signal (GL-02 / GL-05 / GL-12). `glSpriteBatch` documents the
 * consequence — "an overflowing chip simply doesn't draw for one build, then the
 * atlas compacts" — and notes only "the culling-defeated fit-to-view harness
 * reaches this path". Floating Labels are the cheapest way to reach it from the
 * product: they are viewport-culled by TILE, so packing many of them into the
 * visible tile window defeats culling, and each unique text is its own atlas
 * slot. The probe RAMPS the label count and reports where the layer starts
 * dropping chips, so a "no overflow" result is a measurement rather than a
 * guess.
 *
 * GPU-15 puts the two rectangle renderers side by side: the bulk's own header
 * says "only corner radius (rounded rects) is still approximated (sharp corners)
 * on the bulk", while the DOM `Rectangle` passes `cornerRadius={22}` into
 * `IsoTileArea`'s `rx`. 2D mode makes the footprint axis-aligned so the corner
 * test is a single pixel read.
 */
import {
  exploreTest as test,
  expect,
  expectModelHealthy
} from '../../fixtures/explore.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { getViewRectangleCount } from '../../helpers/store';
import { layerCounters, paintedPixels, setCanvasMode } from '../_rig/glOracles';

const LABELS = 'axoview-labels-canvas';
const RECTS = 'axoview-rectangles-canvas';

/**
 * Replace the active view's labels with `n` chips of long unique text, all
 * inside a small tile window so the Renderer's coarse viewport cull keeps them.
 * Returns what the store ended up holding.
 */
const injectLabels = (page: Page, n: number) =>
  page.evaluate((count: number) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const ui = bridge.ui.getState();
    const labels: Array<{
      id: string;
      text: string;
      tile: { x: number; y: number };
    }> = [];
    const span = 8; // tiles per row — keeps every chip inside the viewport
    for (let i = 0; i < count; i += 1) {
      labels.push({
        id: `explore-gpu14-${i}`,
        // Unique, long text: the atlas texture key includes the text, so no two
        // chips share a slot, and a wide chip consumes more of the atlas.
        text: `Overflow probe chip number ${i} with deliberately long text`,
        tile: {
          x: (i % span) - Math.floor(span / 2),
          y: (Math.floor(i / span) % span) - Math.floor(span / 2)
        }
      });
    }
    const views = m.views.map((v: any) =>
      v.id === ui.view ? { ...v, labels } : v
    );
    m.actions.set({ views }, true);
    const after = bridge.model
      .getState()
      .views.find((v: any) => v.id === ui.view);
    return { asked: count, stored: (after?.labels ?? []).length };
  }, n);

// ---------------------------------------------------------------------------
// GPU-14 — an overflowed atlas build reports success and paints an incomplete frame
// ---------------------------------------------------------------------------

test.describe('GPU-14 — what a caller learns when the atlas overflows', () => {
  test('the layer drops chips silently while data-build-count advances', async ({
    page,
    app
  }) => {
    test.setTimeout(300_000);

    const steps = [120, 300, 600, 1000];
    const observations: string[] = [];
    let overflowAt: { count: number; drawn: number; builds: number } | null = null;

    for (const n of steps) {
      const injected = await injectLabels(page, n);
      // PRECONDITION: the store really holds them (the schema caps labels at
      // 50 000, well above anything here).
      expect(injected.stored, `store did not accept ${n} labels`).toBe(n);
      // Rasterising N chips takes real time; poll until the build settles.
      await expect
        .poll(async () => (await layerCounters(page, LABELS)).buildCount, {
          timeout: 60_000
        })
        .toBeGreaterThan(0);
      await page.waitForTimeout(1_500 + n * 4);

      const c = await layerCounters(page, LABELS);
      const painted = await paintedPixels(page, LABELS);
      observations.push(
        `n=${n} drawCount=${c.drawCount} buildCount=${c.buildCount} painted=${painted}`
      );
      // PRECONDITION: the layer is painting at all at this step.
      expect(painted, `labels layer painted nothing at n=${n}`).toBeGreaterThan(0);

      if ((c.drawCount ?? 0) < n) {
        overflowAt = {
          count: n,
          drawn: c.drawCount ?? -1,
          builds: c.buildCount ?? -1
        };
        break;
      }
    }

    test.info().annotations.push({
      type: 'GPU-14',
      description: observations.join(' | ')
    });

    // A ramp that never overflowed is a real answer too — record it and stop
    // rather than passing on a vacuous truth.
    test.skip(
      overflowAt === null,
      `no atlas overflow reached at up to ${steps[steps.length - 1]} on-screen labels: ${observations.join(' | ')}`
    );

    // The finding: chips were skipped, and the ONLY trace is that data-draw-count
    // is lower than the label count. `data-build-count` advanced exactly as it
    // does for a complete build, so "the layer finished building" and "the layer
    // painted everything" are indistinguishable from the outside — including to
    // the export readiness gate, which reads only the NODES layer's
    // data-all-icons-drawn and has no equivalent signal for a packing failure.
    expect(overflowAt!.drawn).toBeLessThan(overflowAt!.count);
    expect(overflowAt!.builds).toBeGreaterThan(0);
    const nodes = await layerCounters(page, 'axoview-nodes-canvas');
    test.info().annotations.push({
      type: 'GPU-14-gate',
      description: `with ${overflowAt!.drawn}/${overflowAt!.count} label chips drawn, the nodes layer still reports allIconsDrawn=${nodes.allIconsDrawn}`
    });
  });
});

test.describe('GPU-14 — cold-start threshold (isolating the leaked generation)', () => {
  test('300 labels injected in ONE step, on a fresh atlas', async ({
    page,
    app
  }) => {
    test.setTimeout(180_000);
    // The ramp above grows the same view, which leaves the previous
    // generation's chips in the atlas (no eviction — R2/GL-02). This test does
    // the 300 in a single write on a fresh page, so its result separates "300
    // chips do not fit" from "300 chips plus 120 leaked ones do not fit".
    const injected = await injectLabels(page, 300);
    expect(injected.stored).toBe(300);
    await expect
      .poll(async () => (await layerCounters(page, LABELS)).buildCount, {
        timeout: 60_000
      })
      .toBeGreaterThan(0);
    await page.waitForTimeout(4_000);

    const c = await layerCounters(page, LABELS);
    const painted = await paintedPixels(page, LABELS);
    test.info().annotations.push({
      type: 'GPU-14-cold',
      description: `one-shot n=300: drawCount=${c.drawCount} buildCount=${c.buildCount} painted=${painted}`
    });
    expect(painted, 'the labels layer must be painting').toBeGreaterThan(0);
    // No assertion on the count either way — this test exists to REPORT the
    // cold threshold, and both answers are informative. The finding it feeds is
    // recorded from the annotation.
    expect(c.drawCount).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GPU-15 — rounded on the DOM rect, sharp on the bulk
// ---------------------------------------------------------------------------

test.describe('GPU-15 — rectangle corner radius across the two renderers', () => {
  test('the bulk paints a square corner where the DOM rect rounds it', async ({
    page,
    app
  }) => {
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
    }, `[data-testid="${RECTS}"]`);
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
