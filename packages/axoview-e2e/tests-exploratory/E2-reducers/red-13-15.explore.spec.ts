/**
 * E2 probes — the layer/selection seam, which only exists end-to-end.
 *
 *  RED-13  deleting a layer resurrects the content it was hiding
 *  RED-15  selection is never re-validated when a layer is hidden or locked,
 *          so Delete and group edits still reach "untouchable" entities
 *          (ADR 0006 §3 / canvas-interaction I-1)
 *
 * See docs/exploratory/areas/E2-reducers-cascades.md.
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM, CanvasPoint } from '../../pom/CanvasPOM';
import { LayersPanelPOM } from '../../pom/LayersPanelPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getModelItemCount, getViewItemCount } from '../../helpers/store';

const A: CanvasPoint = { x: 360, y: 260 };
const B: CanvasPoint = { x: 520, y: 340 };

const activeView = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    return bridge.model.getState().views.find((v: any) => v.id === viewId);
  });

const selectedIds = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().selectedIds ?? []
  );

/** Mirrors useLayerContext: an entity is visible unless its layer says otherwise. */
const visibilityOf = async (
  page: import('@playwright/test').Page,
  itemId: string
) =>
  page.evaluate((id) => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    const item = (view?.items ?? []).find((i: any) => i.id === id);
    const layer = (view?.layers ?? []).find((l: any) => l.id === item?.layerId);
    return {
      layerId: item?.layerId ?? null,
      visible: !layer || layer.visible,
      locked: Boolean(layer?.locked)
    };
  }, itemId);

async function placeTwoOnAHiddenLayer(page: import('@playwright/test').Page) {
  await placeIconViaMouse(page, A);
  await placeIconViaMouse(page, B);
  await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(2);

  const view = await activeView(page);
  const ids: string[] = view.items.map((i: never & { id: string }) => i.id);

  const layers = new LayersPanelPOM(page);
  await layers.open();
  await layers.addLayer();
  await expect
    .poll(async () => ((await activeView(page)).layers ?? []).length, {
      timeout: 5_000
    })
    .toBe(1);

  const layerName = (await activeView(page)).layers[0].name as string;
  for (const id of ids) await layers.dragItemToLayer(id, layerName);
  await expect
    .poll(async () => (await visibilityOf(page, ids[0])).layerId, {
      timeout: 5_000
    })
    .not.toBeNull();

  await layers.toggleVisibility(layerName);
  await expect
    .poll(async () => (await visibilityOf(page, ids[0])).visible, {
      timeout: 5_000
    })
    .toBe(false);

  return { ids, layerName, layers };
}

test.describe('RED-13 — deleting a layer resurrects what it was hiding', () => {
  test('the entities on a hidden layer become visible again when the layer is deleted', async ({
    app
  }) => {
    const { page } = app;
    const { ids, layerName } = await placeTwoOnAHiddenLayer(page);

    expect((await visibilityOf(page, ids[0])).visible).toBe(false);

    // Delete the layer: select its row, then hit the panel toolbar's delete
    // button (enabled only with a row selected; it carries no test hook, so it
    // is addressed by its MUI icon id).
    await page
      .locator(`[data-axoview-id="layer-row"][data-layer-name="${layerName}"]`)
      .click();
    await page
      .locator('button:has(svg[data-testid="DeleteOutlineOutlinedIcon"])')
      .click();
    await expect
      .poll(async () => ((await activeView(page)).layers ?? []).length, {
        timeout: 5_000
      })
      .toBe(0);

    const after = await visibilityOf(page, ids[0]);
    // Nothing about the entities changed except that their layer is gone —
    // they are visible again, with no confirmation and no undo affordance
    // distinct from the layer delete itself.
    expect(after.layerId).toBeNull();
    expect(after.visible).toBe(true);
    await expectStoreInvariants(page, 'after layer delete');
  });
});

test.describe('RED-15 — selection is not re-validated on a layer state change', () => {
  test.fail(
    'BUG: Delete still removes items whose layer was hidden after they were selected',
    async ({ app }) => {
      const { page } = app;

      await placeIconViaMouse(page, A);
      await placeIconViaMouse(page, B);
      await expect
        .poll(() => getModelItemCount(page), { timeout: 5_000 })
        .toBe(2);

      const view = await activeView(page);
      const ids: string[] = view.items.map((i: never & { id: string }) => i.id);

      const layers = new LayersPanelPOM(page);
      await layers.open();
      await layers.addLayer();
      const layerName = (await activeView(page)).layers[0].name as string;
      for (const id of ids) await layers.dragItemToLayer(id, layerName);

      // Select everything WHILE the layer is still visible + unlocked.
      await page.keyboard.press('Control+a');
      await expect
        .poll(async () => (await selectedIds(page)).length, { timeout: 5_000 })
        .toBeGreaterThan(0);

      // Now hide the layer. The selection is not revisited.
      await layers.toggleVisibility(layerName);
      await expect
        .poll(async () => (await visibilityOf(page, ids[0])).visible, {
          timeout: 5_000
        })
        .toBe(false);

      // ADR 0006 §3: selectedIds may only ever hold interactable refs, so the
      // selection must have been dropped and Delete must be inert.
      expect(await selectedIds(page)).toEqual([]);

      await page.keyboard.press('Delete');
      await page.waitForTimeout(300);
      expect(await getViewItemCount(page)).toBe(2);
    }
  );

  test.fail(
    'BUG: the same holds for LOCKING a layer under a live selection',
    async ({ app }) => {
      const { page } = app;

      await placeIconViaMouse(page, A);
      await placeIconViaMouse(page, B);
      await expect
        .poll(() => getModelItemCount(page), { timeout: 5_000 })
        .toBe(2);

      const view = await activeView(page);
      const ids: string[] = view.items.map((i: never & { id: string }) => i.id);

      const layers = new LayersPanelPOM(page);
      await layers.open();
      await layers.addLayer();
      const layerName = (await activeView(page)).layers[0].name as string;
      for (const id of ids) await layers.dragItemToLayer(id, layerName);

      await page.keyboard.press('Control+a');
      await expect
        .poll(async () => (await selectedIds(page)).length, { timeout: 5_000 })
        .toBeGreaterThan(0);

      await layers.toggleLock(layerName);
      await expect
        .poll(async () => (await visibilityOf(page, ids[0])).locked, {
          timeout: 5_000
        })
        .toBe(true);

      expect(await selectedIds(page)).toEqual([]);

      await page.keyboard.press('Delete');
      await page.waitForTimeout(300);
      expect(await getViewItemCount(page)).toBe(2);
    }
  );

  test('characterization: the stale selection survives and Delete goes through', async ({
    app
  }) => {
    const { page } = app;
    const { ids, layers, layerName } = await placeTwoOnAHiddenLayer(page);
    void ids;

    // Re-select while visible, then hide.
    await layers.toggleVisibility(layerName); // back to visible
    await page.keyboard.press('Control+a');
    const before = await selectedIds(page);
    expect(before.length).toBeGreaterThan(0);

    await layers.toggleVisibility(layerName); // hide again
    await page.waitForTimeout(200);

    // Selection unchanged…
    expect(await selectedIds(page)).toEqual(before);
    // …and the "untouchable" items are deleted anyway.
    await page.keyboard.press('Delete');
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(0);
  });
});
