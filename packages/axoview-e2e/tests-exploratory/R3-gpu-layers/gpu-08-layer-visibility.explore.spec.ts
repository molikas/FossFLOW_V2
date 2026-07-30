/**
 * R3 — GPU-08: does hiding a layer repaint every bulk canvas that shows its
 * entities?
 *
 * The first pass at this (in `gpu-04-06-07-08-13.explore.spec.ts`) skipped: a
 * blank-diagram boot configures NO layers, so `view.layers` is empty and the
 * hypothesis had no subject. The GPU-14 probe supplied the missing move — writing
 * the view through `model.actions.set` — so the layer set can be seeded directly
 * instead of driving the LayersPanel.
 *
 * Note the "draw all" escape hatch every bulk layer implements: it keys off
 * whether ANY layer exists (`layers.length === 0`), NOT on `visibleIds.size`,
 * because an empty visible set also means "everything is on a hidden layer". So a
 * seeded layer set genuinely changes the code path being exercised — which is why
 * the empty-layers boot could not answer this.
 */
import {
  exploreTest as test,
  expect,
  expectModelHealthy
} from '../../fixtures/explore.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getViewItemCount, getViewRectangleCount } from '../../helpers/store';
import { BULK_LAYERS, countersAll, paintedPixels } from '../_rig/glOracles';

const canvasCentre = async (canvas: CanvasPOM) => {
  const box = (await canvas.interactionsLayer().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/**
 * Put one layer on the active view and assign every entity on it (items,
 * rectangles, labels), or flip that layer's `visible` flag. Returns what the
 * store holds so the caller can assert the precondition.
 */
const seedLayer = (page: Page, visible: boolean) =>
  page.evaluate((vis: boolean) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const ui = bridge.ui.getState();
    const LAYER_ID = 'explore-gpu08-layer';
    const layer = {
      id: LAYER_ID,
      name: 'Probe layer',
      visible: vis,
      locked: false,
      order: 0
    };
    const assign = (list: any[] | undefined) =>
      (list ?? []).map((e: any) => ({ ...e, layerId: LAYER_ID }));
    const views = m.views.map((v: any) =>
      v.id === ui.view
        ? {
            ...v,
            layers: [layer],
            items: assign(v.items),
            rectangles: assign(v.rectangles),
            labels: assign(v.labels),
            connectors: assign(v.connectors),
            textBoxes: assign(v.textBoxes)
          }
        : v
    );
    m.actions.set({ views }, true);
    const after = bridge.model
      .getState()
      .views.find((v: any) => v.id === ui.view);
    return {
      layers: (after?.layers ?? []).length,
      visible: after?.layers?.[0]?.visible,
      assigned: {
        items: (after?.items ?? []).filter((e: any) => e.layerId === LAYER_ID)
          .length,
        rectangles: (after?.rectangles ?? []).filter(
          (e: any) => e.layerId === LAYER_ID
        ).length
      }
    };
  }, visible);

test.describe('GPU-08 — hiding a layer must clear it from every bulk canvas', () => {
  test('a hidden layer stops painting on the node AND rectangle layers', async ({
    page,
    app
  }) => {
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    const c = await canvasCentre(canvas);

    // Two entity types on two different bulk canvases, so this cannot pass by
    // exercising one layer and calling it four.
    await placeIconViaMouse(page, c);
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    const from = await canvas.tileToScreen({ x: -3, y: 1 });
    const to = await canvas.tileToScreen({ x: -1, y: 3 });
    await canvas.switchToRectangleMode();
    await canvas.dragFromTo(from, to);
    await expect.poll(() => getViewRectangleCount(page), { timeout: 5_000 }).toBe(1);
    await page.keyboard.press('s');
    await page.evaluate(() => {
      (window as any).__axoview__.ui.getState().actions.setItemControls(null);
    });
    await page.waitForTimeout(700);

    // Seed the layer VISIBLE first: this is the state that proves the assignment
    // itself didn't hide anything (the "draw all" escape hatch is now off, since
    // `layers.length > 0`).
    const seeded = await seedLayer(page, true);
    expect(seeded.layers, 'the view must carry exactly one layer').toBe(1);
    expect(seeded.visible).toBe(true);
    expect(seeded.assigned.items).toBe(1);
    expect(seeded.assigned.rectangles).toBe(1);
    await page.waitForTimeout(900);

    const visibleCounters = await countersAll(page);
    const paintedVisible: Record<string, number> = {};
    for (const id of BULK_LAYERS) paintedVisible[id] = await paintedPixels(page, id);

    // PRECONDITION: both target layers are painting while the layer is visible.
    expect(
      paintedVisible['axoview-nodes-canvas'],
      'the node must paint with its layer visible'
    ).toBeGreaterThan(0);
    expect(
      paintedVisible['axoview-rectangles-canvas'],
      'the rectangle must paint with its layer visible'
    ).toBeGreaterThan(0);

    // Hide it.
    const hidden = await seedLayer(page, false);
    expect(hidden.visible).toBe(false);
    await page.waitForTimeout(1_200);

    const hiddenCounters = await countersAll(page);
    const paintedHidden: Record<string, number> = {};
    for (const id of BULK_LAYERS) paintedHidden[id] = await paintedPixels(page, id);

    test.info().annotations.push({
      type: 'GPU-08',
      description: BULK_LAYERS.map(
        (id) =>
          `${id}: painted ${paintedVisible[id]}->${paintedHidden[id]} build ${visibleCounters[id].buildCount}->${hiddenCounters[id].buildCount}`
      ).join(' | ')
    });

    // The invariant: an entity on a hidden layer must not be on the GPU frame.
    expect(
      paintedHidden['axoview-nodes-canvas'],
      `the node still paints after its layer was hidden (${paintedVisible['axoview-nodes-canvas']}->${paintedHidden['axoview-nodes-canvas']})`
    ).toBe(0);
    expect(
      paintedHidden['axoview-rectangles-canvas'],
      `the rectangle still paints after its layer was hidden (${paintedVisible['axoview-rectangles-canvas']}->${paintedHidden['axoview-rectangles-canvas']})`
    ).toBe(0);
    // …and both layers must have rebuilt to get there, not just re-rendered.
    for (const id of ['axoview-nodes-canvas', 'axoview-rectangles-canvas']) {
      expect(
        hiddenCounters[id].buildCount,
        `${id} did not rebuild on the visibility change`
      ).toBeGreaterThan(visibleCounters[id].buildCount!);
    }

    await expectModelHealthy(page, 'GPU-08 after hiding the layer');
  });
});
