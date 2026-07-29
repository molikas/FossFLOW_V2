/**
 * I4 probes — anchor-handle entry, overlapping-connector disambiguation, label drag.
 *
 *  CONN-05  endpoint reconnect entry depends on a fragile tile match at low zoom
 *  CONN-06  Alt+click waypoint removal with two overlapping connectors
 *  CONN-12  dragging a connector's midpoint label
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { realDrag } from '../../helpers/offGrid';
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
    anchors: (c.anchors ?? []).map((a: any) => ({ id: a.id, ref: a.ref })),
    labels: c.labels ?? []
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

async function drawConnector(page: Page, canvas: CanvasPOM) {
  await page.keyboard.press('c');
  await canvas.clickAt({ x: 520, y: 280 });
  await page.waitForTimeout(150);
  await canvas.clickAt({ x: 820, y: 380 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('s');
}

async function twoNodesAndConnector(page: Page, canvas: CanvasPOM) {
  await placeIconViaMouse(page, { x: 520, y: 280 });
  await placeIconViaMouse(page, { x: 820, y: 380 });
  await expect.poll(() => getModelItemCount(page), { timeout: 10_000 }).toBe(2);
  await drawConnector(page, canvas);
  await expect
    .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
    .toBe(1);
  return { tiles: await itemTiles(page), connectors: await connectors(page) };
}

const selectConnector = async (page: Page, id: string) => {
  await page.evaluate((cid) => {
    (window as any).__axoview__.ui
      .getState()
      .actions.setItemControls({ type: 'CONNECTOR', id: cid });
  }, id);
  await page.waitForTimeout(250);
};

// ---------------------------------------------------------------------------
// CONN-05 — endpoint reconnect entry at low zoom
// ---------------------------------------------------------------------------
test.describe('CONN-05 — starting an endpoint reconnect at low zoom', () => {
  async function setupAtZoom(page: Page, canvas: CanvasPOM, zoom: number) {
    const setup = await twoNodesAndConnector(page, canvas);
    await selectConnector(page, setup.connectors[0].id);
    await page.evaluate(
      (z) => (window as any).__axoview__.ui.getState().actions.setZoom(z),
      zoom
    );
    await page.waitForTimeout(300);
    const conn = (await connectors(page))[0];
    const endpointNodeId = conn.anchors[0].ref?.item as string;
    const tiles = await itemTiles(page);
    const endpointTile = tiles.find((t) => t.id === endpointNodeId)!.tile;
    return { conn, endpointTile };
  }

  test('control: at the default zoom, pressing the endpoint starts a reconnect', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const { endpointTile } = await setupAtZoom(page, canvas, 0.65);

    const p = await absOfTile(canvas, endpointTile);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 70, p.y + 40, { steps: 8 });
    const mode = await modeType(page);
    await page.mouse.up();
    // eslint-disable-next-line no-console
    console.log(`CONN-05 control — mode while dragging the endpoint: ${mode}`);
    expect(['RECONNECT_ANCHOR', 'DRAG_ITEMS']).toContain(mode);
  });

  test('at a low zoom the same press still reaches the endpoint', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const { endpointTile } = await setupAtZoom(page, canvas, 0.2);

    const p = await absOfTile(canvas, endpointTile);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 70, p.y + 40, { steps: 8 });
    const mode = await modeType(page);
    await page.mouse.up();
    await page.waitForTimeout(200);

    // eslint-disable-next-line no-console
    console.log(`CONN-05 observed — mode at zoom 0.2: ${mode}`);
    expect(['RECONNECT_ANCHOR', 'DRAG_ITEMS']).toContain(mode);
    await expectStoreInvariants(page, 'after a low-zoom endpoint press');
  });
});

// ---------------------------------------------------------------------------
// CONN-06 — Alt+click waypoint removal with overlapping connectors
// ---------------------------------------------------------------------------
test.describe('CONN-06 — Alt+click on a waypoint shared by overlapping connectors', () => {
  test('the waypoint that is actually removed is the one under the cursor', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const setup = await twoNodesAndConnector(page, canvas);

    // A SECOND connector on exactly the same route (CONN-11 shows the paths
    // are identical).
    await drawConnector(page, canvas);
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
      .toBe(2);

    // Give connector #1 a waypoint by dragging its body.
    const mid = {
      x: Math.round((setup.tiles[0].tile.x + setup.tiles[1].tile.x) / 2),
      y: Math.round((setup.tiles[0].tile.y + setup.tiles[1].tile.y) / 2)
    };
    const from = await absOfTile(canvas, mid);
    await realDrag(page, from, { x: from.x + 15, y: from.y - 100 });
    await page.waitForTimeout(300);

    const withWaypoint = await connectors(page);
    const counts = withWaypoint.map((c) => c.anchors.length);
    // eslint-disable-next-line no-console
    console.log(`CONN-06 after the body drag — anchor counts ${JSON.stringify(counts)}`);
    const spliced = withWaypoint.find((c) => c.anchors.length === 3);
    expect(spliced, 'setup: one connector must have gained a waypoint').toBeTruthy();

    // Alt+click that waypoint's tile — it must be removed from the connector
    // that owns it.
    const wp = spliced!.anchors.find((a: any) => a.ref?.tile)!;
    const wpPoint = await absOfTile(canvas, wp.ref.tile);
    await page.keyboard.down('Alt');
    await page.mouse.click(wpPoint.x, wpPoint.y);
    await page.keyboard.up('Alt');
    await page.waitForTimeout(400);

    const after = await connectors(page);
    // eslint-disable-next-line no-console
    console.log(
      `CONN-06 observed — anchor counts after Alt+click ${JSON.stringify(after.map((c) => c.anchors.length))}; waypoint tile ${JSON.stringify(wp.ref.tile)}`
    );
    const target = after.find((c) => c.id === spliced!.id)!;
    expect(target.anchors.length).toBe(2);
    await expectStoreInvariants(page, 'after alt+click waypoint removal');
  });
});

// ---------------------------------------------------------------------------
// CONN-12 — dragging a connector's midpoint label
// ---------------------------------------------------------------------------
test.describe('CONN-12 — repositioning a connector label', () => {
  test('dragging a connector label moves it along the path', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const setup = await twoNodesAndConnector(page, canvas);
    const conn = setup.connectors[0];

    // Add a label through the context menu (the only creation surface).
    const mid = {
      x: Math.round((setup.tiles[0].tile.x + setup.tiles[1].tile.x) / 2),
      y: Math.round((setup.tiles[0].tile.y + setup.tiles[1].tile.y) / 2)
    };
    const midPoint = await absOfTile(canvas, mid);
    await page.mouse.move(midPoint.x, midPoint.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(300);

    const addLabel = page.locator(
      'li:has(svg[data-testid="NewLabelOutlinedIcon"])'
    );
    const menuVisible = await addLabel.isVisible().catch(() => false);
    // eslint-disable-next-line no-console
    console.log(`CONN-12 setup — "Add label" menu item visible: ${menuVisible}`);
    expect(menuVisible, 'setup: the connector context menu must offer Add label').toBe(
      true
    );
    await addLabel.click();
    await page.waitForTimeout(400);

    const labelled = (await connectors(page)).find((c) => c.id === conn.id)!;
    // eslint-disable-next-line no-console
    console.log(
      `CONN-12 label created — ${JSON.stringify(labelled.labels.map((l: any) => ({ id: l.id, position: l.position, height: l.height })))}`
    );
    expect(labelled.labels.length).toBeGreaterThan(0);

    // The label is created EMPTY and drops into an inline editor; an empty
    // label is discarded on cancel, so give it text and commit before probing
    // the drag (otherwise the label is gone before the gesture starts).
    await page.keyboard.type('lbl', { delay: 20 });
    await page.waitForTimeout(150);
    await page.mouse.click(midPoint.x + 300, midPoint.y - 220);
    await page.waitForTimeout(350);

    const committed = (await connectors(page)).find((c) => c.id === conn.id)!;
    // eslint-disable-next-line no-console
    console.log(
      `CONN-12 after commit — labels ${JSON.stringify(committed.labels.map((l: any) => ({ id: l.id, text: l.text, position: l.position, height: l.height })))}`
    );
    expect(
      committed.labels.length,
      'setup: the label must survive its own creation'
    ).toBeGreaterThan(0);
    const before = committed.labels[0];

    const chip = page.locator('[data-connector-label-id]').first();
    const chipVisible = await chip.isVisible().catch(() => false);
    // eslint-disable-next-line no-console
    console.log(`CONN-12 — label chip addressable in the DOM: ${chipVisible}`);
    if (!chipVisible) {
      // Fall back to dragging at the label's path position.
      await realDrag(page, midPoint, { x: midPoint.x + 90, y: midPoint.y + 50 });
    } else {
      const box = await chip.boundingBox();
      await realDrag(
        page,
        { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
        { x: box!.x + box!.width / 2 + 90, y: box!.y + box!.height / 2 + 50 }
      );
    }
    await page.waitForTimeout(400);

    const afterConn = (await connectors(page)).find((c) => c.id === conn.id);
    const after = afterConn?.labels?.[0];
    // eslint-disable-next-line no-console
    console.log(
      `CONN-12 observed — before ${JSON.stringify({ position: before.position, height: before.height })}; after ${JSON.stringify(after ? { position: after.position, height: after.height } : null)}; label count ${afterConn?.labels?.length}`
    );
    // The label must survive the gesture...
    expect(after, 'the drag must not destroy the label').toBeTruthy();
    // ...and have actually moved.
    expect(
      after.position !== before.position || after.height !== before.height
    ).toBe(true);
  });
});
