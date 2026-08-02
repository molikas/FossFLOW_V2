/**
 * label-drag.spec.ts — T6 / ADR 0024 (node label positioning).
 *
 * A selected node's name label can be repositioned vertically — above AND below
 * the node — by dragging the label chip itself (the label IS the handle, no
 * separate grip). The placement is a SIGNED offset (`labelHeight` < 0 = below)
 * on the view item; it persists across reload and the whole drag commits as ONE
 * history entry (single undo). Precise numeric control lives in the Style panel's
 * (now signed) label-height slider.
 *
 * Asserts:
 *   - dragging the label chip down past the node makes `labelHeight` negative
 *     (label below), and the whole drag is a single undo entry (undo/redo);
 *   - it survives a reload through the app's last-opened-data store, which
 *     re-validates the view through `viewItemSchema` on boot.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { placeIconViaMouse } from '../helpers/place';
import {
  getModelHistoryLength,
  waitForDebugBridge
} from '../helpers/store';

type Page = import('@playwright/test').Page;

// Clear of the left docks (file tree + Elements panel end ~570px) and the right
// Properties panel (~980px+), so the placed node + its label aren't occluded.
const CANVAS_POINT = { x: 740, y: 330 };

/** Active-view item #0 — its signed label offset. */
const getLabelHeight = (page: Page) =>
  page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    const views = (window as any).__axoview__.model.getState().views;
    const view = views.find((v: any) => v.id === ui.view) ?? views[0];
    const item = (view?.items ?? [])[0];
    return item
      ? { id: item.id as string, labelHeight: item.labelHeight as number | undefined }
      : null;
  });

/** Place one node, give it a name (so the label renders), and select it. */
async function placeAndSelectNamedNode(page: Page): Promise<string> {
  await placeIconViaMouse(page, CANVAS_POINT);
  // Close the Elements panel so it can't occlude the label (the real-mouse drag
  // below hit-tests the topmost element).
  const elementsToggle = page.locator('[data-axoview-id="dock-elements-toggle"]');
  const firstIcon = page.locator('[data-axoview-id="canvas-icon-grid-item"]').first();
  if (await firstIcon.isVisible().catch(() => false)) {
    await elementsToggle.click();
    await firstIcon.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
  }
  return page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    const model = (window as any).__axoview__.model;
    const views = model.getState().views;
    const view = views.find((v: any) => v.id === ui.view) ?? views[0];
    const item = view.items[0];
    // Ensure the backing model item has a name so the name label renders. Model
    // + view items share the id (placeIcon couples them).
    const st = model.getState();
    const items = st.items.map((it: any) =>
      it.id === item.id ? { ...it, name: it.name || 'Drag Me' } : it
    );
    st.actions.set({ items });
    // Select (single) without opening the Properties panel. The reposition
    // gesture gates on itemControls only.
    ui.actions.setMode({ type: 'CURSOR', showCursor: true, mousedownItem: null });
    ui.actions.setItemControls({ type: 'ITEM', id: item.id }, { openPanel: false });
    return item.id as string;
  });
}

/** Real-mouse vertical drag of an element located by selector (past slop). */
async function dragElement(page: Page, selector: string, dy: number) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 5_000 });
  const box = await el.boundingBox();
  if (!box) throw new Error(`${selector} has no bounding box`);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + dy, { steps: 10 });
  await page.mouse.up();
}

// R4/RND-13/15: BOTH label-drag paths are the invisible hit proxy now.
// `canvas-label-chip` is the DOM `<Label>`'s reposition handle, which only
// exists on a PROMOTED node — and selection stopped promoting (ADR 0038 §8), so
// a selected node's label is grabbed exactly the way an unselected one's is.
// That the two tests below now drive the same surface is the point, not a
// duplication: one pins the undo/reload contract, the other that grabbing a
// label does not select.
const dragLabel = (page: Page, dy: number) =>
  dragElement(page, '[data-axoview-id="canvas-label-hit"]', dy);

test.describe('Label drag — T6 (ADR 0024)', () => {
  test('drag the label below the node; it is one undo entry and persists across reload', async ({
    page,
    app
  }) => {
    void app;

    await placeAndSelectNamedNode(page);

    const before = await getLabelHeight(page);
    expect(before).not.toBeNull();
    // Default placement is above the node (positive offset).
    expect((before!.labelHeight ?? 20)).toBeGreaterThan(0);

    // --- Drag the label below -----------------------------------------------
    const historyBefore = await getModelHistoryLength(page);
    await dragLabel(page, 170);

    await expect
      .poll(async () => (await getLabelHeight(page))?.labelHeight ?? 0, {
        timeout: 5_000
      })
      .toBeLessThan(0); // below the node

    // One gesture = one history entry (single undo).
    const historyAfter = await getModelHistoryLength(page);
    expect(historyAfter - historyBefore).toBe(1);

    // Undo restores the above-node placement; redo re-applies below.
    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => (await getLabelHeight(page))?.labelHeight ?? 20, {
        timeout: 5_000
      })
      .toBeGreaterThan(0);
    await page.keyboard.press('Control+y');
    await expect
      .poll(async () => (await getLabelHeight(page))?.labelHeight ?? 0, {
        timeout: 5_000
      })
      .toBeLessThan(0);

    const persisted = await getLabelHeight(page);
    expect(persisted!.labelHeight).toBeLessThan(0);

    // --- Persist across reload ---------------------------------------------
    // Write the current model to the app's last-opened-data store (exactly what
    // an explicit Save persists); boot re-validates it through viewItemSchema,
    // so this proves the signed offset round-trips.
    await page.evaluate(() => {
      const m = (window as any).__axoview__.model.getState();
      const data = {
        title: m.title,
        version: m.version,
        icons: m.icons,
        colors: m.colors,
        items: m.items,
        views: m.views
      };
      localStorage.setItem('axoview-last-opened-data', JSON.stringify(data));
    });
    await page.reload();
    await page.locator('[data-testid="axoview-canvas"]').waitFor({
      state: 'visible',
      timeout: 10_000
    });
    await waitForDebugBridge(page);

    const afterReload = await getLabelHeight(page);
    expect(afterReload).not.toBeNull();
    expect(afterReload!.labelHeight).toBe(persisted!.labelHeight);
  });

  test('an UNSELECTED node label can be dragged below, leaving selection unchanged', async ({
    page,
    app
  }) => {
    void app;

    await placeAndSelectNamedNode(page);
    // Deselect: the node returns to the canvas renderer, so the only way to grab
    // its label is the invisible hit layer (the feature under test).
    await page.evaluate(() => {
      (window as any).__axoview__.ui.getState().actions.clearSelection();
    });
    await expect
      .poll(
        () => page.evaluate(() => (window as any).__axoview__.ui.getState().itemControls),
        { timeout: 3_000 }
      )
      .toBeNull();

    const before = await getLabelHeight(page);
    expect((before!.labelHeight ?? 20)).toBeGreaterThan(0);

    // Drag the invisible label hit target (no prior selection).
    await dragElement(page, '[data-axoview-id="canvas-label-hit"]', 170);

    await expect
      .poll(async () => (await getLabelHeight(page))?.labelHeight ?? 0, {
        timeout: 5_000
      })
      .toBeLessThan(0);

    // Selection is still empty — grabbing the label didn't select the node.
    expect(
      await page.evaluate(() => (window as any).__axoview__.ui.getState().itemControls)
    ).toBeNull();
  });
});
