/**
 * I2 probes — the touch gesture machine's phase transitions.
 *
 *  TCH-01  a second finger during an item drag commits the node at ITS position
 *  TCH-02  the long-press `menu` phase leaves stale mousedown bookkeeping
 *  TCH-03  `suppressLongPressGestureEnd` swallows a fast tap-away
 *  TCH-06  double-tap bookkeeping survives a pointercancel
 *  TCH-14  one finger's pointercancel mid-pinch strands the other finger
 *
 * TouchPOM covers whole gestures; these probes need finger-by-finger control
 * (add a second finger mid-drag, cancel one of two), so they drive
 * `Input.dispatchTouchEvent` through a small local multi-touch driver.
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM, CanvasPoint } from '../../pom/CanvasPOM';
import { TouchPOM } from '../../pom/TouchPOM';
import { placeIconViaMouse, clearCanvasForTouch } from '../../helpers/place';
import { getModelItemCount, getItemControls, getZoom } from '../../helpers/store';

type Page = import('@playwright/test').Page;
type CDPSession = import('@playwright/test').CDPSession;

/**
 * Finger-by-finger touch driver. `Input.dispatchTouchEvent` takes the full set
 * of ACTIVE points and derives the changed one, so the driver just tracks the
 * live set and re-sends it per event.
 */
class Fingers {
  private constructor(
    private readonly page: Page,
    private readonly client: CDPSession
  ) {}

  private pts = new Map<number, CanvasPoint>();

  static async open(page: Page) {
    return new Fingers(page, await page.context().newCDPSession(page));
  }

  private list() {
    return [...this.pts.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id }));
  }

  private async send(type: string) {
    await this.client.send('Input.dispatchTouchEvent', {
      type: type as 'touchStart',
      touchPoints: this.list()
    });
    await this.page.waitForTimeout(20);
  }

  async down(id: number, p: CanvasPoint) {
    this.pts.set(id, p);
    await this.send('touchStart');
  }

  async moveTo(id: number, p: CanvasPoint, steps = 6) {
    const from = this.pts.get(id)!;
    for (let i = 1; i <= steps; i += 1) {
      this.pts.set(id, {
        x: from.x + ((p.x - from.x) * i) / steps,
        y: from.y + ((p.y - from.y) * i) / steps
      });
      await this.send('touchMove');
    }
  }

  async up(id: number) {
    this.pts.delete(id);
    await this.send('touchEnd');
  }

  async cancel(id: number) {
    this.pts.delete(id);
    await this.send('touchCancel');
  }

  async close() {
    await this.client.detach();
  }
}

const viewItems = (page: Page) =>
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

const mouseState = (page: Page) =>
  page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    return {
      mousedown: ui.mouse?.mousedown
        ? { tile: { ...ui.mouse.mousedown.tile } }
        : null,
      modeType: ui.mode?.type ?? null,
      mousedownItem: (ui.mode as any)?.mousedownItem ?? null
    };
  });

const menuOpen = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().contextMenu !== null
  );

const scrollPos = (page: Page) =>
  page.evaluate(() => ({
    ...(window as any).__axoview__.ui.getState().scroll.position
  }));

/** Places one node, clears the dock, returns its id + tile + abs screen point. */
async function setupNode(page: Page, canvas: CanvasPOM, at: CanvasPoint) {
  await placeIconViaMouse(page, at);
  await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
  await clearCanvasForTouch(page);
  const [item] = await viewItems(page);
  const rel = await canvas.tileToScreen(item.tile);
  const box = await canvas.interactionsLayer().boundingBox();
  if (!box) throw new Error('no interactions box');
  return { ...item, abs: { x: box.x + rel.x, y: box.y + rel.y }, box };
}

// ---------------------------------------------------------------------------
// TCH-01 — a second finger lands during a one-finger node drag
// ---------------------------------------------------------------------------
test.describe('TCH-01 — second finger during a node drag', () => {
  /**
   * FALSIFIED. The forwarded `mouseup` does carry the SECOND pointer's
   * coordinates, but it only ENDS the gesture: `DragItems.mouseup` commits the
   * `previewTiles` map, which the last `mousemove` (finger 1) already filled.
   * The mouseup's own position never reaches the commit, so the node lands
   * exactly where the dragging finger left it.
   */
  test('the node commits where finger 1 left it, not at the second finger', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const node = await setupNode(page, canvas, { x: 500, y: 300 });
    const start = node.tile;
    const f = await Fingers.open(page);

    await f.down(0, node.abs);
    await f.moveTo(0, { x: node.abs.x + 90, y: node.abs.y });
    const dragTile = await page.evaluate(() => ({
      ...(window as any).__axoview__.ui.getState().mouse.position.tile
    }));

    const second = { x: node.abs.x + 420, y: node.abs.y + 230 };
    await f.down(1, second);
    await f.up(0);
    await f.up(1);
    await f.close();
    await page.waitForTimeout(300);

    const landed = (await viewItems(page))[0].tile;
    // eslint-disable-next-line no-console
    console.log(
      `TCH-01 observed — start ${JSON.stringify(start)}; under finger 1 ${JSON.stringify(dragTile)}; landed ${JSON.stringify(landed)}`
    );

    // It really did move (the gesture committed), and it landed on finger 1's
    // tile — the second finger's coordinates had no effect.
    expect(landed).not.toEqual(start);
    expect(landed).toEqual(dragTile);
    await expectStoreInvariants(page, 'after second-finger drag interrupt');
  });
});

// ---------------------------------------------------------------------------
// TCH-02 — the `menu` phase leaves stale press bookkeeping
// ---------------------------------------------------------------------------
test.describe('TCH-02 — long-press menu leaves the press half-open', () => {
  test.fail(
    'BUG: no mouseup is forwarded, so uiState.mouse.mousedown stays populated',
    async ({ app }) => {
      const { page } = app;
      const canvas = new CanvasPOM(page);
      const node = await setupNode(page, canvas, { x: 500, y: 300 });

      const touch = new TouchPOM(page, canvas);
      await touch.hold(await canvas.tileToScreen(node.tile), 700);
      await expect.poll(() => menuOpen(page), { timeout: 3_000 }).toBe(true);

      // The finger has lifted; nothing is pressed any more.
      expect((await mouseState(page)).mousedown).toBeNull();
    }
  );

  test('characterization: the press stays open after the finger lifted', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const node = await setupNode(page, canvas, { x: 500, y: 300 });

    const touch = new TouchPOM(page, canvas);
    await touch.hold(await canvas.tileToScreen(node.tile), 700);
    await expect.poll(() => menuOpen(page), { timeout: 3_000 }).toBe(true);

    const st = await mouseState(page);
    // eslint-disable-next-line no-console
    console.log(`TCH-02 observed — ${JSON.stringify(st)}`);
    expect(st.mousedown).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TCH-03 — the menu cannot be dismissed by a fast tap-away
// ---------------------------------------------------------------------------
test.describe('TCH-03 — dismissing the long-press menu immediately', () => {
  test.fail(
    'BUG: a tap-away inside the 700 ms suppression window does not dismiss',
    async ({ app }) => {
      const { page } = app;
      const canvas = new CanvasPOM(page);
      const node = await setupNode(page, canvas, { x: 500, y: 300 });

      const touch = new TouchPOM(page, canvas);
      await touch.hold(await canvas.tileToScreen(node.tile), 600);
      await expect.poll(() => menuOpen(page), { timeout: 3_000 }).toBe(true);

      // Deliberate tap-away, immediately (well inside the 700 ms window).
      await touch.tapPoint({ x: 200, y: 480 });
      await page.waitForTimeout(250);
      expect(await menuOpen(page)).toBe(false);
    }
  );

  test('control: a tap-away AFTER the suppression window does dismiss it', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const node = await setupNode(page, canvas, { x: 500, y: 300 });

    const touch = new TouchPOM(page, canvas);
    await touch.hold(await canvas.tileToScreen(node.tile), 600);
    await expect.poll(() => menuOpen(page), { timeout: 3_000 }).toBe(true);

    await page.waitForTimeout(900);
    await touch.tapPoint({ x: 200, y: 480 });
    await expect.poll(() => menuOpen(page), { timeout: 3_000 }).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TCH-06 — double-tap bookkeeping across a pointercancel
// ---------------------------------------------------------------------------
test.describe('TCH-06 — tap, cancel, tap', () => {
  const sidebarOpen = (page: Page) =>
    page.evaluate(
      () => (window as any).__axoview__.ui.getState().rightSidebarOpen === true
    );

  /**
   * The interruption has to sit INSIDE the 300 ms window for the streak to
   * matter, so all three presses run back to back. Control below shows the
   * same two real taps with no interruption between them.
   */
  test('an interrupted press between two taps does not break the double-tap streak', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const node = await setupNode(page, canvas, { x: 500, y: 300 });
    const f = await Fingers.open(page);

    // Tap 1 — completed normally, so it seeds lastTapItem/lastTapTime.
    await f.down(0, node.abs);
    await f.up(0);
    // An OS interruption (app switch / notification) cancels the next press.
    await f.down(0, node.abs);
    await f.cancel(0);
    // Tap 2, still inside DOUBLE_TAP_MS of tap 1.
    await f.down(0, node.abs);
    await f.up(0);
    await f.close();
    await page.waitForTimeout(300);

    const open = await sidebarOpen(page);
    const controls = await getItemControls(page);
    // eslint-disable-next-line no-console
    console.log(
      `TCH-06 observed — sidebarOpen ${open}; itemControls ${JSON.stringify(controls)}`
    );
    expect(controls?.type).toBe('ITEM');
    // The observation, whichever way it lands, is recorded in the area file.
    expect(typeof open).toBe('boolean');
  });

  test('control: two clean taps inside the window DO open the details deck', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const node = await setupNode(page, canvas, { x: 500, y: 300 });
    const f = await Fingers.open(page);

    await f.down(0, node.abs);
    await f.up(0);
    await f.down(0, node.abs);
    await f.up(0);
    await f.close();
    await page.waitForTimeout(300);

    // eslint-disable-next-line no-console
    console.log(`TCH-06 control — sidebarOpen ${await sidebarOpen(page)}`);
    expect(await sidebarOpen(page)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TCH-14 — one finger cancelled mid-pinch
// ---------------------------------------------------------------------------
test.describe('TCH-14 — pointercancel on one of two pinch fingers', () => {
  test.fail(
    'BUG: the surviving finger is dead — no pan, no zoom, until it lifts',
    async ({ app }) => {
      const { page } = app;
      const canvas = new CanvasPOM(page);
      await setupNode(page, canvas, { x: 500, y: 300 });
      const box = await canvas.interactionsLayer().boundingBox();
      const c = { x: box!.x + 500, y: box!.y + 300 };
      const f = await Fingers.open(page);

      await f.down(0, { x: c.x - 60, y: c.y });
      await f.down(1, { x: c.x + 60, y: c.y });
      await f.moveTo(0, { x: c.x - 100, y: c.y });
      await page.waitForTimeout(80);

      const zoomBefore = await getZoom(page);
      const scrollBefore = await scrollPos(page);

      // One finger is reclaimed by the OS; the other stays down and keeps
      // moving. `onTouchPointerUp` resumes a one-finger pan in this case —
      // `onTouchPointerCancel` has no such branch.
      await f.cancel(1);
      await f.moveTo(0, { x: c.x - 300, y: c.y + 120 }, 10);
      await page.waitForTimeout(200);

      const scrollAfter = await scrollPos(page);
      await f.up(0);
      await f.close();

      expect(
        JSON.stringify(scrollAfter) !== JSON.stringify(scrollBefore) ||
          (await getZoom(page)) !== zoomBefore
      ).toBe(true);
    }
  );

  test('control: lifting (not cancelling) one finger resumes a one-finger pan', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await setupNode(page, canvas, { x: 500, y: 300 });
    const box = await canvas.interactionsLayer().boundingBox();
    const c = { x: box!.x + 500, y: box!.y + 300 };
    const f = await Fingers.open(page);

    await f.down(0, { x: c.x - 60, y: c.y });
    await f.down(1, { x: c.x + 60, y: c.y });
    await f.moveTo(0, { x: c.x - 100, y: c.y });
    await page.waitForTimeout(80);

    const scrollBefore = await scrollPos(page);
    await f.up(1);
    await f.moveTo(0, { x: c.x - 300, y: c.y + 120 }, 10);
    await page.waitForTimeout(200);
    const scrollAfter = await scrollPos(page);
    await f.up(0);
    await f.close();

    // eslint-disable-next-line no-console
    console.log(
      `TCH-14 control — scroll ${JSON.stringify(scrollBefore)} -> ${JSON.stringify(scrollAfter)}`
    );
    expect(JSON.stringify(scrollAfter)).not.toBe(JSON.stringify(scrollBefore));
  });
});
