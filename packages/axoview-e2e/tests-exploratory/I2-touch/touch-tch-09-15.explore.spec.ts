/**
 * I2 probes — touch parity with the mouse for entity types and modes.
 *
 *  TCH-10  touch drag onto an occupied tile vs the mouse's collision rejection
 *  TCH-11  touch drag in EXPLORABLE_READONLY
 *  TCH-13  drawing a connector by touch (click-to-connect)
 *  TCH-15  long-press a connector
 *
 * All FALSIFIED — the forwarded-mouse-event design carries the mouse semantics
 * faithfully; kept as characterization.
 *
 * PROMOTED OUT — wave 3 fixed TCH-09 (the label hit-proxy owns its own touch
 * long-press, so a chip's item menu is reachable) and TCH-12 (the double-TAP
 * mirrors `onDoubleClick`, so a text box opens its on-canvas editor). Their
 * legs moved to `tests/touch-gesture-interrupts.spec.ts`.
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
  getModelItemCount,
  getModelConnectorCount,
  getItemControls,
  getUiMode
} from '../../helpers/store';

type Page = import('@playwright/test').Page;

const modeType = async (page: Page) => (await getUiMode(page))?.type ?? null;

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

const contextMenu = (page: Page) =>
  page.evaluate(() => {
    const cm = (window as any).__axoview__.ui.getState().contextMenu;
    return cm
      ? { variant: cm.variant as string, targetType: cm.target?.type ?? null }
      : null;
  });

const editingTextBoxId = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().editingTextBoxId ?? null
  );

// ---------------------------------------------------------------------------
// TCH-10 — touch drag onto an occupied tile
// ---------------------------------------------------------------------------
test.describe('TCH-10 — touch drag onto an occupied tile', () => {
  test('the collision rejection the mouse honours also applies to touch', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);

    await placeIconViaMouse(page, { x: 520, y: 300 });
    await placeIconViaMouse(page, { x: 760, y: 300 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);
    await clearCanvasForTouch(page);

    const before = await itemTiles(page);
    const from = await canvas.tileToScreen(before[0].tile);
    const onto = await canvas.tileToScreen(before[1].tile);

    await touch.dragOneFinger(from, onto, 10);
    await page.waitForTimeout(300);

    const after = await itemTiles(page);
    // eslint-disable-next-line no-console
    console.log(
      `TCH-10 observed — ${JSON.stringify(before)} -> ${JSON.stringify(after)}`
    );
    // Neither node may end up sharing a tile.
    const tiles = after.map((i) => `${i.tile.x},${i.tile.y}`);
    expect(new Set(tiles).size).toBe(tiles.length);
    await expectStoreInvariants(page, 'after touch collision drag');
  });
});

// ---------------------------------------------------------------------------
// TCH-11 — touch in EXPLORABLE_READONLY
// ---------------------------------------------------------------------------
test.describe('TCH-11 — touch drag in read-only mode', () => {
  test('a one-finger drag on a node must not move it in a read-only diagram', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);

    await placeIconViaMouse(page, { x: 600, y: 300 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
    await clearCanvasForTouch(page);

    await page.evaluate(() => {
      const ui = (window as any).__axoview__.ui.getState();
      ui.actions.setEditorMode('EXPLORABLE_READONLY');
      ui.actions.setMode({ type: 'PAN', showCursor: false });
    });
    await page.waitForTimeout(150);

    const before = await itemTiles(page);
    const from = await canvas.tileToScreen(before[0].tile);
    await touch.dragOneFinger(from, { x: from.x + 220, y: from.y + 90 }, 10);
    await page.waitForTimeout(300);

    const after = await itemTiles(page);
    // eslint-disable-next-line no-console
    console.log(
      `TCH-11 observed — mode ${await modeType(page)}; ${JSON.stringify(before)} -> ${JSON.stringify(after)}`
    );
    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// TCH-13 — drawing a connector by touch
// ---------------------------------------------------------------------------
test.describe('TCH-13 — draw a connector by touch', () => {
  test('tap node A then node B in CONNECTOR mode creates one connector', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);

    await placeIconViaMouse(page, { x: 520, y: 280 });
    await placeIconViaMouse(page, { x: 800, y: 380 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);
    await clearCanvasForTouch(page);

    const tiles = await itemTiles(page);
    await page.keyboard.press('c');
    await expect
      .poll(() => modeType(page), { timeout: 3_000 })
      .toBe('CONNECTOR');

    await touch.tapTile(tiles[0].tile);
    await page.waitForTimeout(200);
    const afterFirst = await getModelConnectorCount(page);
    await touch.tapTile(tiles[1].tile);
    await page.waitForTimeout(400);

    const connectors = ((await activeView(page))?.connectors ?? []) as any[];
    // eslint-disable-next-line no-console
    console.log(
      `TCH-13 observed — after tap 1: ${afterFirst}; final: ${JSON.stringify(connectors.map((c) => ({ id: c.id, anchors: c.anchors?.map((a: any) => a.ref) })))}`
    );

    // Exactly one connector, joining the two DIFFERENT nodes.
    expect(connectors).toHaveLength(1);
    const anchorItems = connectors[0].anchors
      .map((a: any) => a.ref?.item)
      .filter(Boolean);
    expect(new Set(anchorItems).size).toBe(2);
    await expectStoreInvariants(page, 'after touch connector draw');
  });
});

// ---------------------------------------------------------------------------
// TCH-15 — long-press a connector
// ---------------------------------------------------------------------------
test.describe('TCH-15 — long-press on a connector', () => {
  test('holding a connector opens its item menu', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const touch = new TouchPOM(page, canvas);

    await placeIconViaMouse(page, { x: 520, y: 280 });
    await placeIconViaMouse(page, { x: 800, y: 380 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);

    const tiles = await itemTiles(page);
    await page.keyboard.press('c');
    await canvas.clickAt({ x: 520, y: 280 });
    await page.waitForTimeout(150);
    await canvas.clickAt({ x: 800, y: 380 });
    await page.keyboard.press('Escape');
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
      .toBe(1);
    await clearCanvasForTouch(page);

    // A tile the connector's path passes through: midway between the anchors.
    const mid = {
      x: Math.round((tiles[0].tile.x + tiles[1].tile.x) / 2),
      y: Math.round((tiles[0].tile.y + tiles[1].tile.y) / 2)
    };
    await touch.hold(await canvas.tileToScreen(mid), 700);
    await page.waitForTimeout(200);

    const menu = await contextMenu(page);
    // eslint-disable-next-line no-console
    console.log(`TCH-15 observed — mid tile ${JSON.stringify(mid)}; menu ${JSON.stringify(menu)}`);
    expect(menu).toEqual({ variant: 'item', targetType: 'CONNECTOR' });
  });
});
