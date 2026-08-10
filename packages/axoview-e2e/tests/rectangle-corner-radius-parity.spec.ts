/**
 * Rounded rectangle corners are rounded on the dragged DOM rect but square on
 * the bulk GPU paint — the two renderers disagree, so a rectangle's corners
 * change shape on grab/release.
 *
 * ACCEPTED OPEN by owner ruling 2026-08-10: cosmetic, deliberately unfixed
 * (rounding the bulk corners is a shader change with no functional payoff yet).
 * It ships as a committed expected-fail — the detector for when the bulk paint
 * learns the DOM rect's `cornerRadius`.
 *
 * known_issues: "A rectangle's rounded corners are square on the canvas but
 * rounded while dragging" (exploratory campaign GPU-15). Was
 * tests-exploratory/R3-gpu-layers/gpu-15.explore.spec. 2D makes the footprint
 * axis-aligned, so "is the corner square?" is one pixel read.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM } from '../pom/CanvasPOM';
import { getViewRectangleCount } from '../helpers/store';
import { setCanvasMode } from '../helpers/glOracles';

const SCENE = 'axoview-scene-canvas';

test.fail(
  'the bulk paint should round a rectangle corner the way the DOM rect does',
  async ({ page, app }) => {
    void app;
    test.setTimeout(120_000);
    const canvas = new CanvasPOM(page);
    await setCanvasMode(page, '2D');
    await page.waitForTimeout(400);

    const from = await canvas.tileToScreen({ x: -2, y: -2 });
    const to = await canvas.tileToScreen({ x: 2, y: 2 });
    await canvas.switchToRectangleMode();
    await canvas.dragFromTo(from, to);
    await expect
      .poll(() => getViewRectangleCount(page), { timeout: 5_000 })
      .toBe(1);
    await page.keyboard.press('s');
    await page.evaluate(() => {
      (window as any).__axoview__.ui.getState().actions.setItemControls(null);
    });
    await page.waitForTimeout(700);

    // Painted bbox + whether the pixel just inside each corner is painted. A
    // real corner radius leaves those inset pixels CLEAR.
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
        corners: {
          tl: on(x0 + inset, y0 + inset),
          tr: on(x1 - inset, y0 + inset),
          bl: on(x0 + inset, y1 - inset),
          br: on(x1 - inset, y1 - inset)
        }
      };
    }, `[data-testid="${SCENE}"]`);
    expect(bulk.error, `bulk probe: ${bulk.error}`).toBeUndefined();

    // The fix detector: a rounded bulk corner leaves the inset pixel clear.
    // Today the bulk paints a square corner, so this fails.
    expect(bulk.corners.tl).toBe(false);
  }
);
