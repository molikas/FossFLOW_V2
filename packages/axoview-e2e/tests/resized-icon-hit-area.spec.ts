/**
 * A node whose icon is scaled up (ADR 0044) keeps a SINGLE-TILE hit area, so
 * the part of the drawn icon overflowing that tile is visible but inert.
 *
 * ACCEPTED OPEN by owner ruling 2026-08-10: ADR 0044 §6 makes the resize
 * visual-only on purpose (collision/anchoring stay tile-sized), so this is a
 * documented trade-off, not an oversight. It ships as a committed
 * expected-fail: the detector for the day the hit area is decided to follow
 * the drawn extent.
 *
 * known_issues: "A resized icon is only clickable on its original tile"
 * (exploratory campaign ICON-08). Was
 * tests-exploratory/F5-icons/iconscale.explore.spec. Real mouse (tier T3):
 * a hit-testing question, so synthetic dispatch would lie.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM } from '../pom/CanvasPOM';
import { placeIconViaMouse } from '../helpers/place';
import { getViewItemCount } from '../helpers/store';
import { paintedPixels } from '../helpers/glOracles';

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const views = bridge.model.getState().views;
    return (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
  });

const selectedIds = (page: Page) =>
  page.evaluate(
    () =>
      ((window as any).__axoview__.ui.getState().selectedIds ?? []) as Array<{
        type: string;
        id: string;
      }>
  );

const setIconScale = (page: Page, id: string, scale: number) =>
  page.evaluate(
    (args: { id: string; scale: number }) => {
      const bridge = (window as any).__axoview__;
      const m = bridge.model.getState();
      m.actions.set({
        views: m.views.map((v: any) => ({
          ...v,
          items: (v.items ?? []).map((i: any) =>
            i.id === args.id ? { ...i, iconScale: args.scale } : i
          )
        }))
      });
    },
    { id, scale }
  );

/** Painted bounding box of the merged scene canvas, in CSS px. */
const paintedBox = (page: Page) =>
  page.evaluate(() => {
    const gl = document.querySelector(
      '[data-testid="axoview-scene-canvas"]'
    ) as HTMLCanvasElement | null;
    if (!gl || !gl.width || !gl.height) return null;
    const scratch = document.createElement('canvas');
    scratch.width = gl.width;
    scratch.height = gl.height;
    const ctx = scratch.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(gl, 0, 0);
    const d = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < scratch.height; y += 1) {
      for (let x = 0; x < scratch.width; x += 1) {
        if (d[(y * scratch.width + x) * 4 + 3] !== 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (minX === Infinity) return null;
    const rect = gl.getBoundingClientRect();
    const sx = rect.width / gl.width;
    const sy = rect.height / gl.height;
    return {
      left: rect.left + minX * sx,
      top: rect.top + minY * sy,
      width: (maxX - minX + 1) * sx,
      height: (maxY - minY + 1) * sy
    };
  });

test.fail(
  'the overflow of a 2.5x icon should be clickable',
  async ({ page, app }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const centre = await canvas.tileToScreen({ x: 0, y: 0 });
    await placeIconViaMouse(page, centre);
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);
    const nodeId = (await activeView(page)).items[0].id as string;

    expect(await paintedPixels(page, 'axoview-scene-canvas')).toBeGreaterThan(0);
    const before = await paintedBox(page);
    await setIconScale(page, nodeId, 2.5);
    await page.waitForTimeout(600);
    const after = await paintedBox(page);

    // PRECONDITION: the icon really grew (the chip does not scale, so width
    // grows by less than 2.5x; width is the axis the chip constrains least).
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after!.width).toBeGreaterThan(before!.width * 1.2);

    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setSelectedIds([])
    );

    const layerBox = await canvas.interactionsLayer().boundingBox();
    expect(layerBox).not.toBeNull();

    // A point inside the DRAWN icon but outside the node's one-tile footprint:
    // near the painted box's LEFT edge at the node's own vertical band (the
    // chip is centred and narrow, so those are icon pixels).
    const sideOfIcon = { x: after!.left + 6, y: layerBox!.y + centre.y };
    // PRECONDITION: that point is left of where the un-scaled icon ended.
    expect(sideOfIcon.x).toBeLessThan(before!.left);

    await page.mouse.move(sideOfIcon.x, sideOfIcon.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(250);

    // The fix detector: clicking the visible overflow should select the node.
    expect((await selectedIds(page)).map((s) => s.id)).toEqual([nodeId]);
  }
);
