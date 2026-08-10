/**
 * Promoted from the E2 explore lane (ADR 0047 flip rule) — E2/RED-15.
 *
 * ADR 0006 §3 / canvas-interaction I-1: `selectedIds` may only ever contain
 * interactable refs. Every acquisition path enforced that; nothing re-validated
 * a selection that was legal when it was made and stopped being legal
 * afterwards. So selecting entities and *then* hiding or locking their layer
 * left the selection standing, and Delete removed items the user could no
 * longer see while a group drag moved entities the panel presented as locked.
 *
 * This lives end-to-end rather than only in
 * `dropUninteractableRefs.test.ts` because the unit test proves the FILTER and
 * this proves the WIRING: layer state lives in the model and selection in
 * ui-state, and the whole bug was that nothing connected them. A unit test
 * cannot fail if the invalidation effect is deleted.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPoint } from '../pom/CanvasPOM';
import { LayersPanelPOM } from '../pom/LayersPanelPOM';
import { placeIconViaMouse } from '../helpers/place';
import { getModelItemCount, getViewItemCount } from '../helpers/store';

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

/** Two icons on one new layer, selected while that layer is visible + unlocked. */
async function selectTwoOnAFreshLayer(page: import('@playwright/test').Page) {
  await placeIconViaMouse(page, A);
  await placeIconViaMouse(page, B);
  await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(2);

  const view = await activeView(page);
  const ids: string[] = view.items.map((i: { id: string }) => i.id);

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

  // The selection is acquired while the layer is still fully interactable, so
  // it is legal at the moment it is made. That is the whole premise.
  await page.keyboard.press('Control+a');
  await expect
    .poll(async () => (await selectedIds(page)).length, { timeout: 5_000 })
    .toBeGreaterThan(0);

  return { ids, layerName, layers };
}

test.describe('RED-15 — a layer state change invalidates the live selection', () => {
  test('hiding the layer drops the selection, and Delete is inert', async ({
    app
  }) => {
    const { page } = app;
    const { ids, layers, layerName } = await selectTwoOnAFreshLayer(page);

    await layers.toggleVisibility(layerName);
    await expect
      .poll(async () => (await visibilityOf(page, ids[0])).visible, {
        timeout: 5_000
      })
      .toBe(false);

    await expect
      .poll(async () => (await selectedIds(page)).length, { timeout: 5_000 })
      .toBe(0);

    // The consequence the entry is actually about: Delete used to remove items
    // the user could no longer see.
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    expect(await getViewItemCount(page)).toBe(2);
  });

  test('locking the layer drops the selection too', async ({ app }) => {
    const { page } = app;
    const { ids, layers, layerName } = await selectTwoOnAFreshLayer(page);

    await layers.toggleLock(layerName);
    await expect
      .poll(async () => (await visibilityOf(page, ids[0])).locked, {
        timeout: 5_000
      })
      .toBe(true);

    await expect
      .poll(async () => (await selectedIds(page)).length, { timeout: 5_000 })
      .toBe(0);

    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    expect(await getViewItemCount(page)).toBe(2);
  });

  test('CONTROL: hiding an UNRELATED layer leaves the selection alone', async ({
    app
  }) => {
    // Both tests above would also pass if the effect simply cleared the
    // selection on every layer-context change, which would make Ctrl+A useless
    // the moment any layer was touched. The invalidation has to be scoped to
    // refs that actually stopped being interactable.
    const { page } = app;
    const { layers, layerName } = await selectTwoOnAFreshLayer(page);

    await layers.addLayer();
    await expect
      .poll(async () => ((await activeView(page)).layers ?? []).length, {
        timeout: 5_000
      })
      .toBe(2);
    const otherName = (await activeView(page)).layers.find(
      (l: { name: string }) => l.name !== layerName
    ).name as string;

    // Empty layer, so nothing the selection holds changes interactability.
    await layers.toggleVisibility(otherName);
    await page.waitForTimeout(300);

    expect((await selectedIds(page)).length).toBeGreaterThan(0);
    await page.keyboard.press('Delete');
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(0);
  });
});
