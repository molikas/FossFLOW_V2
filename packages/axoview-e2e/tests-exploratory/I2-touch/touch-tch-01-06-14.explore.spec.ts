/**
 * I2 probe — TCH-01: a second finger during an item drag commits the node at
 * ITS position. FALSIFIED; kept as characterization of the forwarded-mouseup
 * design (the mouseup only ENDS the gesture — `DragItems.mouseup` commits the
 * map the last mousemove filled).
 *
 * PROMOTED OUT — wave 3 fixed TCH-02/03 (the menu phase closes its press; the
 * lift suppression stops swallowing the tap-away), TCH-06 (ruling: a cancel
 * breaks the double-tap streak) and TCH-14 (a cancel demotes pinch → pan).
 * Their legs moved to `tests/touch-gesture-interrupts.spec.ts`.
 *
 * **Rig correction carried out of this file.** TCH-14's probe called
 * `Fingers.cancel` with a second finger still down. CDP rejects that —
 * "TouchCancel must not have any touch points" — so the call THREW, and because
 * the probe was a `test.fail()` the protocol error read as a confirmed bug.
 * The defect was real (by code reading: `onTouchPointerUp` demoted pinch → pan
 * and `onTouchPointerCancel` did not), but that run was not evidence of it.
 * The promoted suite drives a real per-finger cancel — see `Fingers.cancel` in
 * the shared TouchPOM.
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

