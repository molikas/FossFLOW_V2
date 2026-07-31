/**
 * I2 probes — off-grid hit-testing and two-finger pan.
 *
 *  TCH-07  the touch hit-test omits the ADR-0023 `point` argument
 *  TCH-08  two fingers moving in parallel are handled as a pinch
 *
 * Both FALSIFIED; kept as characterization.
 *
 * PROMOTED OUT — wave 3 fixed TCH-04 (a hovering pen now sets `hoveredItem`
 * like the mouse) and TCH-05 (the palette drop hit-tests the release point
 * instead of testing the renderer's bounding rect, which every overlaying panel
 * sits inside). Their legs moved to `tests/touch-gesture-interrupts.spec.ts`.
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM, CanvasPoint } from '../../pom/CanvasPOM';
import { TouchPOM } from '../../pom/TouchPOM';

import { placeIconViaMouse, clearCanvasForTouch } from '../../helpers/place';
import {
  getOffGridItems,
  setSnapToGrid,
  drawnClientPoint,
  realDrag
} from '../../helpers/offGrid';
import { byAxoviewId } from '../../helpers/selectors';
import { getModelItemCount, getZoom, getUiMode } from '../../helpers/store';

type Page = import('@playwright/test').Page;

const modeType = async (page: Page) => (await getUiMode(page))?.type ?? null;

const hoveredItemId = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().hoveredItem?.id ?? null
  );

const scrollPos = (page: Page) =>
  page.evaluate(() => ({
    ...(window as any).__axoview__.ui.getState().scroll.position
  }));

const itemTiles = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return ((view?.items ?? []) as any[]).map((i) => ({
      id: i.id as string,
      tile: { x: i.tile.x as number, y: i.tile.y as number }
    }));
  });

/** Moves a pointer of the given device class over a point, without pressing. */
async function hoverAs(
  page: Page,
  pointerType: 'mouse' | 'pen',
  p: CanvasPoint
) {
  const client = await page.context().newCDPSession(page);
  for (const pt of [
    { x: p.x - 40, y: p.y - 25 },
    { x: p.x - 12, y: p.y - 6 },
    p
  ]) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: pt.x,
      y: pt.y,
      button: 'none',
      buttons: 0,
      pointerType
    });
    await page.waitForTimeout(60);
  }
  await client.detach();
  await page.waitForTimeout(150);
}

// ---------------------------------------------------------------------------
// TCH-07 — off-grid hit-testing under a finger
// ---------------------------------------------------------------------------
test.describe('TCH-07 — off-grid node under a finger vs under the mouse', () => {
  /**
   * Places a node, turns snapping off, and nudges it with a real mouse drag so
   * its DRAWN body sits away from its integer tile — the ADR 0023 shape.
   */
  async function offGridNode(page: Page) {
    await placeIconViaMouse(page, { x: 640, y: 300 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
    await setSnapToGrid(page, false);
    const [before] = await getOffGridItems(page);
    const from = await drawnClientPoint(page, before);
    await realDrag(page, from, { x: from.x + 46, y: from.y + 22 });
    await clearCanvasForTouch(page);
    const [item] = await getOffGridItems(page);
    return item;
  }

  test('control: a MOUSE press on the drawn body grabs the node', async ({
    app
  }) => {
    const { page } = app;
    const node = await offGridNode(page);
    expect(node.offset).toBeTruthy();

    const drawn = await drawnClientPoint(page, node);
    await page.mouse.move(drawn.x, drawn.y);
    await page.mouse.down();
    await page.mouse.move(drawn.x + 40, drawn.y + 20, { steps: 6 });
    const mode = await modeType(page);
    await page.mouse.up();
    expect(mode).toBe('DRAG_ITEMS');
  });

  test('a FINGER on the same drawn body must grab it too', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const node = await offGridNode(page);
    expect(node.offset).toBeTruthy();

    const drawn = await drawnClientPoint(page, node);
    const box = await canvas.interactionsLayer().boundingBox();
    const rel = { x: drawn.x - box!.x, y: drawn.y - box!.y };

    const before = await getOffGridItems(page);
    const scrollBefore = await scrollPos(page);
    const touch = new TouchPOM(page, canvas);
    await touch.dragOneFinger(rel, { x: rel.x + 120, y: rel.y + 50 }, 8);
    await page.waitForTimeout(300);

    const after = await getOffGridItems(page);
    const scrollAfter = await scrollPos(page);
    // eslint-disable-next-line no-console
    console.log(
      `TCH-07 observed — offset ${JSON.stringify(node.offset)}; tiles ${JSON.stringify(before.map((i) => i.tile))} -> ${JSON.stringify(after.map((i) => i.tile))}; scroll ${JSON.stringify(scrollBefore)} -> ${JSON.stringify(scrollAfter)}`
    );

    // The finger must move the NODE (like the mouse), not pan the canvas.
    expect(JSON.stringify(scrollAfter)).toBe(JSON.stringify(scrollBefore));
  });
});

// ---------------------------------------------------------------------------
// TCH-08 — two fingers moving in parallel
// ---------------------------------------------------------------------------
test.describe('TCH-08 — two-finger pan (no distance change)', () => {
  test('a parallel two-finger drag pans without drifting the zoom', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await placeIconViaMouse(page, { x: 640, y: 300 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
    await clearCanvasForTouch(page);

    const box = await canvas.interactionsLayer().boundingBox();
    const c = { x: box!.x + 600, y: box!.y + 320 };
    const client = await page.context().newCDPSession(page);
    const pts = (dx: number, dy: number) => [
      { x: c.x - 60 + dx, y: c.y + dy, id: 0 },
      { x: c.x + 60 + dx, y: c.y + dy, id: 1 }
    ];

    const zoomBefore = await getZoom(page);
    const scrollBefore = await scrollPos(page);

    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: pts(0, 0)
    });
    for (let i = 1; i <= 10; i += 1) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: pts(-i * 18, i * 9)
      });
      await page.waitForTimeout(16);
    }
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await client.detach();
    await page.waitForTimeout(250);

    const zoomAfter = await getZoom(page);
    const scrollAfter = await scrollPos(page);
    // eslint-disable-next-line no-console
    console.log(
      `TCH-08 observed — zoom ${zoomBefore} -> ${zoomAfter}; scroll ${JSON.stringify(scrollBefore)} -> ${JSON.stringify(scrollAfter)}`
    );

    // The fingers never changed distance, so this is a pan, not a zoom.
    expect(zoomAfter).toBe(zoomBefore);
    expect(JSON.stringify(scrollAfter)).not.toBe(JSON.stringify(scrollBefore));
  });
});
