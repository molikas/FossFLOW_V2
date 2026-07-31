/**
 * touch-gesture-interrupts.spec.ts — the touch machine's phase transitions, and
 * its parity with the mouse.
 *
 * Promoted from the 2026-07 exploratory lane when wave 3 fixed the I2 cluster
 * (`I2-touch/touch-tch-01-06-14`, `touch-tch-04-05-07-08`, `touch-tch-09-15`).
 * The area's carry-forward note named the theme: touch is a second
 * implementation of every interaction and it drifts. `onTouchPointerUp` demoted
 * pinch → pan and maintained the tap bookkeeping while `onTouchPointerCancel`
 * did neither (TCH-14, and the TCH-06 ruling); `onDoubleClick` had a TEXTBOX
 * branch and the double-TAP did not (TCH-12); the mouse path asked
 * `isRendererInteraction` and the palette drop asked rect containment (TCH-05).
 * Each pair now shares one implementation, and this spec is what keeps them
 * paired.
 *
 * The existing `touch-*.spec.ts` files cover the happy paths (drag, pinch,
 * long-press, palette drag onto bare canvas). Everything here is an INTERRUPTED
 * or off-nominal gesture, which is where all seven bugs lived.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM, CanvasPoint } from '../pom/CanvasPOM';
import { TouchPOM } from '../pom/TouchPOM';
import { byAxoviewId } from '../helpers/selectors';
import { placeIconViaMouse, clearCanvasForTouch } from '../helpers/place';
import { getModelItemCount, getZoom, getUiMode } from '../helpers/store';

type Page = import('@playwright/test').Page;

test.describe.configure({ timeout: 90_000 });

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    return bridge.model.getState().views.find((v: any) => v.id === viewId);
  });

const itemTiles = async (page: Page) =>
  ((await activeView(page))?.items ?? []).map((i: any) => ({
    id: i.id as string,
    tile: { x: i.tile.x as number, y: i.tile.y as number }
  }));

const modeType = async (page: Page) => (await getUiMode(page))?.type ?? null;

const contextMenu = (page: Page) =>
  page.evaluate(() => {
    const cm = (window as any).__axoview__.ui.getState().contextMenu;
    return cm
      ? { variant: cm.variant as string, targetType: cm.target?.type ?? null }
      : null;
  });

const menuOpen = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().contextMenu !== null
  );

/** The press bookkeeping a completed gesture must leave empty. */
const pressState = (page: Page) =>
  page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    return {
      mousedown: ui.mouse?.mousedown ? 'set' : null,
      mousedownItem: (ui.mode as any)?.mousedownItem ? 'set' : null
    };
  });

/**
 * Whether the Details deck actually opened. NOT `itemControls`, which a SINGLE
 * tap already sets — ADR 0006 mirrors a one-item selection into it, so it cannot
 * tell one tap from two. The deck is what the double-tap escalation adds.
 */
const detailsDeckOpen = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().rightSidebarOpen === true
  );

const editingTextBoxId = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().editingTextBoxId ?? null
  );

const scrollPos = (page: Page) =>
  page.evaluate(() => ({
    ...(window as any).__axoview__.ui.getState().scroll.position
  }));

/** Places one node, clears the dock, returns its id + tile. */
async function setupNode(page: Page, at: CanvasPoint) {
  await placeIconViaMouse(page, at);
  await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
  await clearCanvasForTouch(page);
  const [item] = await itemTiles(page);
  return item;
}

// ---------------------------------------------------------------------------
// TCH-02 / TCH-03 — the long-press menu's lift, and dismissing it
// ---------------------------------------------------------------------------
test.describe('the long-press context menu (TCH-02/03)', () => {
  test('the lift closes the press — no half-open mousedown is left behind', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);
    const node = await setupNode(page, { x: 500, y: 300 });

    await touch.hold(await canvas.tileToScreen(node.tile), 600);
    await expect.poll(() => menuOpen(page), { timeout: 3_000 }).toBe(true);

    // Nothing is touching the screen. Before the fix `mouse.mousedown` and
    // `mode.mousedownItem` both stayed populated, and `Cursor.entry` replays
    // `mousedown` whenever `mousedownItem` is set — so the stale press was live
    // input for the next mode transition.
    await expect.poll(() => pressState(page), { timeout: 3_000 }).toEqual({
      mousedown: null,
      mousedownItem: null
    });
  });

  test('an immediate tap-away dismisses it', async ({ page, app }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);
    const node = await setupNode(page, { x: 500, y: 300 });

    await touch.hold(await canvas.tileToScreen(node.tile), 600);
    await expect.poll(() => menuOpen(page), { timeout: 3_000 }).toBe(true);

    // Deliberate tap-away, immediately. The lift-suppression window used to run
    // for a fixed 700 ms and swallowed this tap along with the compat-mouse
    // sequence it was actually there for.
    await touch.tapPoint({ x: 200, y: 480 });
    await expect.poll(() => menuOpen(page), { timeout: 3_000 }).toBe(false);
  });

  test('control: a tap-away after a pause still dismisses it', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);
    const node = await setupNode(page, { x: 500, y: 300 });

    await touch.hold(await canvas.tileToScreen(node.tile), 600);
    await expect.poll(() => menuOpen(page), { timeout: 3_000 }).toBe(true);

    await page.waitForTimeout(900);
    await touch.tapPoint({ x: 200, y: 480 });
    await expect.poll(() => menuOpen(page), { timeout: 3_000 }).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TCH-05 — a palette drag released back onto the panel
// ---------------------------------------------------------------------------
test.describe('a touch palette drag released over the panel (TCH-05)', () => {
  test('drops nothing behind the panel', async ({ page, app }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);

    const icon = byAxoviewId(page, 'canvas-icon-grid-item').first();
    if (!(await icon.isVisible().catch(() => false))) {
      await byAxoviewId(page, 'dock-elements-toggle').click();
      await icon.waitFor({ state: 'visible', timeout: 5_000 });
    }
    const iconBox = await icon.boundingBox();
    const rendererBox = await canvas.interactionsLayer().boundingBox();

    // The bug only bites because the panel sits INSIDE the renderer's rect —
    // assert that geometry, or the case below proves nothing.
    expect(iconBox!.x).toBeGreaterThan(rendererBox!.x);
    expect(iconBox!.x).toBeLessThan(rendererBox!.x + rendererBox!.width);

    const start = {
      x: iconBox!.x + iconBox!.width / 2,
      y: iconBox!.y + iconBox!.height / 2
    };
    // Past tap-slop, released a few rows down — still inside the panel.
    await touch.dragAbsolute(start, { x: start.x + 30, y: start.y + 150 }, 10);
    await page.waitForTimeout(400);

    expect(await itemTiles(page)).toHaveLength(0);
  });

  test('control: the same drag released over bare canvas still places', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);

    const icon = byAxoviewId(page, 'canvas-icon-grid-item').first();
    if (!(await icon.isVisible().catch(() => false))) {
      await byAxoviewId(page, 'dock-elements-toggle').click();
      await icon.waitFor({ state: 'visible', timeout: 5_000 });
    }
    const iconBox = await icon.boundingBox();
    const rendererBox = await canvas.interactionsLayer().boundingBox();
    const start = {
      x: iconBox!.x + iconBox!.width / 2,
      y: iconBox!.y + iconBox!.height / 2
    };

    await touch.dragAbsolute(
      start,
      {
        x: rendererBox!.x + rendererBox!.width * 0.6,
        y: rendererBox!.y + rendererBox!.height * 0.5
      },
      10
    );
    await expect
      .poll(async () => (await itemTiles(page)).length, { timeout: 5_000 })
      .toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TCH-06 / TCH-14 — a cancelled pointer
// ---------------------------------------------------------------------------
test.describe('an OS-cancelled pointer (TCH-06/14)', () => {
  test('cancelling one pinch finger leaves the other panning', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);
    await setupNode(page, { x: 500, y: 300 });

    const f = await touch.fingers();
    const a = { x: 460, y: 340 };
    const b = { x: 620, y: 340 };
    await f.down(0, a);
    await f.down(1, b);
    await f.moveTo(0, { x: 420, y: 340 });
    await f.moveTo(1, { x: 660, y: 340 });
    const zoomAfterPinch = await getZoom(page);

    // The OS takes finger 1 away. `runTouchFrame` needs two pointers, so before
    // the fix the survivor was stuck in `pinch` and the canvas froze until it
    // lifted — the cancel handler had no pinch → pan demotion.
    await f.cancel(1);
    const scrollBefore = await scrollPos(page);
    await f.moveTo(0, { x: 420, y: 460 }, 8);
    await f.up(0);
    await f.close();
    await page.waitForTimeout(200);

    const scrollAfter = await scrollPos(page);
    expect(scrollAfter).not.toEqual(scrollBefore);
    // A pan, not a zoom: the surviving finger resumed one-finger panning.
    expect(await getZoom(page)).toBe(zoomAfterPinch);
  });

  test('a cancel between two taps breaks the double-tap streak', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);
    const node = await setupNode(page, { x: 500, y: 300 });
    const pt = await canvas.tileToScreen(node.tile);

    const f = await touch.fingers();
    // Tap 1 — a clean lift, which arms the streak.
    await f.down(0, pt);
    await f.up(0);
    // Press 2 — taken away by the OS. Ruled 2026-07-30: cancellation means the
    // user's intent was interrupted, so it must not stitch the surrounding taps
    // into one deliberate double-tap (Android GestureDetector / iOS
    // UITapGestureRecognizer both abort a multi-tap on cancel).
    await f.down(0, pt);
    await f.cancel(0);
    // Tap 3 — well inside the 300 ms double-tap window of tap 1.
    await f.down(0, pt);
    await f.up(0);
    await f.close();
    await page.waitForTimeout(300);

    // A single tap selects; only a double-tap mounts the Details deck.
    expect(await detailsDeckOpen(page)).toBe(false);
  });

  test('control: two clean taps DO open the details deck', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);
    const node = await setupNode(page, { x: 500, y: 300 });
    const pt = await canvas.tileToScreen(node.tile);

    const f = await touch.fingers();
    await f.down(0, pt);
    await f.up(0);
    await f.down(0, pt);
    await f.up(0);
    await f.close();

    await expect
      .poll(() => detailsDeckOpen(page), { timeout: 3_000 })
      .toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TCH-09 — long-press a floating Label
// ---------------------------------------------------------------------------
test.describe('long-press on a floating Label (TCH-09)', () => {
  test('opens the Label’s own item menu', async ({ page, app }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);

    await canvas.placeLabelAt({ x: 620, y: 300 });
    await expect
      .poll(async () => ((await activeView(page))?.labels ?? []).length, {
        timeout: 5_000
      })
      .toBe(1);
    await clearCanvasForTouch(page);
    await page.keyboard.press('Escape');

    const tile = ((await activeView(page)).labels[0] as any).tile;
    await touch.hold(await canvas.tileToScreen(tile), 700);

    // Labels are outside the tile hit-test (ADR 0031 §4) AND the hit-proxy
    // swallows the press, so the canvas gesture machine can never see this hold
    // — the proxy has to own it. Before the fix the press vanished entirely: no
    // menu, and not even the hold-on-empty lasso fallback.
    await expect.poll(() => contextMenu(page), { timeout: 3_000 }).toEqual({
      variant: 'item',
      targetType: 'LABEL'
    });
  });

  test('control: the same hold on a NODE opens its item menu', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);
    const node = await setupNode(page, { x: 620, y: 300 });

    await touch.hold(await canvas.tileToScreen(node.tile), 700);
    await expect.poll(() => contextMenu(page), { timeout: 3_000 }).toEqual({
      variant: 'item',
      targetType: 'ITEM'
    });
  });
});

// ---------------------------------------------------------------------------
// TCH-12 — double-tap a text box
// ---------------------------------------------------------------------------
test.describe('double-tap a text box (TCH-12)', () => {
  test('opens the on-canvas editor, like the mouse double-click does', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);

    await canvas.placeTextBoxAt({ x: 620, y: 300 }, { text: 'hello' });
    await page.waitForTimeout(250);
    await clearCanvasForTouch(page);
    await page.keyboard.press('Escape');

    const tb = ((await activeView(page)).textBoxes ?? [])[0] as any;
    const pt = await canvas.tileToScreen(tb.tile);

    const f = await touch.fingers();
    await f.down(0, pt);
    await f.up(0);
    await f.down(0, pt);
    await f.up(0);
    await f.close();

    // Before the fix this opened the Details deck (ADR 0034 §1 says the text box
    // is edited on canvas), and touch had NO route into editing text at all.
    await expect
      .poll(() => editingTextBoxId(page), { timeout: 3_000 })
      .toBe(tb.id);
  });

  test('control: a mouse double-click opens the same editor', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);

    await canvas.placeTextBoxAt({ x: 620, y: 300 }, { text: 'hello' });
    await page.waitForTimeout(250);
    await clearCanvasForTouch(page);

    const tb = ((await activeView(page)).textBoxes ?? [])[0] as any;
    const pt = await canvas.tileToScreen(tb.tile);
    const box = await canvas.interactionsLayer().boundingBox();
    await page.mouse.dblclick(box!.x + pt.x, box!.y + pt.y);

    await expect
      .poll(() => editingTextBoxId(page), { timeout: 3_000 })
      .toBe(tb.id);
  });
});

// ---------------------------------------------------------------------------
// TCH-04 — pen hover
// ---------------------------------------------------------------------------
test.describe('pen hover (TCH-04)', () => {
  /**
   * A hover that never presses, as either device.
   *
   * Three points, not one: `Cursor`'s hover path is gated on `hasMovedTile`
   * (the "hover lags the cursor by one mousemove" known issue), so a single
   * move never updates `hoveredItem` — for the mouse either. A one-move version
   * of this reads as a pen bug and is a rig artifact.
   */
  const hoverAs = async (
    page: Page,
    pointerType: 'mouse' | 'pen',
    p: CanvasPoint
  ) => {
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
  };

  const hoveredItem = (page: Page) =>
    page.evaluate(() => {
      const h = (window as any).__axoview__.ui.getState().hoveredItem;
      return h ? { type: h.type as string, id: h.id as string } : null;
    });

  test('a hovering pen sets hoveredItem, like the mouse', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const node = await setupNode(page, { x: 500, y: 300 });
    const pt = await canvas.tileToScreen(node.tile);
    const box = await canvas.interactionsLayer().boundingBox();
    const abs = { x: box!.x + pt.x, y: box!.y + pt.y };

    // The pen is routed into the touch machine, which discards moves from a
    // pointer that never pressed — because a finger cannot hover. A pen can.
    await hoverAs(page, 'pen', abs);
    await expect.poll(() => hoveredItem(page), { timeout: 3_000 }).toEqual({
      type: 'ITEM',
      id: node.id
    });
  });

  test('control: a MOUSE hover over the same node sets it too', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const node = await setupNode(page, { x: 500, y: 300 });
    const pt = await canvas.tileToScreen(node.tile);
    const box = await canvas.interactionsLayer().boundingBox();

    await hoverAs(page, 'mouse', { x: box!.x + pt.x, y: box!.y + pt.y });
    await expect.poll(() => hoveredItem(page), { timeout: 3_000 }).toEqual({
      type: 'ITEM',
      id: node.id
    });
  });

  test('a hovering pen does not disturb the canvas mode', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);
    const node = await setupNode(page, { x: 500, y: 300 });
    const pt = await canvas.tileToScreen(node.tile);
    const box = await canvas.interactionsLayer().boundingBox();

    const before = await modeType(page);
    await hoverAs(page, 'pen', { x: box!.x + pt.x, y: box!.y + pt.y });
    expect(await modeType(page)).toBe(before);
    expect(await itemTiles(page)).toHaveLength(1);
  });
});
