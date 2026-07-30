/**
 * I4 characterizations — the passing half of each confirmed-bug pair.
 *
 * APPROACH's rig rule: `test.fail()` only distinguishes pass from fail, so a
 * probe that throws during setup reads as confirmed evidence. Every expected-
 * fail repro in `conn-01-15.explore.spec.ts` therefore has a test here that
 * positively asserts the OBSERVED end state. If one of these ever breaks, the
 * matching repro's evidence is stale.
 *
 * Pairs: CONN-02, CONN-04, CONN-07, CONN-10, CONN-11, CONN-13, CONN-15.
 * (CONN-01 keeps its characterization next to the repro.)
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { LayersPanelPOM } from '../../pom/LayersPanelPOM';
import { placeIconViaMouse } from '../../helpers/place';
import {
  getModelItemCount,
  getModelConnectorCount,
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

const connectors = async (page: Page) =>
  ((await activeView(page))?.connectors ?? []).map((c: any) => ({
    id: c.id as string,
    anchors: (c.anchors ?? []).map((a: any) => ({ id: a.id, ref: a.ref }))
  }));

const itemTiles = async (page: Page) =>
  ((await activeView(page))?.items ?? []).map((i: any) => ({
    id: i.id as string,
    tile: { x: i.tile.x as number, y: i.tile.y as number }
  }));

const absOfTile = async (canvas: CanvasPOM, tile: { x: number; y: number }) => {
  const rel = await canvas.tileToScreen(tile);
  const box = await canvas.interactionsLayer().boundingBox();
  return { x: box!.x + rel.x, y: box!.y + rel.y };
};

const setInteractionMode = (page: Page, mode: 'click' | 'drag') =>
  page.evaluate(
    (m) =>
      (window as any).__axoview__.ui
        .getState()
        .actions.setConnectorInteractionMode(m),
    mode
  );

async function twoNodes(page: Page) {
  await placeIconViaMouse(page, { x: 520, y: 280 });
  await placeIconViaMouse(page, { x: 800, y: 380 });
  await expect.poll(() => getModelItemCount(page), { timeout: 10_000 }).toBe(2);
  return itemTiles(page);
}

async function drawConnector(page: Page, canvas: CanvasPOM) {
  await page.keyboard.press('c');
  await canvas.clickAt({ x: 520, y: 280 });
  await page.waitForTimeout(150);
  await canvas.clickAt({ x: 800, y: 380 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('s');
}

// ---------------------------------------------------------------------------
test('CONN-02 characterization: the reconnect mode survives an off-canvas release', async ({
  app
}) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);
  await twoNodes(page);
  await drawConnector(page, canvas);
  await expect
    .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
    .toBe(1);

  const conn = (await connectors(page))[0];
  await page.evaluate(
    (args: { connectorId: string; anchorId: string }) => {
      const ui = (window as any).__axoview__.ui.getState();
      ui.actions.setItemControls({ type: 'CONNECTOR', id: args.connectorId });
      ui.actions.setMode({
        type: 'RECONNECT_ANCHOR',
        showCursor: true,
        connectorId: args.connectorId,
        anchorId: args.anchorId
      });
    },
    { connectorId: conn.id, anchorId: conn.anchors[0].id }
  );
  await expect
    .poll(() => modeType(page), { timeout: 3_000 })
    .toBe('RECONNECT_ANCHOR');

  const dock = page.locator('[data-axoview-id="dock-elements-toggle"]');
  const box = await dock.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, {
    steps: 6
  });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);

  // `ReconnectAnchor.mouseup` is gated on isRendererInteraction, so an
  // off-canvas release neither commits nor exits.
  expect(await modeType(page)).toBe('RECONNECT_ANCHOR');
});

// ---------------------------------------------------------------------------
test('CONN-04 characterization: the end anchor id changes on every tile move', async ({
  app
}) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);
  const tiles = await twoNodes(page);

  await page.keyboard.press('c');
  const a = await absOfTile(canvas, tiles[0].tile);
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(200);

  const ids: string[] = [];
  for (const t of [
    { x: tiles[0].tile.x + 1, y: tiles[0].tile.y },
    { x: tiles[0].tile.x + 2, y: tiles[0].tile.y },
    { x: tiles[0].tile.x + 3, y: tiles[0].tile.y }
  ]) {
    const p = await absOfTile(canvas, t);
    await page.mouse.move(p.x, p.y, { steps: 4 });
    await page.waitForTimeout(120);
    const c = (await connectors(page))[0];
    if (c?.anchors[1]) ids.push(c.anchors[1].id);
  }
  await page.keyboard.press('Escape');

  // eslint-disable-next-line no-console
  console.log(`CONN-04 characterization — ids ${JSON.stringify(ids)}`);
  expect(ids).toHaveLength(3);
  // A brand-new id per frame — nothing that captured the previous one survives.
  expect(new Set(ids).size).toBe(3);
});

// ---------------------------------------------------------------------------
test('CONN-07 characterization: drag mode leaves a zero-length connector on both anchors', async ({
  app
}) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);
  await placeIconViaMouse(page, { x: 520, y: 280 });
  await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);

  await setInteractionMode(page, 'drag');
  await page.keyboard.press('c');
  const empty = await absOfTile(canvas, { x: 5, y: 5 });
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);

  const cs = await connectors(page);
  // eslint-disable-next-line no-console
  console.log(
    `CONN-07 characterization — ${JSON.stringify(cs.map((c) => c.anchors.map((x: any) => x.ref)))}`
  );
  expect(cs).toHaveLength(1);
  // Both ends on the SAME empty tile: a connector with no length and no nodes.
  const refs = cs[0].anchors.map((x: any) => x.ref?.tile);
  expect(refs[0]).toEqual(refs[1]);
  expect(refs[0]).toEqual({ x: 5, y: 5 });
});

// ---------------------------------------------------------------------------
test('CONN-13 characterization: the stray empty click anchors the connector to a bare tile', async ({
  app
}) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);
  await placeIconViaMouse(page, { x: 520, y: 280 });
  await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
  const tiles = await itemTiles(page);

  await setInteractionMode(page, 'click');
  await page.keyboard.press('c');
  const a = await absOfTile(canvas, tiles[0].tile);
  await page.mouse.click(a.x, a.y);
  await expect
    .poll(() => getModelConnectorCount(page), { timeout: 3_000 })
    .toBe(1);

  const empty = await absOfTile(canvas, { x: 5, y: 5 });
  await page.mouse.click(empty.x, empty.y);
  await page.waitForTimeout(400);

  const cs = await connectors(page);
  // eslint-disable-next-line no-console
  console.log(
    `CONN-13 characterization — ${JSON.stringify(cs.map((c) => c.anchors.map((x: any) => x.ref)))}`
  );
  // The connector survives, half-attached: one end on the node, one on a tile.
  expect(cs).toHaveLength(1);
  expect(cs[0].anchors[0].ref).toEqual({ item: tiles[0].id });
  expect(cs[0].anchors[1].ref).toEqual({ tile: { x: 5, y: 5 } });
});

// ---------------------------------------------------------------------------
test('CONN-10 characterization: a self-loop is created and persists', async ({
  app
}) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);
  await placeIconViaMouse(page, { x: 620, y: 320 });
  await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
  const tiles = await itemTiles(page);

  await page.keyboard.press('c');
  const a = await absOfTile(canvas, tiles[0].tile);
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(200);
  await page.mouse.click(a.x, a.y);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  const cs = await connectors(page);
  // eslint-disable-next-line no-console
  console.log(
    `CONN-10 characterization — ${JSON.stringify(cs.map((c) => c.anchors.map((x: any) => x.ref)))}`
  );
  expect(cs).toHaveLength(1);
  const items = cs[0].anchors.map((x: any) => x.ref?.item);
  expect(items[0]).toBe(tiles[0].id);
  expect(items[1]).toBe(tiles[0].id);
  // And it validates clean — nothing downstream rejects it.
  await expectStoreInvariants(page, 'after creating a self-loop');
});

// ---------------------------------------------------------------------------
test('CONN-11 characterization: parallel connectors get byte-identical routes', async ({
  app
}) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);
  await twoNodes(page);
  await drawConnector(page, canvas);
  await expect
    .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
    .toBe(1);
  await drawConnector(page, canvas);
  await expect
    .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
    .toBe(2);

  const paths = await page.evaluate(() => {
    const scene = (window as any).__axoview__.scene.getState();
    return Object.entries(scene.connectors ?? {}).map(
      ([id, e]: [string, any]) => ({
        id,
        tiles: (e.path?.tiles ?? []).map((t: any) => `${t.x},${t.y}`).join('|')
      })
    );
  });
  // eslint-disable-next-line no-console
  console.log(`CONN-11 characterization — ${JSON.stringify(paths)}`);
  expect(paths).toHaveLength(2);
  // Identical routes: the two connectors are visually and clickably one line.
  expect(paths[0].tiles).toBe(paths[1].tiles);
  expect(paths[0].tiles.length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
test('CONN-15 characterization: the connector really binds to the locked node', async ({
  app
}) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);
  const tiles = await twoNodes(page);

  const layers = new LayersPanelPOM(page);
  await layers.open();
  await layers.addLayer();
  const layerName = (await activeView(page)).layers[0].name as string;
  await layers.dragItemToLayer(tiles[1].id, layerName);
  await layers.toggleLock(layerName);
  await page.waitForTimeout(300);

  await page.keyboard.press('c');
  const a = await absOfTile(canvas, tiles[0].tile);
  const b = await absOfTile(canvas, tiles[1].tile);
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(200);
  await page.mouse.click(b.x, b.y);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  const cs = await connectors(page);
  // eslint-disable-next-line no-console
  console.log(
    `CONN-15 characterization — locked ${tiles[1].id}; ${JSON.stringify(cs.map((c) => c.anchors.map((x: any) => x.ref)))}`
  );
  expect(cs).toHaveLength(1);
  expect(
    cs[0].anchors.some((x: any) => x.ref?.item === tiles[1].id),
    'the anchor binds to the node its layer says is locked'
  ).toBe(true);
});
