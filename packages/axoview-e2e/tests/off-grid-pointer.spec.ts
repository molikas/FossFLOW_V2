/**
 * off-grid-pointer.spec.ts — the SUB-TILE regime (ADR 0023 hardening, F1).
 *
 * WHY THIS EXISTS. `snap-grid.spec.ts` is the ADR's acceptance surface and it
 * asserts the DATA MODEL: the tile stays integer, an `offset` gets committed.
 * All seven off-grid bugs shipped green under it, because they lived one layer
 * up — in where an item is DRAWN versus where it is FRAMED and HIT-TESTED. This
 * spec asserts that layer:
 *
 *   - a sub-tile drag moves the element's DOM box by EXACTLY the pointer delta
 *     (no snap-back) — something a tile-centre→tile-centre drag structurally
 *     cannot exercise;
 *   - hover, click, selection chrome and the context menu all resolve at the
 *     DRAWN position, while the grid cell the item left resolves to the canvas;
 *   - a node's name chip is grabbable, and right-clickable, where it is drawn.
 *
 * Real `page.mouse` throughout (locked decision 7, precedent
 * `connector-realmouse.spec.ts`): the synthetic-pointer POM path dispatches
 * directly on the interactions box, forcing `isRendererInteraction` and skipping
 * `document.elementFromPoint` — the exact blindness that hid the label-layer and
 * context-menu bugs.
 *
 * Note on measuring: a node is painted on the WebGL bulk at rest and promoted to
 * DOM only while it is the single selection. So the DOM box is read with the
 * node selected, and re-selecting it after the nudge doubles as a hit-test
 * assertion — if the click at the drawn position missed, there would be no box.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { byAxoviewId } from '../helpers/selectors';
import { getViewItemCount } from '../helpers/store';
import { promotedIconBox } from '../helpers/nodeOverlay';
import {
  centreOf,
  closeElementsPanel,
  drawnClientPoint,
  getContextMenu,
  getHoveredItemId,
  getOffGridItems,
  hoverAt,
  placeIconRealMouse,
  Point,
  realDrag,
  setSnapToGrid
} from '../helpers/offGrid';

type Page = import('@playwright/test').Page;
type Locator = ReturnType<Page['locator']>;

/** The deliberately non-tile-multiple nudge, in SCREEN px. */
const NUDGE: Point = { x: 37, y: 11 };

/**
 * Place one node with global snap OFF and select it by clicking where it is
 * DRAWN — which is itself a hit-test assertion, and the one this file is about.
 *
 * R4/RND-13/15: selecting no longer mounts a DOM overlay (ADR 0038 §8), so the
 * click is verified against `itemControls` rather than against an element
 * appearing, and the icon box comes from `helpers/nodeOverlay` — see there for
 * why measuring the overlay is still measuring the drawn position.
 */
async function placeAndSelect(page: Page) {
  await setSnapToGrid(page, false);
  await placeIconRealMouse(page, { x: 460, y: 320 });
  await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);
  await closeElementsPanel(page);

  const [item] = await getOffGridItems(page);
  const at = await drawnClientPoint(page, item);
  await page.mouse.click(at.x, at.y);
  await expect
    .poll(() => selectedItemId(page), { timeout: 5_000 })
    .toBe(item.id);
  return { id: item.id };
}

/** The id of the single-selected ITEM, or null. */
const selectedItemId = (page: Page) =>
  page.evaluate(() => {
    const ic = (window as any).__axoview__.ui.getState().itemControls;
    return ic && ic.type === 'ITEM' ? ic.id : null;
  });

/**
 * Nudge the selected node by NUDGE screen px; return the icon box either side
 * plus where the node ends up drawn (and the cell it is based on).
 *
 * The gesture is grabbed at the node's HIT centre — its tile projection plus any
 * residual — not at the icon image's centre: an isometric icon is drawn standing
 * ABOVE its tile, so the image centre is outside the tile footprint and a press
 * there would start a lasso instead of a move.
 */
async function nudge(page: Page, id: string) {
  const before = await promotedIconBox(page, id);

  const start = (await getOffGridItems(page)).find((i) => i.id === id)!;
  const grab = await drawnClientPoint(page, start);
  await realDrag(page, grab, { x: grab.x + NUDGE.x, y: grab.y + NUDGE.y });

  const moved = (await getOffGridItems(page)).find((i) => i.id === id)!;
  const drawn = await drawnClientPoint(page, moved);
  const bare = await drawnClientPoint(page, { ...moved, offset: undefined });

  // Click it at its DRAWN position — a hit-test assertion in itself — then
  // measure the icon again.
  await page.mouse.click(drawn.x, drawn.y);
  await expect.poll(() => selectedItemId(page), { timeout: 5_000 }).toBe(id);
  const after = await promotedIconBox(page, id);

  return { before, after, drawn, bare, moved };
}

/** Clear the selection by clicking bare canvas well away from the node. */
async function clearSelection(page: Page, bare: Point) {
  await page.mouse.click(bare.x + 220, bare.y + 140);
  await page.waitForTimeout(150);
}

test.describe('Off-grid pointer — the sub-tile regime (ADR 0023)', () => {
  test('a sub-tile drag moves the element by EXACTLY the pointer delta', async ({
    page,
    app
  }) => {
    void app;
    const { id } = await placeAndSelect(page);
    const { before, after, moved } = await nudge(page, id);

    // The whole point: the element sits where the pointer left it. A snap-back
    // would round this to a whole tile (~46 × 27 screen px at the default zoom)
    // — far outside this tolerance in both axes.
    expect(after.x - before.x).toBeGreaterThan(NUDGE.x - 4);
    expect(after.x - before.x).toBeLessThan(NUDGE.x + 4);
    expect(after.y - before.y).toBeGreaterThan(NUDGE.y - 4);
    expect(after.y - before.y).toBeLessThan(NUDGE.y + 4);

    // …and the model kept its integer tile, with the residual in `offset`.
    expect(Number.isInteger(moved.tile.x)).toBe(true);
    expect(Number.isInteger(moved.tile.y)).toBe(true);
    expect(moved.offset).toBeTruthy();
  });

  test('hover, selection chrome and the context menu resolve at the DRAWN position', async ({
    page,
    app
  }) => {
    void app;
    const { id } = await placeAndSelect(page);
    const { drawn, bare } = await nudge(page, id);
    await clearSelection(page, bare);

    // HOVER at the drawn position raises the outline (see `hoverAt` for why the
    // cursor is parked first).
    await hoverAt(page, { x: bare.x + 220, y: bare.y + 140 }, drawn);
    await expect.poll(() => getHoveredItemId(page), { timeout: 3_000 }).toBe(id);

    const outline = byAxoviewId(page, 'canvas-hover-outline').first();
    await outline.waitFor({ state: 'visible', timeout: 3_000 });
    const outlineBox = await outline.boundingBox();
    if (!outlineBox) throw new Error('hover outline has no bounding box');
    // Centres, not edges: the ring is drawn OUTSIDE the element's own border and
    // sized to the icon's extent, so the boxes differ in size by design — what
    // must match is where they are centred.
    expect(Math.abs(centreOf(outlineBox).x - drawn.x)).toBeLessThan(10);
    expect(Math.abs(centreOf(outlineBox).y - drawn.y)).toBeLessThan(10);

    // CLICK there selects it, and the selection chrome is centred there too.
    await page.mouse.click(drawn.x, drawn.y);
    const chrome = byAxoviewId(page, 'canvas-selection-chrome').first();
    await chrome.waitFor({ state: 'visible', timeout: 3_000 });
    const chromeBox = await chrome.boundingBox();
    if (!chromeBox) throw new Error('selection chrome has no bounding box');
    expect(Math.abs(centreOf(chromeBox).x - drawn.x)).toBeLessThan(10);
    expect(Math.abs(centreOf(chromeBox).y - drawn.y)).toBeLessThan(10);

    // RIGHT-CLICK on the drawn body → the ITEM menu. This is bug #6's home: the
    // target used to be resolved from the rounded mouse tile, so an off-grid
    // item got the CANVAS menu.
    await page.mouse.click(drawn.x, drawn.y, { button: 'right' });
    await expect
      .poll(() => getContextMenu(page), { timeout: 3_000 })
      .toEqual({ variant: 'item', targetType: 'ITEM' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // …and it is the per-item off-grid menu. That entry is deliberately hidden
    // while GLOBAL snap is off (ADR 0023's 2026-06-21 UX addendum: a per-item
    // snap override is meaningless when the whole canvas is off-grid), so turn
    // the global toggle on first. Existing off-grid items are NOT re-snapped by
    // that (frozen by snap-grid.spec's F3 case), so the node is still drawn
    // where it was — right-clicking there must still find it.
    await setSnapToGrid(page, true);
    await page.waitForTimeout(150);
    await page.mouse.click(drawn.x, drawn.y, { button: 'right' });
    await expect(
      page.getByRole('menuitem', { name: /snap (from|to) grid/i }).first()
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await setSnapToGrid(page, false);

    // RIGHT-CLICK on bare grid beside it → the CANVAS menu. This pairing is the
    // assertion: same node, same neighbourhood, resolved by where it is DRAWN.
    await page.mouse.click(bare.x + 220, bare.y + 140, { button: 'right' });
    await expect
      .poll(() => getContextMenu(page), { timeout: 3_000 })
      .toEqual({ variant: 'canvas', targetType: null });
  });

  test("a node's name chip is grabbable — and right-clickable — where it is drawn", async ({
    page,
    app
  }) => {
    void app;
    const { id } = await placeAndSelect(page);
    const { drawn, bare } = await nudge(page, id);
    // R4/RND-13/15: the name chip's hit proxy mounts for every node the bulk
    // draws — which, since selection stopped promoting, includes the selected
    // one. Clearing the selection is kept because the rest of the case is about
    // the RESTING chip.
    await clearSelection(page, bare);

    const chip = page.locator(`[data-label-hit-id="${id}"]`);
    await chip.waitFor({ state: 'visible', timeout: 5_000 });
    const chipBox = await chip.boundingBox();
    if (!chipBox) throw new Error('label hit proxy has no bounding box');

    // The chip is centred on the node's DRAWN x — it used to sit over the grid
    // cell, which both mis-grabbed the label and covered the node's body.
    expect(Math.abs(centreOf(chipBox).x - drawn.x)).toBeLessThan(10);

    // …and a right-click on it opens the NODE's menu. It used to fall through to
    // the canvas: the tile the chip floats over is empty.
    await page.mouse.click(centreOf(chipBox).x, centreOf(chipBox).y, {
      button: 'right'
    });
    await expect
      .poll(() => getContextMenu(page), { timeout: 3_000 })
      .toEqual({ variant: 'item', targetType: 'ITEM' });
  });
});
