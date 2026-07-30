/**
 * F4 probes — the Layers panel's enforcement paths, driven through the real
 * panel and the real keyboard.
 *
 * The listed baseline gaps this closes: "Locked layer vs Delete key, lasso
 * capture, and Ctrl+A", "Which layer NEW items land on (active-layer
 * semantics)", "Layer visibility/lock state round-trip through save/reload",
 * "Hidden-layer items vs export image output".
 *
 * RIG NOTES: every test destructures `app` (the fixture is lazy) and asserts
 * its PRECONDITION — the layer really exists, the flag really flipped, the
 * entity really is on it — before concluding.
 */
import {
  exploreTest as test,
  expect
} from '../../fixtures/explore.fixture';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { LayersPanelPOM } from '../../pom/LayersPanelPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getViewItemCount } from '../../helpers/store';

type Page = import('@playwright/test').Page;

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const views = bridge.model.getState().views;
    return (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
  });

const layers = async (page: Page) =>
  ((await activeView(page))?.layers ?? []).map((l: any) => ({
    id: l.id as string,
    name: l.name as string,
    visible: l.visible as boolean,
    locked: l.locked as boolean,
    order: l.order as number
  }));

interface ProbeItem {
  id: string;
  layerId: string | undefined;
}

const viewItems = async (page: Page): Promise<ProbeItem[]> =>
  ((await activeView(page))?.items ?? []).map((i: any) => ({
    id: i.id as string,
    layerId: i.layerId as string | undefined
  }));

const selectedIds = (page: Page) =>
  page.evaluate(
    () =>
      ((window as any).__axoview__.ui.getState().selectedIds ?? []) as Array<{
        type: string;
        id: string;
      }>
  );

/** Place a node, then move it onto a layer through the panel's own drag. */
const setupNodeOnLayer = async (page: Page, layerName = 'Layer 1') => {
  const canvas = new CanvasPOM(page);
  await placeIconViaMouse(page, await canvas.tileToScreen({ x: 1, y: 1 }));
  await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);
  const nodeId = (await viewItems(page))[0].id;

  const panel = new LayersPanelPOM(page);
  await panel.open();
  await panel.addLayer();
  await expect.poll(async () => (await layers(page)).length, { timeout: 5_000 }).toBe(
    1
  );
  const layerRealName = (await layers(page))[0].name;
  await panel.dragItemToLayer(nodeId, layerRealName);
  await expect
    .poll(async () => (await viewItems(page))[0].layerId, { timeout: 5_000 })
    .toBeTruthy();
  return { panel, canvas, nodeId, layerName: layerRealName };
};

// ---------------------------------------------------------------------------
// LAY-03 — which layer a new item lands on
// ---------------------------------------------------------------------------

test.describe('F4 / active-layer semantics', () => {
  test('LAY-03: a node placed while a layer is selected still lands unassigned', async ({
    page,
    app
  }) => {
    void app;
    const { panel, canvas, nodeId } = await setupNodeOnLayer(page);
    // PRECONDITION: a layer exists and the FIRST node (captured by id, never by
    // array index — the view's items order is not placement order) is on it.
    expect((await layers(page)).length).toBe(1);
    const first = (await viewItems(page)).find((i) => i.id === nodeId);
    expect(first?.layerId).toBeTruthy();

    // Select the layer row (the closest thing to an "active layer"), then place
    // a second node.
    const layerRow = panel.getLayerRow((await layers(page))[0].name);
    await layerRow.click();
    await placeIconViaMouse(page, await canvas.tileToScreen({ x: 5, y: 1 }));
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(2);

    const fresh = (await viewItems(page)).find((i) => i.id !== nodeId);
    expect(fresh).toBeTruthy();
    // CHARACTERIZATION, recorded either way: `PlaceIcon` writes
    // `{ ...VIEW_ITEM_DEFAULTS, id, tile, offset }` and never a layerId, so a
    // freshly placed node should be unassigned however the panel looks.
    expect(fresh!.layerId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// LAY-06 / LAY-08 — a locked layer vs Ctrl+A and Delete
// ---------------------------------------------------------------------------

test.describe('F4 / locked-layer enforcement', () => {
  test('LAY-06/08: Ctrl+A selects a locked layer\'s node, and Delete then removes it', async ({
    page,
    app
  }) => {
    void app;
    const { panel, nodeId, layerName } = await setupNodeOnLayer(page);
    await panel.toggleLock(layerName);
    // PRECONDITION: the layer really is locked now.
    await expect
      .poll(async () => (await layers(page))[0].locked, { timeout: 5_000 })
      .toBe(true);

    // Move focus off the panel so the canvas shortcut layer receives the keys.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);

    // CHARACTERIZATION: what Ctrl+A actually picked up, and what Delete then
    // did to it — asserted explicitly so neither outcome can pass by default.
    const selected = await selectedIds(page);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    expect({
      selectedTheLockedNode: selected.some((s) => s.id === nodeId),
      survivedDelete: (await getViewItemCount(page)) === 1
    }).toEqual({ selectedTheLockedNode: false, survivedDelete: true });
  });

  test('LAY-06b control: a locked layer DOES block the pointer path', async ({
    page,
    app
  }) => {
    void app;
    const { panel, canvas, layerName } = await setupNodeOnLayer(page);
    await panel.toggleLock(layerName);
    await expect
      .poll(async () => (await layers(page))[0].locked, { timeout: 5_000 })
      .toBe(true);
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setSelectedIds([])
    );

    // A real click on the node's tile must not select it (Cursor.mousedown's
    // isItemInteractable filter) — this is what makes LAY-06 a keyboard-only
    // hole rather than "locking does nothing".
    await canvas.clickAt(await canvas.tileToScreen({ x: 1, y: 1 }));
    await page.waitForTimeout(250);
    expect(await selectedIds(page)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// LAY-04 — visibility / lock round-trip
// ---------------------------------------------------------------------------

test.describe('F4 / layer flag persistence', () => {
  test('LAY-04: layer visible/locked flags survive an export → re-load round trip', async ({
    page,
    app
  }) => {
    void app;
    const { panel, layerName } = await setupNodeOnLayer(page);
    await panel.toggleLock(layerName);
    await panel.toggleVisibility(layerName);
    await expect
      .poll(async () => {
        const l = (await layers(page))[0];
        return { visible: l.visible, locked: l.locked };
      }, { timeout: 5_000 })
      .toEqual({ visible: false, locked: true });

    // Round-trip the model exactly as a save→load would: read it out, feed it
    // back through the model store.
    const exported = await page.evaluate(() => {
      const m = (window as any).__axoview__.model.getState();
      return JSON.parse(JSON.stringify({ views: m.views, items: m.items }));
    });
    await page.evaluate((snapshot: any) => {
      (window as any).__axoview__.model.getState().actions.set(snapshot);
    }, exported);
    await page.waitForTimeout(300);

    const after = (await layers(page))[0];
    expect({ visible: after.visible, locked: after.locked }).toEqual({
      visible: false,
      locked: true
    });
  });
});

// ---------------------------------------------------------------------------
// LAY-02 — a hidden layer vs the exported image
// ---------------------------------------------------------------------------

test.describe('F4 / hidden layers and export', () => {
  test('LAY-02: the export dialog\'s hidden Axoview hides the same layer the canvas does', async ({
    page,
    app
  }) => {
    void app;
    const { panel, layerName } = await setupNodeOnLayer(page);
    await panel.toggleVisibility(layerName);
    await expect
      .poll(async () => (await layers(page))[0].visible, { timeout: 5_000 })
      .toBe(false);
    // PRECONDITION: exactly one node, and it is on the now-hidden layer.
    const items = await viewItems(page);
    expect(items).toHaveLength(1);
    expect(items[0].layerId).toBeTruthy();

    // Open the export dialog — it mounts a SECOND Axoview over the same model.
    // (The bridge is destroyed by this dialog — R3/GPU-02 — so every bridge
    // read above must already have happened.)
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setDialog('EXPORT_IMAGE')
    );
    await page.waitForTimeout(2000);

    // The hidden export instance renders the same LayerContextProvider over the
    // same model, so a hidden layer must be hidden there too: no node DOM in
    // either renderer.
    const nodeShells = await page.locator('[data-drag-id]').count();
    expect(nodeShells).toBe(0);
  });
});
