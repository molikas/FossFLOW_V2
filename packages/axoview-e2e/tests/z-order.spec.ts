/**
 * z-order.spec.ts — v1.1 Track 5e-4.
 *
 * Item z-index ordering via the Ctrl+] / Ctrl+[ hotkeys
 * (useInteractionManager.ts:408-427). The hotkey applies a +1 / -1
 * delta to the currently-controlled item's `zIndex` field via
 * `scene.updateViewItem(id, { zIndex })`. The view's render layer
 * uses this to stack overlapping items.
 *
 * Contract pinned: after two Ctrl+] presses on a selected item, its
 * zIndex is +2 from the baseline. Ctrl+[ decrements symmetrically.
 * Items default to zIndex=0 (the falsy branch in useInteractionManager
 * line 422 — `(viewItem as any).zIndex ?? 0`).
 *
 * The "rectangle z-order on overlap" sub-row of 5e-4 (rectangle
 * underneath node vs over; selection-on-overlap) needs the rectangle's
 * own z-index handling, which the lib applies at render time via
 * the Rectangle component's layer order. Pinning that contract
 * requires reading DOM stacking after the assertion — out of scope
 * for the hotkey-side contract. Filed as part of the broader 5e-4
 * coverage that splits between hotkey assertions (here) and visual-
 * stack assertions (deferred per Finding #5).
 *
 * Lazy data-axoview-id retrofits — none. Hotkey driven; item selection
 * via single-click in CURSOR mode.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM, CanvasPoint } from '../pom/CanvasPOM';
import { byAxoviewId, byLibTestId } from '../helpers/selectors';
import { getModelItemCount } from '../helpers/store';

const getItemControls = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().itemControls ?? null
  );

const getViewItemZIndex = (
  page: import('@playwright/test').Page,
  itemId: string
) =>
  page.evaluate((id: string) => {
    const viewId = (window as any).__axoview__.ui.getState().view;
    const views = (window as any).__axoview__.model.getState().views;
    const view = (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
    const item = (view?.items ?? []).find((i: any) => i.id === id);
    return item?.zIndex ?? 0;
  }, itemId);

async function placeIcon(
  page: import('@playwright/test').Page,
  point: CanvasPoint
) {
  const elementsToggle = byAxoviewId(page, 'dock-elements-toggle');
  const firstIcon = byAxoviewId(page, 'canvas-icon-grid-item').first();
  if (!(await firstIcon.isVisible().catch(() => false))) {
    await elementsToggle.click();
    await firstIcon.waitFor({ state: 'visible', timeout: 5_000 });
  }
  const canvas = byLibTestId(page, 'axoview-canvas');
  const iconBox = await firstIcon.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!iconBox || !canvasBox)
    throw new Error('placeIcon: icon or canvas missing a bounding box');
  await page.mouse.move(
    iconBox.x + iconBox.width / 2,
    iconBox.y + iconBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + point.x, canvasBox.y + point.y, {
    steps: 10
  });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

test.describe('Z-order — Track 5e-4', () => {
  test('5e-4: Ctrl+] / Ctrl+[ increment / decrement the selected item zIndex', async ({ page, app }) => {
    void app;
    const canvas = new CanvasPOM(page);

    const ICON_A: CanvasPoint = { x: 380, y: 280 };
    await placeIcon(page, ICON_A);
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(1);

    // Single-click the icon to select it; useInteractionManager's
    // Ctrl+] / Ctrl+[ branch reads `uiState.itemControls` to identify
    // the target. CanvasPOM.clickAt dispatches a synthetic
    // mousemove/down/up sequence on canvas-interactions — Cursor.mouseup
    // routes the no-drag click into setItemControls({ type: 'ITEM' }).
    await canvas.clickAt(ICON_A);
    await expect
      .poll(async () => (await getItemControls(page))?.type ?? null, {
        timeout: 3_000
      })
      .toBe('ITEM');

    const itemControls = await getItemControls(page);
    expect(itemControls?.id).toBeTruthy();
    const itemId = itemControls!.id as string;

    expect(await getViewItemZIndex(page, itemId)).toBe(0);

    // Ctrl+] increments.
    await page.keyboard.press('Control+]');
    await expect
      .poll(() => getViewItemZIndex(page, itemId), { timeout: 3_000 })
      .toBe(1);

    // A second Ctrl+] takes it to +2.
    await page.keyboard.press('Control+]');
    await expect
      .poll(() => getViewItemZIndex(page, itemId), { timeout: 3_000 })
      .toBe(2);

    // Ctrl+[ decrements back to +1.
    await page.keyboard.press('Control+[');
    await expect
      .poll(() => getViewItemZIndex(page, itemId), { timeout: 3_000 })
      .toBe(1);

    // E2 absolute: Ctrl+Shift+[ jumps to back (below all peers → <0), and
    // Ctrl+Shift+] jumps to front (above all peers). With one node the peer set
    // is {this}, so back = min(0, z)-1 and front = max(0, ...)+1.
    //
    // NOTE (I1/PTR-14): these two legs were a FALSE GREEN until wave 3.
    // `page.keyboard.press('Control+Shift+]')` synthesises `e.key === ']'` with
    // Shift held — an identity no physical keyboard produces; a real US keyboard
    // sends `'}'`, which the handler's `e.key !== ']'` guard rejected outright.
    // The chords passed here and were dead in the product. The real key
    // identities are now driven through CDP `Input.dispatchKeyEvent` in
    // `canvas-keyboard-scope.spec.ts`; these legs stay as the synthetic control.
    // Any other suite that drives CHORDED PUNCTUATION through `keyboard.press`
    // deserves the same audit.
    await page.keyboard.press('Control+Shift+[');
    await expect
      .poll(() => getViewItemZIndex(page, itemId), { timeout: 3_000 })
      .toBeLessThan(0);

    await page.keyboard.press('Control+Shift+]');
    await expect
      .poll(() => getViewItemZIndex(page, itemId), { timeout: 3_000 })
      .toBeGreaterThan(0);
  });
});
