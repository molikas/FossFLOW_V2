/**
 * I1 probes — the interleaving matrix cell nobody drives: {live node drag} ×
 * {keyboard / wheel interrupt}. All four use REAL `page.mouse` (APPROACH §3
 * tier T3): DRAG_ITEMS only engages through genuine hit-testing plus the
 * `exceedsTapSlop` screen-delta gate, and pointer capture is what keeps
 * `isRendererInteraction` true mid-gesture — synthetic dispatch on the
 * interactions box would fake both.
 *
 *  PTR-06  wheel-zoom mid-drag desynchronises the recorded down point
 *  PTR-09  Delete mid-drag deletes the item the pending mouseup will commit
 *  PTR-15  Escape mid-drag does not abort the move
 *
 * All three FALSIFIED (PTR-15's behaviour is documented, not defective) — the
 * probes stay as characterization of the interleaving matrix.
 *
 * PROMOTED OUT — wave 3 fixed PTR-10: a history keystroke during a live drag
 * now aborts the gesture, so the pending mouseup commits nothing and the redo
 * entry survives. Its leg moved to `tests/canvas-keyboard-scope.spec.ts`.
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM, CanvasPoint } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import {
  getModelItemCount,
  getViewItemCount,
  getUiMode,
  getZoom,
  getModelHistoryLength
} from '../../helpers/store';

type Page = import('@playwright/test').Page;

/** Clear of the left docks and the right properties panel. */
const NODE_AT: CanvasPoint = { x: 700, y: 320 };

const modeType = async (page: Page) => (await getUiMode(page))?.type ?? null;

const viewItems = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return ((view?.items ?? []) as any[]).map((i) => ({
      id: i.id,
      tile: { ...i.tile }
    }));
  });

/** uiState's own idea of the tile under the pointer right now. */
const pointerTile = (page: Page) =>
  page.evaluate(() => {
    const t = (window as any).__axoview__.ui.getState().mouse.position.tile;
    return { x: t.x, y: t.y };
  });

/** Absolute page coordinates of a tile (interactions-box origin + POM math). */
async function tileToPage(
  page: Page,
  canvas: CanvasPOM,
  tile: { x: number; y: number }
): Promise<CanvasPoint> {
  const rel = await canvas.tileToScreen(tile);
  const box = await canvas.interactionsLayer().boundingBox();
  if (!box) throw new Error('interactions box has no bounding box');
  return { x: box.x + rel.x, y: box.y + rel.y };
}

/**
 * Places one node and returns its id plus the absolute page point of its tile.
 * Leaves the canvas in CURSOR mode with nothing selected.
 */
async function setupNode(page: Page, canvas: CanvasPOM) {
  await placeIconViaMouse(page, NODE_AT);
  await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
  await page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    ui.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
    ui.actions.setItemControls(null);
  });
  // Close the Elements dock so it can't swallow real mouse events over the node.
  const dockIcon = page.locator('[data-axoview-id="canvas-icon-grid-item"]').first();
  if (await dockIcon.isVisible().catch(() => false)) {
    await page.locator('[data-axoview-id="dock-elements-toggle"]').click();
    await dockIcon.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
  }
  const [item] = await viewItems(page);
  const point = await tileToPage(page, canvas, item.tile);
  return { id: item.id, tile: item.tile, point };
}

/**
 * Presses on the node and drags `dx/dy` page pixels, stopping while the button
 * is still DOWN and DRAG_ITEMS is live. Fails loudly if the drag never engaged,
 * so a rig failure can never masquerade as evidence.
 */
async function beginRealDrag(
  page: Page,
  from: CanvasPoint,
  dx: number,
  dy: number
) {
  await page.mouse.move(from.x, from.y);
  await page.waitForTimeout(80);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 6 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
  await expect
    .poll(() => modeType(page), { timeout: 3_000 })
    .toBe('DRAG_ITEMS');
}

// ---------------------------------------------------------------------------
// PTR-06 — wheel-zoom mid-drag
// ---------------------------------------------------------------------------
test.describe('PTR-06 — wheel zoom during a live node drag', () => {
  /**
   * Invariant under test: grab a node ON its own tile and release — it lands on
   * the tile the pointer is over. Established first WITHOUT a zoom (positive
   * control), then re-run with a mid-drag wheel.
   */
  test('positive control: an uninterrupted drag lands the node under the pointer', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const node = await setupNode(page, canvas);

    await beginRealDrag(page, node.point, 180, 60);
    const expectedTile = await pointerTile(page);
    await page.mouse.up();
    await page.waitForTimeout(300);

    const [after] = await viewItems(page);
    expect(after.tile).toEqual(expectedTile);
    await expectStoreInvariants(page, 'after uninterrupted drag');
  });

  test('zoom-to-cursor (default): the node still lands under the pointer', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const node = await setupNode(page, canvas);
    const zoomBefore = await getZoom(page);

    await beginRealDrag(page, node.point, 120, 40);
    // Wheel while the button is down — nothing gates onScroll on an in-flight
    // gesture.
    await page.mouse.wheel(0, -120);
    await expect
      .poll(() => getZoom(page), { timeout: 2_000 })
      .not.toBe(zoomBefore);
    await page.mouse.move(node.point.x + 200, node.point.y + 70, { steps: 6 });
    await page.waitForTimeout(80);

    const expectedTile = await pointerTile(page);
    await page.mouse.up();
    await page.waitForTimeout(300);

    const [after] = await viewItems(page);
    expect(after.tile).toEqual(expectedTile);
    await expectStoreInvariants(page, 'after zoom-to-cursor mid-drag');
  });

  test('zoomToCursor OFF (the un-anchored zoom path): still lands under the pointer', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    // zoomToCursor is a user setting (config/zoomSettings.ts, default true).
    // With it off, `onScroll` writes zoom WITHOUT the compensating scroll — the
    // world point under the cursor moves, which is where the seam predicted the
    // recorded down-point would desynchronise.
    await page.evaluate(() => {
      const ui = (window as any).__axoview__.ui.getState();
      ui.actions.setZoomSettings({ zoomToCursor: false });
    });
    expect(
      await page.evaluate(
        () =>
          (window as any).__axoview__.ui.getState().zoomSettings.zoomToCursor
      )
    ).toBe(false);

    const node = await setupNode(page, canvas);

    await beginRealDrag(page, node.point, 120, 40);
    const zoomBefore = await getZoom(page);
    await page.mouse.wheel(0, -120);
    await expect
      .poll(() => getZoom(page), { timeout: 2_000 })
      .not.toBe(zoomBefore);
    await page.mouse.move(node.point.x + 200, node.point.y + 70, { steps: 6 });
    await page.waitForTimeout(80);

    const expectedTile = await pointerTile(page);
    await page.mouse.up();
    await page.waitForTimeout(300);

    // FALSIFIED: the committed tile is derived in TILE space
    // (`initialTiles + (position.tile − mousedown.tile)`), and both tiles are
    // re-derived from screen coords against the CURRENT zoom, so a mid-drag
    // zoom cancels out of the delta. Only the CSS preview (`preciseDelta`,
    // screen-delta ÷ zoom) is zoom-sensitive, and it is discarded at commit.
    const [after] = await viewItems(page);
    expect(after.tile).toEqual(expectedTile);
    await expectStoreInvariants(page, 'after un-anchored zoom mid-drag');
  });
});

// ---------------------------------------------------------------------------
// PTR-09 — Delete mid-drag
// ---------------------------------------------------------------------------
test.describe('PTR-09 — Delete pressed during a live node drag', () => {
  /**
   * The realistic sequence: the user CLICKS the node (which is what pins
   * `itemControls` — `Cursor.mousedown` only sets it to null on a miss, the
   * mouseup does the selecting), then presses and drags it, then hits Delete
   * without releasing. The single-item Delete branch now has a live target.
   */
  const selectThenDrag = async (page: Page, canvas: CanvasPOM) => {
    const node = await setupNode(page, canvas);
    await page.mouse.move(node.point.x, node.point.y);
    await page.mouse.down();
    await page.mouse.up();
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as any).__axoview__.ui.getState().itemControls?.id ?? null
          ),
        { timeout: 3_000 }
      )
      .toBe(node.id);
    await beginRealDrag(page, node.point, 160, 50);
    return node;
  };

  /**
   * FALSIFIED: the pending `mouseup` does NOT commit the dead id — `DragItems`
   * writes through `batchUpdateViewItemTiles`, which skips ids that are no
   * longer in the view, so nothing throws, nothing resurrects, and mode returns
   * to CURSOR. The ONLY thing the interleave breaks is the already-filed
   * stale-selection invariant (HIST-13 / INV-2): the single-item Delete branch
   * clears `itemControls` but never `selectedIds`.
   */
  test('the interrupted drag commits cleanly — only the known stale selection is left', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const node = await selectThenDrag(page, canvas);

    await page.keyboard.press('Delete');
    await expect.poll(() => getViewItemCount(page), { timeout: 3_000 }).toBe(0);

    await page.mouse.up();
    await page.waitForTimeout(400);

    expect(await getViewItemCount(page)).toBe(0);
    expect(await modeType(page)).toBe('CURSOR');
    expect(
      await page.evaluate(
        () =>
          (window as any).__axoview__.ui.getState().itemControls?.id ?? null
      )
    ).toBeNull();

    // HIST-13 re-confirmed through a new entry point: the dead id survives in
    // `selectedIds`, which is why `expectStoreInvariants` (INV-2) would fail
    // here. Filed already — asserted, not re-filed.
    const selected = await page.evaluate(
      () => (window as any).__axoview__.ui.getState().selectedIds ?? []
    );
    expect(selected).toEqual([{ type: 'ITEM', id: node.id }]);
  });

  test('characterization: pins what mid-drag Delete leaves behind', async ({
    app,
    consoleOracle
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const node = await selectThenDrag(page, canvas);
    const startTile = node.tile;

    await page.keyboard.press('Delete');
    await page.waitForTimeout(250);
    const midCount = await getViewItemCount(page);

    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await viewItems(page);
    const errors = consoleOracle.errors();
    consoleOracle.allow(
      /.*/,
      'PTR-09 deliberately drives the app into the mid-drag delete state; the console output IS the observation and is reported below.'
    );
    // eslint-disable-next-line no-console
    console.log(
      `PTR-09 observed — mid-drag count: ${midCount}; after mouseup: ${JSON.stringify(after)}; start tile: ${JSON.stringify(startTile)}; errors: ${JSON.stringify(errors)}`
    );

    // Positively assert the observed end state so this can never be read as a
    // setup crash: the delete really removed the item mid-gesture.
    expect(midCount).toBe(0);
    expect(await getUiMode(page).then((m) => m?.type)).toBe('CURSOR');
  });
});

// ---------------------------------------------------------------------------
// PTR-15 — Escape mid-drag
// ---------------------------------------------------------------------------
test.describe('PTR-15 — Escape pressed during a live node drag', () => {
  /**
   * FALSIFIED as a defect: `canvas-interaction.md` §8 states the behaviour
   * explicitly — "`DRAG_ITEMS` does not abort on Escape — the mode persists and
   * the next mouseup commits the move", and "there is no `rollbackDragTransaction`".
   * This probe pins the documented contract instead, so a future "Esc cancels
   * the drag" change is a deliberate one and not a silent drift.
   */
  test('contract: Escape is consumed, the drag survives it and commits (documented)', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const node = await setupNode(page, canvas);
    const startTile = (await viewItems(page))[0].tile;

    await beginRealDrag(page, node.point, 200, 70);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Escape did not leave DRAG_ITEMS — the mode owns its own abort, and
    // handleEscapeKey deliberately excludes it.
    expect(await modeType(page)).toBe('DRAG_ITEMS');

    const expectedTile = await pointerTile(page);
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = (await viewItems(page))[0];
    expect(after.tile).not.toEqual(startTile);
    expect(after.tile).toEqual(expectedTile);
    await expectStoreInvariants(page, 'after escape mid-drag');
  });
});
