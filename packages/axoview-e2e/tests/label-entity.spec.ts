/**
 * label-entity.spec.ts — Floating Label as a first-class entity (ADR 0031).
 *
 * Covers the binary KR2 behaviours the extraction exists to deliver:
 *   - placement: arming the Label tool + clicking drops exactly ONE Label
 *     (Label.mouseup → scene.createLabel; its own mode, not a textBox variant).
 *   - render / z-order: the placed Label paints on the merged bulk canvas ABOVE
 *     nodes at the same layer/z-index — the `label` TYPE RANK in
 *     `compareSceneDrawOrder`. R3/GPU-13 (ADR 0038 §8) merged the four bulk
 *     canvases, so this "asserts the sort, not DOM order" as the amendment
 *     requires: there is no mount order left to read. The cross-type ORDERING
 *     itself is proven pixel-wise by `cross-type-z-order.spec.ts`; here the
 *     assertion is that the merged canvas drew the chip at all.
 *   - full-chip select: the pixel-accurate LabelHitLayer proxy spans the whole
 *     chip, so a press anywhere on it selects the Label (not just the anchor
 *     tile, the old variant's limitation).
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM, CanvasPoint } from '../pom/CanvasPOM';
import { sceneCounters } from '../helpers/sceneCanvas';

const getViewLabelCount = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const viewId = (window as any).__axoview__.ui.getState().view;
    const views = (window as any).__axoview__.model.getState().views;
    const view =
      (viewId && views.find((v: any) => v.id === viewId)) ?? views?.[0];
    return Array.isArray(view?.labels) ? view.labels.length : 0;
  });

const getFirstLabelId = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const viewId = (window as any).__axoview__.ui.getState().view;
    const views = (window as any).__axoview__.model.getState().views;
    const view =
      (viewId && views.find((v: any) => v.id === viewId)) ?? views?.[0];
    return (view?.labels ?? [])[0]?.id ?? null;
  });

const getItemControlsType = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().itemControls?.type ?? null
  );

const clearSelection = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    (window as any).__axoview__.ui.getState().actions.setItemControls(null)
  );

// Place-and-type (2026-07 cycle): placement opens the Label's inline editor
// immediately; while editing, LabelsCanvas skips painting it and LabelHitLayer
// mounts the editor instead of the hit chip. Enter commits the seeded text so
// the committed-chip assertions below see the at-rest state.
const commitPlacementEdit = async (page: import('@playwright/test').Page) => {
  await page.keyboard.press('Enter');
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as any).__axoview__.ui.getState().inlineEditLabelId
        ),
      { timeout: 3_000 }
    )
    .toBeNull();
};

test.describe('Floating Label entity (ADR 0031)', () => {
  test('placement: arming the Label tool + clicking creates exactly one Label', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);

    await canvas.placeLabelAt({ x: 400, y: 300 });
    await expect.poll(() => getViewLabelCount(page), { timeout: 5_000 }).toBe(1);

    await canvas.placeLabelAt({ x: 560, y: 380 });
    await expect.poll(() => getViewLabelCount(page), { timeout: 5_000 }).toBe(2);
  });

  test('render/z-order: the Label paints on LabelsCanvas, DOM-after NodesCanvas (above nodes)', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);

    await canvas.placeLabelAt({ x: 400, y: 300 });
    await expect.poll(() => getViewLabelCount(page), { timeout: 5_000 }).toBe(1);
    await commitPlacementEdit(page);

    // ADR 0031 §2 is a SORT-KEY property now, not a mount-order one: `label` is
    // the highest type rank in `compareSceneDrawOrder`, so a Label paints above a
    // node at the same layer and z-index. There is one canvas, so there is no DOM
    // order to compare — the ordering is proven pixel-wise in
    // `cross-type-z-order.spec.ts`, and what this spec owes is that the merged
    // canvas actually drew the chip.
    await expect
      .poll(() => sceneCounters(page).then((c) => c.floatingLabelsDrawn ?? 0), {
        timeout: 5_000
      })
      .toBeGreaterThanOrEqual(1);
  });

  test('full-chip select: a press anywhere on the chip selects the Label', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);

    await canvas.placeLabelAt({ x: 400, y: 300 });
    await expect.poll(() => getViewLabelCount(page), { timeout: 5_000 }).toBe(1);
    await commitPlacementEdit(page);
    const id = await getFirstLabelId(page);
    expect(id).toBeTruthy();

    // Placement auto-selects; clear so the click is what selects.
    await clearSelection(page);
    await expect.poll(() => getItemControlsType(page)).toBeNull();

    const hit = page.locator(`[data-label-hit-id="${id}"]`);
    await expect(hit).toBeVisible();
    // The proxy spans the FULL chip, not a single anchor tile.
    const box = await hit.boundingBox();
    expect(box!.width).toBeGreaterThan(30);
    // Press near the right edge — well off the anchor tile — to prove full-width.
    await hit.click({ position: { x: box!.width - 4, y: box!.height / 2 } });

    await expect
      .poll(() => getItemControlsType(page), { timeout: 5_000 })
      .toBe('LABEL');
  });

  // UX sweep 2026-07-10 (Maya/Devin) — floating-Label interaction wiring.

  test('delete (L-1): selecting a Label and pressing Delete removes it', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);

    await canvas.placeLabelAt({ x: 400, y: 300 });
    await expect.poll(() => getViewLabelCount(page), { timeout: 5_000 }).toBe(1);
    await commitPlacementEdit(page);
    const id = await getFirstLabelId(page);
    await clearSelection(page);

    await page.locator(`[data-label-hit-id="${id}"]`).click();
    await expect
      .poll(() => getItemControlsType(page), { timeout: 5_000 })
      .toBe('LABEL');

    // The single-item delete dispatcher previously had no LABEL branch, so this
    // was a silent no-op — the label merely deselected.
    await page.keyboard.press('Delete');
    await expect.poll(() => getViewLabelCount(page), { timeout: 5_000 }).toBe(0);
  });

  test('select (L-3): clicking a Label does NOT auto-open the Properties dock', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);

    await canvas.placeLabelAt({ x: 400, y: 300 });
    await expect.poll(() => getViewLabelCount(page), { timeout: 5_000 }).toBe(1);
    await commitPlacementEdit(page);
    const id = await getFirstLabelId(page);
    await clearSelection(page);

    const dockOpen = () =>
      page.evaluate(
        () =>
          (window as any).__axoview__.ui.getState().rightSidebarOpen === true
      );
    expect(await dockOpen()).toBe(false);

    await page.locator(`[data-label-hit-id="${id}"]`).click();
    await expect
      .poll(() => getItemControlsType(page), { timeout: 5_000 })
      .toBe('LABEL');
    // ADR 0022 §3 select-only: a Label is inline-edited on canvas, so selecting
    // it must not mount the Notes-only deck (which read as "the text editor").
    expect(await dockOpen()).toBe(false);
  });

  test('context menu (L-2): right-clicking a Label opens its item menu', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);

    await canvas.placeLabelAt({ x: 400, y: 300 });
    await expect.poll(() => getViewLabelCount(page), { timeout: 5_000 }).toBe(1);
    await commitPlacementEdit(page);
    const id = await getFirstLabelId(page);
    await clearSelection(page);

    // The hit-proxy used to swallow the right button (opening the Notes deck and
    // stopping propagation), so labels had no context menu at all.
    await page.locator(`[data-label-hit-id="${id}"]`).click({ button: 'right' });
    const menu = await page.evaluate(() => {
      const cm = (window as any).__axoview__.ui.getState().contextMenu;
      return cm ? { variant: cm.variant, targetType: cm.target?.type } : null;
    });
    expect(menu).toEqual({ variant: 'item', targetType: 'LABEL' });
  });
});
