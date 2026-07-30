/**
 * I2 probes — pen parity, palette drop scoping, off-grid hit-testing, two-finger pan.
 *
 *  TCH-04  pen hover produces none of the hover state a mouse produces
 *  TCH-05  the palette drop test ignores panels overlaying the renderer
 *  TCH-07  the touch hit-test omits the ADR-0023 `point` argument
 *  TCH-08  two fingers moving in parallel are handled as a pinch
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
// TCH-04 — pen hover parity
// ---------------------------------------------------------------------------
test.describe('TCH-04 — hovering with a pen', () => {
  async function nodePoint(page: Page, canvas: CanvasPOM) {
    await placeIconViaMouse(page, { x: 640, y: 300 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
    await clearCanvasForTouch(page);
    const [item] = await itemTiles(page);
    const rel = await canvas.tileToScreen(item.tile);
    const box = await canvas.interactionsLayer().boundingBox();
    return { id: item.id, abs: { x: box!.x + rel.x, y: box!.y + rel.y } };
  }

  test('control: a MOUSE hover sets hoveredItem', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const node = await nodePoint(page, canvas);

    await hoverAs(page, 'mouse', node.abs);
    expect(await hoveredItemId(page)).toBe(node.id);
  });

  test.fail('BUG: a PEN hover over the same node sets nothing', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const node = await nodePoint(page, canvas);

    await hoverAs(page, 'pen', node.abs);
    expect(await hoveredItemId(page)).toBe(node.id);
  });

  test('characterization: pen hover leaves hoveredItem null (and mouse then works)', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const node = await nodePoint(page, canvas);

    await hoverAs(page, 'pen', node.abs);
    const afterPen = await hoveredItemId(page);
    await hoverAs(page, 'mouse', node.abs);
    const afterMouse = await hoveredItemId(page);
    // eslint-disable-next-line no-console
    console.log(
      `TCH-04 observed — after pen: ${afterPen}; after mouse: ${afterMouse}`
    );
    expect(afterPen).toBeNull();
    expect(afterMouse).toBe(node.id);
  });
});

// ---------------------------------------------------------------------------
// TCH-05 — palette drop over an overlaying panel
// ---------------------------------------------------------------------------
test.describe('TCH-05 — releasing a palette drag over another panel', () => {
  /**
   * The hypothesis only bites if a panel actually OVERLAPS `rendererEl`'s
   * bounding rect, so the probe measures the geometry first and drops on the
   * overlap. If nothing overlaps, the containment test cannot be fooled and the
   * hypothesis is structurally falsified — which the assertion below records.
   */
  /**
   * The Elements panel must be open to start a palette drag, and it is the
   * realistic "changed my mind" release point. The left dock shows ONE panel at
   * a time, so it is also the only panel that can overlap the renderer during
   * such a drag.
   */
  async function dragIconBackOntoThePanel(page: Page, canvas: CanvasPOM) {
    const touch = new TouchPOM(page, canvas);
    const icon = byAxoviewId(page, 'canvas-icon-grid-item').first();
    if (!(await icon.isVisible().catch(() => false))) {
      await byAxoviewId(page, 'dock-elements-toggle').click();
      await icon.waitFor({ state: 'visible', timeout: 5_000 });
    }
    const iconBox = await icon.boundingBox();
    const rendererBox = await canvas.interactionsLayer().boundingBox();

    const overlapsRenderer =
      !!iconBox &&
      !!rendererBox &&
      iconBox.x < rendererBox.x + rendererBox.width &&
      iconBox.x + iconBox.width > rendererBox.x &&
      iconBox.y < rendererBox.y + rendererBox.height &&
      iconBox.y + iconBox.height > rendererBox.y;

    const start = {
      x: iconBox!.x + iconBox!.width / 2,
      y: iconBox!.y + iconBox!.height / 2
    };
    // Past tap-slop, released a few rows down — still inside the panel.
    await touch.dragAbsolute(start, { x: start.x + 30, y: start.y + 150 }, 10);
    await page.waitForTimeout(400);
    return { overlapsRenderer, rendererBox, iconBox };
  }

  test.fail(
    'BUG: a drop back onto the Elements panel places a node behind it',
    async ({ app }) => {
      const { page } = app;
      const canvas = new CanvasPOM(page);
      await dragIconBackOntoThePanel(page, canvas);
      expect(await itemTiles(page)).toHaveLength(0);
    }
  );

  test('characterization: the renderer rect spans the whole window, so the panel is "canvas"', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const geo = await dragIconBackOntoThePanel(page, canvas);

    const items = await itemTiles(page);
    // eslint-disable-next-line no-console
    console.log(
      `TCH-05 observed — renderer ${JSON.stringify(geo.rendererBox)}; elements icon ${JSON.stringify(geo.iconBox)}; overlaps ${geo.overlapsRenderer}; items ${JSON.stringify(items)}`
    );

    // The panel really is inside the renderer's bounding rect...
    expect(geo.overlapsRenderer).toBe(true);
    // ...so the `palette` drop's containment test accepts it, and a node lands
    // at a tile the user cannot see, off to the left behind the panel.
    expect(items).toHaveLength(1);
    expect(items[0].tile.x).toBeLessThan(0);
    await expectStoreInvariants(page, 'after palette drop on the panel');
  });
});

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
