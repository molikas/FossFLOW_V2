/**
 * Promoted from the E2 explore lane (ADR 0047 flip rule) — E2/RED-13, and the
 * user-facing half of F4/LAY-05.
 *
 * Deleting a layer used to unassign its contents silently. Because visibility
 * is derived as `!layer || layer.visible`, an entity with no layer is
 * UNCONDITIONALLY visible — so deleting a HIDDEN layer revealed everything it
 * was hiding. Both readings of "delete a layer" are defensible (Visio frees the
 * contents, Photoshop removes them), so the owner's ruling was to ASK rather
 * than to pick one.
 *
 * `deleteLayerContents.test.ts` covers the reducer. This covers the ruling:
 * that the question is actually put to the user, that both answers are wired to
 * the right mechanism, and that the hidden-layer case is called out — none of
 * which a reducer test can fail on.
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

/** Two icons assigned to one new layer. `hide` leaves that layer hidden. */
async function twoOnALayer(
  page: import('@playwright/test').Page,
  { hide }: { hide: boolean }
) {
  await placeIconViaMouse(page, A);
  await placeIconViaMouse(page, B);
  await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(2);

  const ids: string[] = (await activeView(page)).items.map((i: { id: string }) => i.id);

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
    .poll(
      async () =>
        (await activeView(page)).items.filter((i: { layerId?: string }) =>
          Boolean(i.layerId)
        ).length,
      { timeout: 5_000 }
    )
    .toBe(2);

  if (hide) {
    await layers.toggleVisibility(layerName);
    await expect
      .poll(async () => (await activeView(page)).layers[0].visible, {
        timeout: 5_000
      })
      .toBe(false);
  }

  return { ids, layerName, layers };
}

test.describe('RED-13 / LAY-05 — deleting a layer asks what to do with its contents', () => {
  test('a layer that HOLDS something opens the dialog instead of acting', async ({
    app
  }) => {
    const { page } = app;
    const { layers, layerName } = await twoOnALayer(page, { hide: false });

    await layers.selectLayer(layerName);
    await layers.deleteSelectedLayer();

    await expect(layers.deleteDialog()).toBeVisible();
    // Nothing has happened yet — this is a question, not a confirmation of
    // something already done.
    expect(((await activeView(page)).layers ?? []).length).toBe(1);
    expect(await getViewItemCount(page)).toBe(2);
  });

  test('"keep them" unassigns the contents — they survive the layer', async ({
    app
  }) => {
    const { page } = app;
    const { layers, layerName } = await twoOnALayer(page, { hide: false });

    await layers.selectLayer(layerName);
    await layers.deleteSelectedLayer();
    await layers.confirmDeleteKeepContents();

    await expect
      .poll(async () => ((await activeView(page)).layers ?? []).length, {
        timeout: 5_000
      })
      .toBe(0);
    expect(await getViewItemCount(page)).toBe(2);
    const stillAssigned = (await activeView(page)).items.filter(
      (i: { layerId?: string }) => Boolean(i.layerId)
    );
    expect(stillAssigned).toEqual([]);
  });

  test('"delete them too" removes the contents with the layer', async ({
    app
  }) => {
    const { page } = app;
    const { layers, layerName } = await twoOnALayer(page, { hide: false });

    await layers.selectLayer(layerName);
    await layers.deleteSelectedLayer();
    await layers.confirmDeleteWithContents();

    await expect
      .poll(() => getViewItemCount(page), { timeout: 5_000 })
      .toBe(0);
    expect(((await activeView(page)).layers ?? []).length).toBe(0);
  });

  test('a HIDDEN layer says so — the silent-reveal case that filed RED-13', async ({
    app
  }) => {
    // The extra sentence exists because "keep them" on a hidden layer INVERTS
    // the contents' visibility: unassigned means unconditionally visible. That
    // is the exact surprise the entry is about, and it is the one branch where
    // the safe-sounding answer is the destructive-looking one.
    const { page } = app;
    const { layers, layerName } = await twoOnALayer(page, { hide: true });

    await layers.selectLayer(layerName);
    await layers.deleteSelectedLayer();

    await expect(layers.deleteDialog()).toBeVisible();
    await expect(layers.hiddenLayerWarning()).toBeVisible();
  });

  test('CONTROL: an EMPTY layer is deleted outright, with no dialog', async ({
    app
  }) => {
    // Otherwise the dialog would be a modal on a decision that has no content —
    // and this also proves the tests above see a dialog because the layer holds
    // something, not because the dialog always opens.
    const { page } = app;
    const layers = new LayersPanelPOM(page);
    await layers.open();
    await layers.addLayer();
    await expect
      .poll(async () => ((await activeView(page)).layers ?? []).length, {
        timeout: 5_000
      })
      .toBe(1);

    const layerName = (await activeView(page)).layers[0].name as string;
    await layers.selectLayer(layerName);
    await layers.deleteSelectedLayer();

    await expect
      .poll(async () => ((await activeView(page)).layers ?? []).length, {
        timeout: 5_000
      })
      .toBe(0);
    await expect(layers.deleteDialog()).toBeHidden();
  });
});
