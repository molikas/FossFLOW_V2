/**
 * F5 probes — ADR 0044 per-node icon resize, where it meets hit-testing.
 *
 * ADR 0044 §6 states the resize is VISUAL only: the node keeps a single-tile
 * footprint for collision, hit-testing and anchoring. ICON-08 asks what that
 * costs the user on a 2.5× node — whether the parts of the drawn icon that sit
 * outside its tile are clickable, and whether the hover affordance agrees with
 * the click.
 *
 * Real mouse throughout (tier T3) — this is a hit-testing question, so
 * synthetic dispatch would lie.
 */
import {
  exploreTest as test,
  expect
} from '../../fixtures/explore.fixture';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getViewItemCount } from '../../helpers/store';
import { paintedPixels } from '../_rig/glOracles';

type Page = import('@playwright/test').Page;

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

test.describe('F5 / an enlarged icon vs the hit test', () => {
  test('ICON-08: the drawn area of a 2.5x node outside its tile is not clickable', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const centre = await canvas.tileToScreen({ x: 0, y: 0 });
    await placeIconViaMouse(page, centre);
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);
    const nodeId = (await activeView(page)).items[0].id as string;

    // The node is painted on the bulk GPU canvas (its DOM shell is zero-sized —
    // COLDSTART), so measure the DRAWN extent with the read-back pixel oracle:
    // the painted bounding box on the merged scene canvas, in CSS px. (The
    // per-type canvases were collapsed by the GPU-13 merge; on this one-node
    // diagram the scene canvas paints exactly what the nodes canvas used to.)
    const paintedBox = () =>
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

    // PRECONDITION: the layer really painted something at 1x.
    expect(await paintedPixels(page, 'axoview-scene-canvas')).toBeGreaterThan(0);
    const before = await paintedBox();
    await setIconScale(page, nodeId, 2.5);
    await page.waitForTimeout(600);
    const after = await paintedBox();

    // PRECONDITION: the icon really did grow — otherwise everything below is
    // vacuous. The painted box also contains the node's NAME CHIP (same
    // canvas), which does not scale, so the box grows by less than the 2.5×
    // factor; the WIDTH is the axis the chip constrains least.
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after!.width).toBeGreaterThan(before!.width * 1.2);

    // Clear any selection the placement left behind.
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setSelectedIds([])
    );

    // CONTROL: the node's own tile is still clickable.
    const layerBox = await canvas.interactionsLayer().boundingBox();
    expect(layerBox).not.toBeNull();
    await page.mouse.move(layerBox!.x + centre.x, layerBox!.y + centre.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(250);
    expect((await selectedIds(page)).map((s) => s.id)).toEqual([nodeId]);

    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setSelectedIds([])
    );

    // Now press a point that is inside the DRAWN icon but outside the node's
    // one-tile footprint. Probe on the X axis at the tile's own vertical band:
    // the name chip is centred and narrow, so a point near the painted box's
    // LEFT edge at the node's y is icon pixels, not chip pixels.
    const sideOfIcon = {
      x: after!.left + 6,
      y: layerBox!.y + centre.y
    };
    // PRECONDITION: that point really is outside the 1× footprint the hit test
    // still uses — it is left of where the un-scaled icon ended.
    expect(sideOfIcon.x).toBeLessThan(before!.left);

    await page.mouse.move(sideOfIcon.x, sideOfIcon.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(250);

    // CHARACTERIZATION, recorded either way: whether the visible-but-outside
    // part of an enlarged icon selects the node.
    expect((await selectedIds(page)).map((s) => s.id)).toEqual([]);
  });

  test('ICON-10 control: keyboard icon placement is gated to EDITABLE', async ({
    page,
    app
  }) => {
    void app;
    await page.evaluate(() =>
      (window as any).__axoview__.ui
        .getState()
        .actions.setEditorMode('EXPLORABLE_READONLY')
    );
    // PRECONDITION: the mode really flipped.
    expect(
      await page.evaluate(
        () => (window as any).__axoview__.ui.getState().editorMode
      )
    ).toBe('EXPLORABLE_READONLY');

    // CHARACTERIZATION: the Elements dock toggle IS still mounted in view
    // mode, so `useKeyboardIconPlacement`'s own `editorMode !== 'EDITABLE'`
    // early return is the ONLY gate on the keyboard placement path — not
    // defence in depth. Exercise it: open the dock, focus an icon, press Enter.
    const toggle = page.locator('[data-axoview-id="dock-elements-toggle"]');
    await expect(toggle).toHaveCount(1);
    await toggle.click();
    const firstIcon = page
      .locator('[data-axoview-id="canvas-icon-grid-item"]')
      .first();
    if (await firstIcon.isVisible().catch(() => false)) {
      await firstIcon.focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
    }
    // The gate holds: nothing was placed into a read-only diagram.
    expect(await getViewItemCount(page)).toBe(0);
  });
});
